// The style editor (PLAN §7.2): the choices, remembered in this browser, and the open session. Opening it caches
// the voice; every change plays at once on the DX (paced Parameter Changes, no undo steps); Apply keeps what is
// heard as one undo step, Cancel sends the cached voice back.
import { create } from 'zustand'
import { CHARACTERS, FAMILIES, isEmpty, MODES, NO_STYLE, SHAPES, SPACES, type StyleChoices } from '../style/choices'
import { newSeed } from '../style/random'
import { stylePreview, type Start } from '../style/style'
import { voiceName, type Voice } from '../sysex/codec'
import { useEditor } from './store'

export const STYLE_KEY = 'reface-dx-editor.style'

interface Saved {
  choices: StyleChoices
  /** where it starts from */
  start: Start
  /** with 'mine': how far towards the style, 0–1 */
  amount: number
  /** with 'new': 0 typical … 1 wild */
  variation: number
  /** the More section is open */
  more: boolean
}

export interface StyleState extends Saved {
  /** the variation of the style: the same until Another */
  seed: number
  /** random changes on top, 0–100 %; starts at 0 every time */
  mutate: number
  /** the voice when the editor opened; null while it's closed */
  original: Voice | null
  /** whether anything was changed since it opened (until then the voice plays as it was) */
  dirty: boolean
  set(patch: Partial<StyleChoices>): void
  setStart(start: Start): void
  setAmount(amount: number): void
  setVariation(v: number): void
  setMutate(percent: number): void
  setMore(open: boolean): void
  /** another variation of the style (and of the mutation) */
  another(): void
  reset(): void
  open(): void
  apply(): void
  cancel(): void
}

const DEFAULTS: Saved = { choices: NO_STYLE, start: 'new', amount: 0.5, variation: 0.2, more: false }

/** Saved choices from an earlier version can name options that are gone (Classic FM, Gritty, Atmo, Swell). */
function sanitize(c: Partial<StyleChoices>): StyleChoices {
  const out = { ...NO_STYLE, ...c }
  if (out.family !== 'any' && out.family !== null && !FAMILIES.includes(out.family)) out.family = null
  if (out.shape !== null && !SHAPES.includes(out.shape)) out.shape = null
  if (out.space !== null && !SPACES.includes(out.space)) out.space = null
  if (out.mode !== null && !MODES.includes(out.mode)) out.mode = null
  out.characters = Object.fromEntries(Object.entries(out.characters ?? {}).filter(([k]) => (CHARACTERS as readonly string[]).includes(k)))
  return out
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as Partial<Saved> | null
    if (!s) return DEFAULTS
    return {
      choices: sanitize(s.choices ?? {}),
      start: s.start === 'mine' ? 'mine' : 'new',
      amount: typeof s.amount === 'number' ? s.amount : DEFAULTS.amount,
      variation: typeof s.variation === 'number' ? s.variation : DEFAULTS.variation,
      more: !!s.more,
    }
  } catch {
    return DEFAULTS
  }
}

function save(s: Saved) {
  try {
    const { choices, start, amount, variation, more } = s
    localStorage.setItem(STYLE_KEY, JSON.stringify({ choices, start, amount, variation, more }))
  } catch {
    // private mode: the choices last for this visit
  }
}

/** What Apply calls the undo step. */
function labelOf(s: StyleState, v: Voice) {
  const base = s.start === 'new' || isEmpty(s.choices) ? `Style “${voiceName(v)}”` : `Towards style ${Math.round(s.amount * 100)} %`
  return s.mutate ? `${base}, mutated ${s.mutate} %` : base
}

export const useStyle = create<StyleState>((set, get) => {
  /** The preview from the cached voice, to the editor and the DX. */
  const play = () => {
    const s = get()
    if (!s.original) return
    useEditor.getState().previewVoice(stylePreview(s.original, s.choices, s.seed, { start: s.start, variation: s.variation, morph: s.amount, mutate: s.mutate }))
  }
  /** A change: remembered, and heard if the editor is open. */
  const update = (patch: Partial<StyleState>) => {
    set(patch)
    save(get())
    if (get().original) {
      set({ dirty: true })
      play()
    }
  }
  return {
    ...load(),
    seed: newSeed(),
    mutate: 0,
    original: null,
    dirty: false,
    set: (patch) => update({ choices: { ...get().choices, ...patch } }),
    setStart: (start) => update({ start }),
    setAmount: (amount) => update({ amount }),
    setVariation: (variation) => update({ variation }),
    setMutate: (mutate) => update({ mutate }),
    setMore: (more) => {
      set({ more })
      save(get())
    },
    another: () => update({ seed: newSeed() }),
    reset: () => update({ choices: NO_STYLE }),
    open() {
      const original = useEditor.getState().beginStyle()
      if (original) set({ original, dirty: false, mutate: 0 })
    },
    apply() {
      const { original } = get()
      if (!original) return
      const now = useEditor.getState().voice
      useEditor.getState().endStyle(original, true, now ? labelOf(get(), now) : 'Style')
      set({ original: null, dirty: false })
    },
    cancel() {
      const { original } = get()
      if (!original) return
      useEditor.getState().endStyle(original, false, '')
      set({ original: null, dirty: false })
    },
  }
})

// Another voice on the DX ends the session in the editor store: close here too.
useEditor.subscribe((s, prev) => {
  if (prev.styling && !s.styling && useStyle.getState().original) useStyle.setState({ original: null, dirty: false })
})
