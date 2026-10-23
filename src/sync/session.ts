// The conversation with one reface DX (or the fake one), as Phase 0 found it works (docs/FINDINGS.md):
// - Connect: a SYSTEM dump request is the presence check and gives the channels, MIDI Control and Local
//   (Q11); the Identity Request (device byte 00, Q11) gives the version; then the voice being edited (Q4).
// - Edits go out as Parameter Changes (ParamSender); only loading a voice sends all 7 blocks, which cuts
//   sounding notes (Q7).
// - From the DX: a Program Change when a voice is chosen on its panel (Q9), FM-section moves as CCs with MIDI
//   Control on, FREQ as three at once (Q5). Other panel edits send nothing: Resync reads the voice again.
// - Notes and Program Changes go to RV CH (channel 1 when it is "all"); the DX sends on TR CH.
import type { MidiTransport } from '../midi/transport'
import { ccToParameter } from '../params/cc'
import { VoiceAssembler, voiceToMessages, type Voice } from '../sysex/codec'
import { ADDRESS, dumpRequest, identityRequest, sameAddress, type Address, type DxSysex } from '../sysex/messages'
import { ParamSender } from './paramSender'
import { Requests, type AskOptions } from './requests'

/** FREQ arrives as mode + coarse + fine CCs within ~2 ms (Q5): CCs this close together are one panel change. */
export const CC_GATHER_MS = 8
/** The DX took 32 Parameter Changes back to back (Q7); bigger batches (Init, a far undo) go out in chunks this
 *  size, BATCH_PAUSE_MS apart. Nobody has tried more at once. */
export const BATCH_SIZE = 32
export const BATCH_PAUSE_MS = 10

export interface SessionEvents {
  /** The DX selected location 0–31 on its panel; the session reads the voice next. */
  onProgram?(program: number): void
  /** The voice was read again after a Program Change from the DX. */
  onVoice?(voice: Voice): void
  /** FM-section moves on the DX, gathered (a FREQ step is one call with three changes). */
  onPanel?(changes: [Address, number][]): void
  /** Keys played on the DX (velocity 0 = released). */
  onNote?(note: number, velocity: number): void
}

export interface Connected {
  system: Uint8Array
  /** Identity Reply byte 10 (03 on firmware 1.30), or null if it didn't answer */
  version: number | null
  voice: Voice
}

export class Session {
  readonly requests: Requests
  readonly sender: ParamSender
  system: Uint8Array | null = null
  private gathered: [Address, number][] = []
  private gatherTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private batches: Promise<void> = Promise.resolve()

  constructor(
    private readonly transport: MidiTransport,
    private readonly events: SessionEvents = {},
  ) {
    this.requests = new Requests(transport, (m) => this.receive(m))
    this.sender = new ParamSender({ send: (m) => transport.send(m) })
  }

  /** The channel notes and Program Changes go to: RV CH, or 1 when it is "all". */
  get playChannel() {
    const rx = this.system?.[0x01] ?? 0
    return rx < 16 ? rx : 0
  }

  /** The DX's own channel for what it sends, or null when TR CH is off. */
  get listenChannel(): number | null {
    const tx = this.system?.[0x00] ?? 0x7f
    return tx < 16 ? tx : null
  }

  /** Reads SYSTEM, the version and the voice; null if no DX answers. */
  async connect(): Promise<Connected | null> {
    // The DX answers SYSTEM in ~3 ms: a short single try keeps "no DX" quick.
    const system = await this.readSystem({ timeoutMs: 800, graceMs: 300, attempts: 1 })
    if (!system) return null
    const id = await this.requests.ask(identityRequest(0), (s) => s.kind === 'identityReply', { timeoutMs: 500, attempts: 1 })
    const voice = await this.readVoice()
    if (!voice) return null
    return { system, version: id?.kind === 'identityReply' ? id.version : null, voice }
  }

  async readSystem(opts?: AskOptions): Promise<Uint8Array | null> {
    const s = await this.requests.ask(dumpRequest(0, ADDRESS.system), (s) => s.kind === 'bulk' && sameAddress(s.address, ADDRESS.system) && s.checksumOk, opts)
    if (s?.kind !== 'bulk') return null
    this.system = s.data
    return s.data
  }

