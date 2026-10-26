// The Style sheet (PLAN §8): the wheel's pins and controls, remembered in this browser, and the open session. Opening
// it caches the voice; every change plays at once on the DX (paced Parameter Changes, no undo steps); Apply keeps what
// is heard as one undo step, Cancel sends the cached voice back.
import { create } from 'zustand'
import { COLOURS, MODES, SHAPES, SPACES, type Colour, type Mode, type Space } from '../style/choices'
import { newSeed, rng } from '../style/random'
import type { Envelope } from '../style/shapes'
import { voiceName, type Voice } from '../sysex/codec'
import { NO_PINS, REGISTERS, type Pin, type WheelChoices } from '../wheel/choices'
import { freshChoices, MAX_PINS, mutateChoices } from '../wheel/explore'
import type { WheelVoice } from '../wheel/generate'
import { wheelPreview } from '../wheel/preview'
import { useEditor } from './store'

export const STYLE_KEY = 'reface-dx-editor.style'

/** A pin as the sheet holds it: with an id, so it can be dragged and named. */
export interface SheetPin extends Pin {
  id: number
}
export type SheetChoices = Omit<WheelChoices, 'pins'> & { pins: SheetPin[] }

interface Saved {
  choices: SheetChoices
  /** 0 the voice as it was … 1 the wheel's voice */
  mix: number
  /** 0 typical … ½ anywhere in the tonalities … 1 mutated as well */
  wild: number
  /** the More section is open */
  more: boolean
  /** the effects stay as your voice has them */
  keepFx: boolean
}

export interface StyleState extends Saved {
  /** the variation: the same until Another */
  seed: number
  /** the voice when the sheet opened; null while it's closed */
  original: Voice | null
  /** the wheel's voice now playing, with how each pin came in; null while closed */
  generated: WheelVoice | null
  selectedPin: number | null
  /** whether anything was changed since it opened (until then the voice plays as it was) */
  dirty: boolean
  set(patch: Partial<Omit<WheelChoices, 'pins'>>): void
  setMix(mix: number): void
  setWild(wild: number): void
  setMore(open: boolean): void
  setKeepFx(keep: boolean): void
  /** a pin where the wheel was clicked; null when there are three already */
  addPin(angle: number, radius: number): number | null
  movePin(id: number, angle: number, radius: number): void
  setWeight(id: number, weight: number): void
  removePin(id: number): void
  selectPin(id: number | null): void
  /** another variation: the same pins, another seed */
  another(): void
  /** the pins and controls moved (explore.ts) */
  mutate(): void
  /** a fresh roll of the wheel */
  newVoice(): void
  reset(): void
  open(): void
  apply(): void
  cancel(): void
}

let nextId = 1
const withId = (p: Pin): SheetPin => ({ angle: p.angle, radius: p.radius, weight: p.weight, id: nextId++ })

const NONE: SheetChoices = { ...NO_PINS, pins: [] }
const DEFAULTS: Saved = { choices: NONE, mix: 1, wild: 0.1, more: false, keepFx: false }

const num = (x: unknown, lo: number, hi: number, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback)
const oneOf = <T,>(x: unknown, all: readonly T[]): T | null => (all.includes(x as T) ? (x as T) : null)

/** Saved choices, also from the style editor before the wheel (families and characters): what still means something
 *  is kept (shape, mode, colour, space, brightness, treble, length), the rest goes. */
function sanitize(c: Record<string, unknown>): SheetChoices {
  const pins = Array.isArray(c.pins)
    ? (c.pins as Record<string, unknown>[]).slice(0, MAX_PINS).map((p) => withId({ angle: num(p.angle, 0, 360, 0), radius: num(p.radius, 0, 1, 0.5), weight: num(p.weight, 0.05, 1, 1) }))
    : []
  return {
    pins,
    shape: oneOf<Envelope>(c.shape, [...SHAPES, 'swell']),
    length: num(c.length, -1, 1, 0),
    brightness: num(c.brightness, -1, 1, 0),
    treble: num(c.treble, -1, 1, 0),
    complexity: num(c.complexity, 0, 1, 0.5),
    motion: num(c.motion, 0, 1, 0),
    register: oneOf(c.register, REGISTERS),
    velocity: c.velocity === null || c.velocity === undefined ? null : num(c.velocity, 0, 1, 0.5),
    pitchAccent: c.pitchAccent === true,
    mode: oneOf<Mode>(c.mode, MODES),
    colour: oneOf<Colour>(c.colour, COLOURS),
    space: oneOf<Space>(c.space, SPACES),
  }
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as (Partial<Saved> & { choices?: Record<string, unknown> }) | null
    if (!s) return DEFAULTS
    return {
      choices: sanitize(s.choices ?? {}),
      mix: num(s.mix, 0, 1, DEFAULTS.mix),
      wild: num(s.wild, 0, 1, DEFAULTS.wild),
      more: !!s.more,
      // the style editor kept it among the choices
      keepFx: !!(s.keepFx ?? (s.choices as { keepFx?: boolean } | undefined)?.keepFx),
    }
  } catch {
    return DEFAULTS
  }
}

