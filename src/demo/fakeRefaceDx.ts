// A pretend reface DX behind the MidiTransport interface, for tests and ?demo. It behaves like the real one
// as far as Phase 0 found (docs/FINDINGS.md, 2026-10-23), where that differs from the Data List:
// - SysEx with any device number is taken; replies always carry device 0 (Q1).
// - The Identity Request is answered for device byte 0n only, not 7F; the version byte is 03 (Q11).
// - A dump request returns the voice being edited, edits included (Q4). Right after a Program Change it
//   is held until the new voice has loaded (Q8).
// - A Parameter Request is answered with a Parameter Change (Q11 notes); a Parameter Change edits the voice
//   or SYSTEM at once (Q7, Q11).
// - A voice bulk only lands when framed by header and footer; blocks it leaves out are reset (Q7). It goes
//   into the voice being edited, never into memory (Q2). A lone block is ignored.
// - Nothing is echoed (Q6).
// - At the panel: selecting a voice sends a Program Change on TR CH (Q9); FM-section moves send CCs, FREQ as
//   mode + coarse + fine, only with MIDI Control on (Q5); other edits and STORE send nothing (Q3, Q5).
// Received FM CCs follow the Data List (not probed).
import type { MidiTransport } from '../midi/transport'
import { ccFor, ccToParameter, ccValueFor, fmAddress, type FmCc } from '../params/cc'
import { RESET_OPERATOR, INIT_COMMON } from '../params/init'
import { defaultSystem } from '../params/system'
import { cloneVoice, setVoiceValues, voiceToMessages, voiceValueAt, type Voice } from '../sysex/codec'
import { ADDRESS, bulkBlock, IDENTITY_REPLY, parameterChange, parseSysex, sameAddress, SIZE, type Address } from '../sysex/messages'
import { DEMO_VOICES } from './demoVoices'

export interface FakeOptions {
  /** TR CH and RV CH, 0–15 (RV 16 = all). Default 15 and 15, as on the test DX. */
  txChannel?: number
  rxChannel?: number
  /** Reply time for requests (the real one over USB: ~3 ms for a parameter, ~18 ms for a voice). */
  replyMs?: number
  /** How long a Program Change takes to load the voice (the real one: ~200 ms, Q8). */
  loadMs?: number
  midiControl?: boolean
}

const VERSION = 0x03

export class FakeRefaceDx implements MidiTransport {
  /** Locations 1-1 … 4-8. */
  readonly stored: Voice[]
  /** The voice being edited (what plays and what a dump request returns). */
  edit: Voice
  /** The location selected (Program Change 0–31). */
  program = 0
  readonly system: Uint8Array
  replyMs: number
  loadMs: number
  private loadedAt = 0
  private pending: { common: Uint8Array | null; ops: (Uint8Array | null)[] } | null = null
  private listeners = new Set<(m: Uint8Array) => void>()

  constructor(opts: FakeOptions = {}) {
    this.stored = Array.from({ length: 32 }, (_, i) => cloneVoice(DEMO_VOICES[i % DEMO_VOICES.length]))
    this.edit = cloneVoice(this.stored[0])
    this.system = defaultSystem(opts.txChannel ?? 15, opts.rxChannel ?? 15)
    this.system[0x0e] = opts.midiControl === false ? 0 : 1
    this.replyMs = opts.replyMs ?? 15
    this.loadMs = opts.loadMs ?? 200
  }

  get txChannel() { return this.system[0x00] }
  get rxChannel() { return this.system[0x01] }
  get midiControl() { return this.system[0x0e] === 1 }

  // ---- what the editor sends ----

  send(m: Uint8Array) {
    if (m[0] === 0xf0) return this.receiveSysex(m)
    const status = m[0] & 0xf0
    const ch = m[0] & 0x0f
    if (this.rxChannel !== 16 && ch !== this.rxChannel) return
    if (status === 0xc0 && m[1] < 32) this.load(m[1])
    else if (status === 0xb0 && this.midiControl) {
      const p = ccToParameter(m[1], m[2])
      if (p) setVoiceValues(this.edit, p.address, [p.value])
    }
  }

