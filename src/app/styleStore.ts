// The style editor (PLAN §7.2): the choices, remembered in this browser, and the open session. Opening it caches
// the voice; every change plays at once on the DX (paced Parameter Changes, no undo steps); Apply keeps what is
// heard as one undo step, Cancel sends the cached voice back.
import { create } from 'zustand'
import { CHARACTERS, COLOURS, FAMILIES, isEmpty, MODES, NO_STYLE, SHAPES, SPACES, type StyleChoices } from '../style/choices'
import { newSeed } from '../style/random'
import { stylePreview } from '../style/style'
import { voiceName, type Voice } from '../sysex/codec'
import { useEditor } from './store'

export const STYLE_KEY = 'reface-dx-editor.style'

interface Saved {
  choices: StyleChoices
  /** 0 the voice as it was … 1 a new voice in the style */
  mix: number
  /** 0 typical … ½ anywhere in the style … 1 mutated as well */
  wild: number
  /** the More section is open */
  more: boolean
}

export interface StyleState extends Saved {
  /** the variation of the style: the same until Another */
  seed: number
  /** the voice when the editor opened; null while it's closed */
  original: Voice | null
  /** whether anything was changed since it opened (until then the voice plays as it was) */
  dirty: boolean
  set(patch: Partial<StyleChoices>): void
  setMix(mix: number): void
  setWild(wild: number): void
  setMore(open: boolean): void
  /** another variation of the style (and of the mutation) */
  another(): void
  reset(): void
  open(): void
  apply(): void
  cancel(): void
}

const DEFAULTS: Saved = { choices: NO_STYLE, mix: 1, wild: 0.1, more: false }

/** Saved choices from an earlier version can name options that are gone (Classic FM, Gritty, Atmo, Swell, Drive). */
function sanitize(c: Partial<StyleChoices> & { drive?: number }): StyleChoices {
  const { drive, ...rest } = c
  const out = { ...NO_STYLE, ...rest }
  // Drive was a slider and Ensemble a space; both are colours now
  if (drive && !out.colour) out.colour = 'drive'
  if ((out.space as string) === 'ensemble') [out.space, out.colour] = [null, out.colour ?? 'chorus']
  if (out.colour !== null && !COLOURS.includes(out.colour)) out.colour = null
  if (out.family !== 'any' && out.family !== null && !FAMILIES.includes(out.family)) out.family = null
  if (out.shape !== null && !SHAPES.includes(out.shape)) out.shape = null
  if (out.space !== null && !SPACES.includes(out.space)) out.space = null
  if (out.mode !== null && !MODES.includes(out.mode)) out.mode = null
  // characters are on or off now (they had some and much)
  out.characters = Object.fromEntries(
    Object.entries(out.characters ?? {}).filter(([k, a]) => (CHARACTERS as readonly string[]).includes(k) && a).map(([k]) => [k, 1]),
  )
  return out
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as Partial<Saved> | null
    if (!s) return DEFAULTS
    return {
      choices: sanitize(s.choices ?? {}),
      mix: typeof s.mix === 'number' ? s.mix : DEFAULTS.mix,
      wild: typeof s.wild === 'number' ? s.wild : DEFAULTS.wild,
      more: !!s.more,
    }
  } catch {
    return DEFAULTS
  }
}

function save(s: Saved) {
  try {
    const { choices, mix, wild, more } = s
    localStorage.setItem(STYLE_KEY, JSON.stringify({ choices, mix, wild, more }))
  } catch {
    // private mode: the choices last for this visit
  }
}

/** What Apply calls the undo step. */
function labelOf(s: StyleState, v: Voice) {
  return s.mix >= 1 || isEmpty(s.choices) ? `Style “${voiceName(v)}”` : `Style (${Math.round(s.mix * 100)} % of the way)`
}

export const useStyle = create<StyleState>((set, get) => {
  /** The preview from the cached voice, to the editor and the DX. */
  const play = () => {
    const s = get()
    if (!s.original) return
    useEditor.getState().previewVoice(stylePreview(s.original, s.choices, s.seed, { mix: s.mix, wild: s.wild }))
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
    original: null,
    dirty: false,
    set: (patch) => update({ choices: { ...get().choices, ...patch } }),
    setMix: (mix) => update({ mix }),
    setWild: (wild) => update({ wild }),
    setMore: (more) => {
      set({ more })
      save(get())
    },
    another: () => update({ seed: newSeed() }),
    reset: () => update({ choices: NO_STYLE }),
    open() {
      const original = useEditor.getState().beginStyle()
      if (original) set({ original, dirty: false })
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