function save(s: Saved) {
  try {
    const { choices, mix, wild, more, keepFx } = s
    localStorage.setItem(STYLE_KEY, JSON.stringify({ choices: { ...choices, pins: choices.pins.map(({ angle, radius, weight }) => ({ angle, radius, weight })) }, mix, wild, more, keepFx }))
  } catch {
    // private mode: the choices last for this visit
  }
}

/** What Apply calls the undo step. */
const labelOf = (s: StyleState, v: Voice) => (s.mix >= 1 ? `Style “${voiceName(v)}”` : `Style (${Math.round(s.mix * 100)} % of the way)`)

export const useStyle = create<StyleState>((set, get) => {
  /** The preview from the cached voice, to the editor and the DX. */
  const play = () => {
    const s = get()
    if (!s.original) return
    const p = wheelPreview(s.original, s.choices, s.seed, { mix: s.mix, wild: s.wild }, s.keepFx)
    set({ generated: p.generated })
    useEditor.getState().previewVoice(p.voice)
  }
  /** A change: remembered, and heard if the sheet is open. */
  const update = (patch: Partial<StyleState>) => {
    set(patch)
    save(get())
    if (get().original) {
      set({ dirty: true })
      play()
    }
  }
  const pins = () => get().choices.pins
  const setPins = (next: SheetPin[]) => update({ choices: { ...get().choices, pins: next } })
  return {
    ...load(),
    seed: newSeed(),
    original: null,
    generated: null,
    selectedPin: null,
    dirty: false,
    set: (patch) => update({ choices: { ...get().choices, ...patch } }),
    setMix: (mix) => update({ mix }),
    setWild: (wild) => update({ wild }),
    setMore: (more) => {
      set({ more })
      save(get())
    },
    setKeepFx: (keepFx) => update({ keepFx }),
    addPin(angle, radius) {
      if (pins().length >= MAX_PINS) return null
      // a new pin starts lighter than the heaviest, so the voice it joins stays itself
      const weight = pins().length ? 0.5 : 1
      const pin = withId({ angle, radius, weight })
      set({ selectedPin: pin.id })
      setPins([...pins(), pin])
      return pin.id
    },
    movePin: (id, angle, radius) => setPins(pins().map((p) => (p.id === id ? { ...p, angle, radius: Math.max(0, Math.min(1, radius)) } : p))),
    setWeight: (id, weight) => setPins(pins().map((p) => (p.id === id ? { ...p, weight: Math.max(0.05, Math.min(1, weight)) } : p))),
    removePin(id) {
      if (get().selectedPin === id) set({ selectedPin: null })
      setPins(pins().filter((p) => p.id !== id))
    },
    selectPin: (selectedPin) => set({ selectedPin }),
    another: () => update({ seed: newSeed() }),
    mutate: () => update({ choices: mutateChoices(get().choices, rng(newSeed()), withId) }),
    newVoice: () => update({ choices: freshChoices(get().choices, rng(newSeed()), withId), seed: newSeed(), selectedPin: null }),
    reset: () => update({ choices: NONE, selectedPin: null }),
    open() {
      const original = useEditor.getState().beginStyle()
      if (!original) return
      set({ original, dirty: false })
      // the wheel shows what its pins make from the start; the DX keeps your voice until something changes
      const s = get()
      set({ generated: wheelPreview(original, s.choices, s.seed, { mix: s.mix, wild: s.wild }, s.keepFx).generated })
    },
    apply() {
      const { original } = get()
      if (!original) return
      const now = useEditor.getState().voice
      useEditor.getState().endStyle(original, true, now ? labelOf(get(), now) : 'Style')
      set({ original: null, generated: null, dirty: false })
    },
    cancel() {
      const { original } = get()
      if (!original) return
      useEditor.getState().endStyle(original, false, '')
      set({ original: null, generated: null, dirty: false })
    },
  }
})

// Another voice on the DX ends the session in the editor store: close here too.
useEditor.subscribe((s, prev) => {
  if (prev.styling && !s.styling && useStyle.getState().original) useStyle.setState({ original: null, generated: null, dirty: false })
})
