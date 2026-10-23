// The style choices in the Style ▾ panel (PLAN §7.2), remembered in this browser, and the seed the current
// variation was made with: Towards style moves towards it until Another picks another.
import { create } from 'zustand'
import { CHARACTERS, FAMILIES, NO_STYLE, SHAPES, SPACES, type StyleChoices } from '../style/choices'
import { newSeed } from '../style/random'

export const STYLE_KEY = 'reface-dx-editor.style'

interface Saved {
  choices: StyleChoices
  /** Adjust's amount, 0.05–1 */
  amount: number
  /** Mutate's percentage, 1–100 */
  mutatePercent: number
  /** New voice: 0 typical … 1 wild */
  variation: number
  /** the panel's More section is open */
  more: boolean
}

export interface StyleState extends Saved {
  /** the variation of the style that Init made and Adjust moves towards */
  seed: number
  set(patch: Partial<StyleChoices>): void
  setAmount(amount: number): void
  setMutatePercent(p: number): void
  setVariation(v: number): void
  setMore(open: boolean): void
  reroll(): number
  reset(): void
}

const DEFAULTS: Saved = { choices: NO_STYLE, amount: 0.3, mutatePercent: 15, variation: 0.2, more: false }

/** Saved choices from an earlier version can name options that are gone (Classic FM, Gritty, Atmo, Swell). */
function sanitize(c: Partial<StyleChoices>): StyleChoices {
  const out = { ...NO_STYLE, ...c }
  if (out.family !== 'any' && out.family !== null && !FAMILIES.includes(out.family)) out.family = null
  if (out.shape !== null && !SHAPES.includes(out.shape)) out.shape = null
  if (out.space !== null && !SPACES.includes(out.space)) out.space = null
  out.characters = Object.fromEntries(Object.entries(out.characters ?? {}).filter(([k]) => (CHARACTERS as readonly string[]).includes(k)))
  return out
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as Saved | null
    return s ? { ...DEFAULTS, ...s, choices: sanitize(s.choices) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify({ choices: s.choices, amount: s.amount, mutatePercent: s.mutatePercent, variation: s.variation, more: s.more }))
  } catch {
    // private mode: the choices last for this visit
  }
}

export const useStyle = create<StyleState>((set, get) => {
  const update = (patch: Partial<Saved>) => {
    set(patch)
    save(get())
  }
  return {
    ...load(),
    seed: newSeed(),
    set: (patch) => update({ choices: { ...get().choices, ...patch } }),
    setAmount: (amount) => update({ amount }),
    setMutatePercent: (mutatePercent) => update({ mutatePercent }),
    setVariation: (variation) => update({ variation }),
    setMore: (more) => update({ more }),
    reroll() {
      const seed = newSeed()
      set({ seed })
      return seed
    },
    reset: () => update({ choices: NO_STYLE }),
  }
})