  /** The voice being edited on the DX, edits included (Q4). Waits for edits still going out first. */
  async readVoice(): Promise<Voice | null> {
    this.sender.flush()
    const asm = new VoiceAssembler()
    const got: { voice: Voice | null } = { voice: null }
    // The match collects the 7 blocks and accepts the footer that completes a voice.
    const collect = (s: DxSysex) => s.kind === 'bulk' && (got.voice = asm.add(s)) !== null
    const reply = await this.requests.ask(dumpRequest(0, ADDRESS.bulkHeader), collect)
    return reply ? got.voice : null
  }

  /** An edit: goes out as a Parameter Change (coalesced per parameter). */
  sendValue(address: Address, data: number[]) {
    this.sender.push(address, data)
  }

  /** Many changes at once (Init, undo across many values), as Parameter Changes: up to BATCH_SIZE at once, more in
   *  paced chunks. Batches go out in order, so an undo right after an Init can't overtake it. */
  sendBatch(changes: [Address, number[]][]): Promise<void> {
    const run = async () => {
      for (let i = 0; i < changes.length && !this.closed; i += BATCH_SIZE) {
        if (i) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
        for (const [a, d] of changes.slice(i, i + BATCH_SIZE)) this.sender.push(a, d)
      }
    }
    this.batches = this.batches.then(run, run)
    return this.batches
  }

  /** A whole voice into the DX's edit buffer (7 blocks). Cuts sounding notes; never stores (Q2). */
  sendVoice(voice: Voice) {
    this.sender.flush()
    for (const m of voiceToMessages(0, voice)) this.transport.send(m)
  }

  /** Selects stored location 0–31 on the DX and reads it (the DX holds the read until it has loaded, Q8). */
  async selectProgram(program: number): Promise<Voice | null> {
    this.sender.clear()
    this.transport.send(Uint8Array.of(0xc0 | this.playChannel, program & 0x1f))
    return this.readVoice()
  }

  /** A SYSTEM setting, live (Q11). */
  setSystem(offset: number, value: number) {
    this.system?.set([value], offset)
    this.sender.push([0x00, 0x00, offset], [value])
  }

  noteOn(note: number, velocity: number) {
    this.transport.send(Uint8Array.of(0x90 | this.playChannel, note & 0x7f, velocity & 0x7f))
  }

  noteOff(note: number) {
    this.transport.send(Uint8Array.of(0x80 | this.playChannel, note & 0x7f, 0))
  }

  /** Any channel message to RV CH: mod wheel, pitch bend, sustain, all notes off. */
  sendChannel(status: number, a: number, b?: number) {
    const m = b === undefined ? [status | this.playChannel, a] : [status | this.playChannel, a, b]
    this.transport.send(Uint8Array.from(m))
  }

  close() {
    this.closed = true
    this.sender.clear()
    if (this.gatherTimer) clearTimeout(this.gatherTimer)
    this.requests.close()
  }

  private receive(m: Uint8Array) {
    if (this.closed || m[0] === 0xf0) return
    const status = m[0] & 0xf0
    const ch = m[0] & 0x0f
    if (status === 0x90 || status === 0x80) return this.events.onNote?.(m[1], status === 0x90 ? m[2] : 0)
    if (ch !== this.listenChannel) return
    if (status === 0xc0 && m[1] < 32) {
      this.sender.clear()
      this.events.onProgram?.(m[1])
      void this.readVoice().then((v) => v && !this.closed && this.events.onVoice?.(v))
    } else if (status === 0xb0) {
      const p = ccToParameter(m[1], m[2])
      if (!p || this.sender.recentlySent(p.address)) return
      this.gathered.push([p.address, p.value])
      this.gatherTimer ??= setTimeout(() => {
        const changes = this.gathered
        this.gathered = []
        this.gatherTimer = null
        if (!this.closed) this.events.onPanel?.(changes)
      }, CC_GATHER_MS)
    }
  }
}

/** The DX answered nothing: what to check. */
export const NOT_FOUND =
  'No reface DX answered. Check that the DX is on and connected (USB, or MIDI in and out), and that the right MIDI ports are chosen.'
