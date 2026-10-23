// The editor's state: the connection, the voice being edited (as the DX has it), and what was last read
// from the DX (the baseline: "Edited" means the voice differs from it). After nord-lead-2-editor's store.
import { create } from 'zustand'
import { FakeRefaceDx } from '../demo/fakeRefaceDx'
import { findPorts, portNames, requestWebMidi, webMidiTransport, webMidiUnavailable, type MidiTransport } from '../midi/transport'
import { addressKey, addressLabel } from '../params/address'
import { cloneVoice, diffVoices, locationName, setVoiceValues, voiceChanges, voiceName, voiceValueAt, type Voice } from '../sysex/codec'
import type { Address } from '../sysex/messages'
import { History } from '../sync/history'
import { initVoice } from '../params/init'
import { NOT_FOUND, Session } from '../sync/session'

// ---- settings (localStorage) ----
const SETTINGS_KEY = 'reface-dx-editor.settings'

export interface Settings {
  input?: string
  output?: string
}

function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // private mode: settings last for this visit
  }
}

export type Status = 'offline' | 'connecting' | 'connected' | 'demo' | 'notfound' | 'lost'

/** A change as the store takes it: one address, its data (one byte; ten for the name). */
export type Change = [Address, number[]]

export interface EditorState {
  status: Status
  message: string | null
  ports: { inputs: string[]; outputs: string[] }
  settings: Settings
  /** the voice being edited, as the DX has it */
  voice: Voice | null
  /** the voice as last read from the DX (or loaded into it): "Edited" when `voice` differs */
  baseline: Voice | null
  /** the location 1-1 … 4-8 as 0–31, once known: a Program Change from the DX or a voice picked here.
   *  No request returns it, so right after connecting it is unknown. */
  program: number | null
  system: Uint8Array | null
  /** Identity Reply byte 10 (03 = firmware 1.30) */
  version: number | null
  /** the addresses the DX's panel last changed (a FREQ step: three), for a moment's highlight */
  touched: string[]
  undoLabel: string | null
  redoLabel: string | null
  /** the voice whose edits a voice change on the DX replaced: it can be sent back */
  replaced: Voice | null
  /** the operator the panel focuses (EG graph, algorithm highlight), 0–3 */
  focusOp: number
  /** keys held on the DX, with their velocity */
  synthNotes: Map<number, number>
  /** the velocity of the last note played, here or on the DX */
  lastVelocity: number | null
  /** the on-screen mod wheel, 0–127 (CC 1) */
  modWheel: number
  reading: boolean
  /** the demo's pretend DX, for poking at from the console */
  fake: FakeRefaceDx | null

  connect(): Promise<void>
  startDemo(): Promise<void>
  disconnect(): void
  choosePorts(names: { input?: string; output?: string }): void
  resync(): Promise<void>
  /** Selects stored location 0–31 on the DX and reads it. */
  selectProgram(program: number): Promise<void>
  /** Puts a voice into the DX (all 7 blocks: cuts sounding notes) and edits it from there. */
  loadVoice(voice: Voice): void
  /** An edit from the editor: goes to the DX as Parameter Changes, as one undo step called `label`. */
  setValues(changes: Change[], label: string, key?: string): void
  setValue(address: Address, value: number): void
  setSystemValue(offset: number, value: number): void
  beginGesture(): void
  endGesture(): void
  undo(): void
  redo(): void
  /** The DX's VOICE INIT sound (a sine), as one undo step: only what differs goes out, as Parameter Changes. */
  init(): void
  focusOperator(op: number): void
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  /** Note Off for every note the editor holds. */
  releaseNotes(): void
  setModWheel(value: number): void
  sendChannel(status: number, a: number, b?: number): void
}

let access: MIDIAccess | null = null
let session: Session | null = null
let transport: MidiTransport | null = null
const history = new History()
let touchTimer: ReturnType<typeof setTimeout> | null = null
/** notes the editor holds down, so none hangs */
const held = new Set<number>()

const ONLINE: Status[] = ['connected', 'demo']