  subscribe(listener: (m: Uint8Array) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private receiveSysex(m: Uint8Array) {
    // Identity Request: only F0 7E 0n 06 01 F7 (Q11).
    if (m[1] === 0x7e && m[3] === 0x06 && m[4] === 0x01) {
      if (m[2] < 0x10) this.reply(IDENTITY_REPLY.map((b, i) => (i === 10 ? VERSION : b)))
      return
    }
    const s = parseSysex(m)
    if (!s) return
    if (s.kind === 'dumpRequest') {
      if (sameAddress(s.address, ADDRESS.bulkHeader)) {
        const voice = cloneVoice(this.edit)
        const wait = Math.max(this.replyMs, this.loadedAt - Date.now() + this.replyMs)
        for (const block of voiceToMessages(0, voice)) this.reply(block, wait)
      } else if (sameAddress(s.address, ADDRESS.system)) this.reply(bulkBlock(0, ADDRESS.system, this.system))
    } else if (s.kind === 'parameterRequest') {
      const value = this.valueAt(s.address)
      if (value !== undefined) this.reply(parameterChange(0, s.address, [value]), Math.min(this.replyMs, 3))
    } else if (s.kind === 'parameterChange') {
      if (s.address[0] === 0x00 && s.address[1] === 0x00) {
        if (s.address[2] + s.data.length <= SIZE.system) this.system.set(s.data, s.address[2])
      } else setVoiceValues(this.edit, s.address, s.data.slice(0, 1)) // the voice takes one byte per change, like the DX
    } else if (s.kind === 'bulk' && s.checksumOk) this.receiveBlock(s.address, s.data)
  }

  private receiveBlock(a: Address, data: Uint8Array) {
    if (sameAddress(a, ADDRESS.bulkHeader)) this.pending = { common: null, ops: [null, null, null, null] }
    else if (!this.pending) return // a lone block is ignored (Q7)
    else if (sameAddress(a, ADDRESS.common) && data.length === SIZE.common) this.pending.common = data
    else if (a[0] === 0x31 && a[1] < 4 && a[2] === 0 && data.length === SIZE.operator) this.pending.ops[a[1]] = data
    else if (sameAddress(a, ADDRESS.bulkFooter)) {
      // Blocks left out are reset (Q7: seen for operators; assumed for the Common block).
      const { common, ops } = this.pending
      this.edit = {
        common: Uint8Array.from(common ?? INIT_COMMON),
        ops: ops.map((o) => Uint8Array.from(o ?? RESET_OPERATOR)) as Voice['ops'],
      }
      this.pending = null
    }
  }

  private valueAt(a: Address): number | undefined {
    if (a[0] === 0x00 && a[1] === 0x00) return a[2] < SIZE.system ? this.system[a[2]] : undefined
    return voiceValueAt(this.edit, a)
  }

  private load(program: number) {
    this.program = program
    this.edit = cloneVoice(this.stored[program])
    this.loadedAt = Date.now() + this.loadMs
  }

  private reply(m: Uint8Array, ms = this.replyMs) {
    const copy = Uint8Array.from(m)
    setTimeout(() => this.emit(copy), ms)
  }

  private emit(m: Uint8Array) {
    for (const l of this.listeners) l(m)
  }

  // ---- what someone does at the panel (tests and the demo) ----

  /** A voice chosen with BANK and 1–8: it loads, and a Program Change goes out on TR CH (Q9). */
  selectAtPanel(program: number) {
    this.load(program)
    if (this.txChannel !== 0x7f) this.emit(Uint8Array.of(0xc0 | this.txChannel, program))
  }

  /** An FM-section knob (FREQ, LEVEL, ALGO, FB): changes the voice; with MIDI Control on, CCs go out (Q5).
   *  For FREQ pass mode, coarse and fine together, as the DX sends them. */
  turnFm(op: number | undefined, values: Partial<Record<FmCc['key'], number>>) {
    for (const [key, raw] of Object.entries(values) as [FmCc['key'], number][]) {
      setVoiceValues(this.edit, fmAddress(key, op), [raw])
      if (this.midiControl && this.txChannel !== 0x7f) this.emit(Uint8Array.of(0xb0 | this.txChannel, ccFor(key, key === 'algorithm' ? undefined : op), ccValueFor(key, raw)))
    }
  }

  /** Any other edit on the panel (Edit mode, effects, name): changes the voice, sends nothing (Q5). */
  editAtPanel(address: Address, value: number) {
    setVoiceValues(this.edit, address, [value])
  }

  /** STORE on the panel: the voice being edited goes into a location; nothing is sent (Q3). */
  storeAtPanel(program: number) {
    this.stored[program] = cloneVoice(this.edit)
    this.program = program
  }
}