export const useEditor = create<EditorState>((set, get) => {
  /** Undo/redo labels into the store. */
  const labels = () => set({ undoLabel: history.undoLabel, redoLabel: history.redoLabel })

  /** A voice read from the DX (or loaded into it) becomes what is edited and the baseline; undo starts over. */
  const takeVoice = (voice: Voice, program: number | null = get().program) => {
    history.reset()
    set({ voice, baseline: cloneVoice(voice), program, reading: false })
    labels()
  }

  const startSession = async (t: MidiTransport, status: 'connected' | 'demo') => {
    session?.close()
    transport = t
    const s = new Session(t, {
      onProgram: (program) => {
        const { voice, baseline } = get()
        // The DX dropped the edits for the new voice; keep them so they can go back.
        const edited = voice && baseline && diffVoices(baseline, voice).length > 0
        set({ program, reading: true, replaced: edited ? voice : null, message: edited ? `The DX switched to ${locationName(program)}. Your edits to “${voiceName(voice!)}” are kept here.` : null })
      },
      onVoice: (voice) => takeVoice(voice),
      onPanel: (changes) => {
        const voice = get().voice
        if (!voice) return
        // FREQ comes as mode + coarse + fine (Q5): one step, named for what was turned.
        const [first] = changes
        const freq = first[0][0] === 0x31 && changes.some(([a]) => a[2] === 0x16 || a[2] === 0x17)
        const what = freq ? `OP${first[0][1] + 1} frequency` : addressLabel(first[0])
        history.record(voice, `panel:${freq ? `freq${first[0][1]}` : addressKey(first[0])}`, `${what} on the DX`)
        const next = cloneVoice(voice)
        for (const [a, v] of changes) setVoiceValues(next, a, [v])
        set({ voice: next, touched: changes.map(([a]) => addressKey(a)) })
        labels()
        if (touchTimer) clearTimeout(touchTimer)
        touchTimer = setTimeout(() => set({ touched: [] }), 600)
      },
      onNote: (note, velocity) => {
        const notes = new Map(get().synthNotes)
        if (velocity) notes.set(note, velocity)
        else notes.delete(note)
        set({ synthNotes: notes, ...(velocity ? { lastVelocity: velocity } : {}) })
      },
    })
    session = s
    set({ status: 'connecting', message: null, reading: true })
    const c = await s.connect()
    if (session !== s) return
    if (!c) {
      set({ status: 'notfound', message: NOT_FOUND, reading: false })
      return
    }
    set({ status, system: c.system, version: c.version, program: null, replaced: null })
    takeVoice(c.voice, null)
    const mc = c.system[0x0e] === 1
    if (status === 'connected' && !mc) set({ message: 'MIDI Control is off on the DX, so knob moves there don’t reach the editor. Turn it on in the connection menu (top right).' })
  }

  return {
    status: 'offline',
    message: null,
    ports: { inputs: [], outputs: [] },
    settings: loadSettings(),
    voice: null,
    baseline: null,
    program: null,
    system: null,
    version: null,
    touched: [],
    undoLabel: null,
    redoLabel: null,
    replaced: null,
    focusOp: 0,
    synthNotes: new Map(),
    lastVelocity: null,
    modWheel: 0,
    reading: false,
    fake: null,

    async connect() {
      const unavailable = webMidiUnavailable()
      if (unavailable) return set({ status: 'offline', message: unavailable })
      set({ status: 'connecting', message: null, fake: null })
      try {
        access ??= await requestWebMidi()
      } catch (err) {
        return set({ status: 'offline', message: `No MIDI access: ${(err as Error).message}. Allow MIDI (with SysEx) for this page in the browser.` })
      }
      const ports = portNames(access)
      set({ ports })
      const pair = findPorts(access, get().settings)
      if (!pair) return set({ status: 'notfound', message: 'No MIDI ports. Connect the DX (USB, or MIDI in and out) and try again.' })
      const settings = { input: pair.input.name ?? undefined, output: pair.output.name ?? undefined }
      saveSettings(settings)
      set({ settings })
      access.onstatechange = () => {
        if (!access) return
        set({ ports: portNames(access) })
        const gone = pair.output.state !== 'connected' || pair.input.state !== 'connected'
        if (gone && get().status === 'connected') set({ status: 'lost', message: 'The DX’s MIDI port is gone. Reconnect it, then press Connect.' })
      }
      await startSession(webMidiTransport(pair), 'connected')
    },

    async startDemo() {
      const fake = new FakeRefaceDx({ replyMs: 15, loadMs: 200 })
      set({ fake })
      await startSession(fake, 'demo')
    },

    disconnect() {
      get().releaseNotes()
      session?.close()
      session = null
      transport = null
      history.reset()
      set({ status: 'offline', voice: null, baseline: null, system: null, program: null, fake: null, message: null, replaced: null, undoLabel: null, redoLabel: null })
    },

    choosePorts(names) {
      const settings = { ...get().settings, ...names }
      saveSettings(settings)
      set({ settings })
      void get().connect()
    },

    async resync() {
      if (!session) return
      set({ reading: true })
      const read = await session.readVoice()
      const voice = get().voice
      if (!read) return set({ reading: false, message: 'The DX didn’t answer. Check the connection.' })
      // Same voice, other values: edits made on the DX (Q4). They become one undo step; the baseline and the
      // rest of the history stay, so coming back to the window never loses Undo or "Edited".
      if (voice && diffVoices(voice, read).length) {
        history.record(voice, 'resync', 'changes on the DX')
        history.endGesture()
        set({ voice: read })
        labels()
      }
      set({ reading: false })
    },

    async selectProgram(program) {
      if (!session) return
      set({ reading: true, program, replaced: null, message: null })
      const voice = await session.selectProgram(program)
      if (voice) takeVoice(voice, program)
      else set({ reading: false, message: 'The DX didn’t answer. Check the connection.' })
    },

    loadVoice(voice) {
      if (!session) return
      session.sendVoice(voice)
      takeVoice(cloneVoice(voice))
      set({ replaced: null, message: null })
    },

    setValues(changes, label, key = label) {
      const voice = get().voice
      if (!voice || !session) return
      if (changes.every(([a, d]) => d.every((b, i) => voiceValueAt(voice, [a[0], a[1], a[2] + i]) === b))) return
      history.record(voice, key, label)
      const next = cloneVoice(voice)
      for (const [a, d] of changes) {
        setVoiceValues(next, a, d)
        session.sendValue(a, d)
      }
      set({ voice: next })
      labels()
    },

    setValue(address, value) {
      get().setValues([[address, [value]]], addressLabel(address), addressKey(address))
    },

    setSystemValue(offset, value) {
      if (!session) return
      session.setSystem(offset, value)
      set({ system: session.system && Uint8Array.from(session.system) })
    },

    beginGesture: () => history.beginGesture(),
    endGesture: () => history.endGesture(),

    undo() {
      const voice = get().voice
      const back = voice && history.undo(voice)
      if (!voice || !back || !session) return
      void session.sendBatch(voiceChanges(voice, back))
      set({ voice: back })
      labels()
    },

    redo() {
      const voice = get().voice
      const fwd = voice && history.redo(voice)
      if (!voice || !fwd || !session) return
      void session.sendBatch(voiceChanges(voice, fwd))
      set({ voice: fwd })
      labels()
    },

    init() {
      const voice = get().voice
      if (!voice || !session) return
      const changes = voiceChanges(voice, initVoice())
      if (!changes.length) return
      history.record(voice, 'init', 'Init voice')
      history.endGesture()
      void session.sendBatch(changes)
      set({ voice: initVoice() })
      labels()
    },

    focusOperator: (op) => set({ focusOp: op }),

    noteOn(note, velocity) {
      held.add(note)
      session?.noteOn(note, velocity)
      set({ lastVelocity: velocity })
    },
    noteOff(note) {
      held.delete(note)
      session?.noteOff(note)
    },
    releaseNotes() {
      for (const n of held) session?.noteOff(n)
      held.clear()
    },
    setModWheel(value) {
      const v = Math.max(0, Math.min(127, Math.round(value)))
      if (v === get().modWheel) return
      session?.sendChannel(0xb0, 1, v)
      set({ modWheel: v })
    },
    sendChannel: (status, a, b) => session?.sendChannel(status, a, b),
  }
})

export const isOnline = (s: Status) => ONLINE.includes(s)
/** For tests: the transport in use. */
export const currentTransport = () => transport
