// What a style is made of (PLAN §7.2): a family (the skeleton), characters (each with an amount), brightness and
// treble, an envelope shape with modifiers, and the space. Every field is optional or neutral at 0, so the empty
// choice changes nothing.

export const FAMILIES = ['bass', 'organ', 'strings', 'pluck', 'bell', 'epiano', 'brass', 'lead', 'perc', 'noise'] as const
export type Family = (typeof FAMILIES)[number]
export const FAMILY_LABELS: Record<Family, string> = {
  bass: 'Bass', organ: 'Organ', strings: 'Strings', pluck: 'Plucked', bell: 'Bell',
  epiano: 'E-piano', brass: 'Brass', lead: 'Lead', perc: 'Perc', noise: 'FM noise',
}
/** What the short labels stand for (tooltips). */
export const FAMILY_HINTS: Partial<Record<Family, string>> = { pluck: 'Plucked string, guitar', bell: 'Bell, mallet', epiano: 'E-piano, keys', perc: 'Percussion', noise: 'Noise as the sound itself: hiss, wind, sweeps, cymbals' }

/** Applied in this order: they overlap, so the order is part of the sound. (Classic FM went into Expressive, Gritty
 *  became Drive: measured, they changed the sound less than another seed does; docs/SOUND.md.) */
export const CHARACTERS = ['analogue', 'hollow', 'metallic', 'noisy'] as const
export type Character = (typeof CHARACTERS)[number]
export const CHARACTER_LABELS: Record<Character, string> = {
  analogue: 'Analogue', hollow: 'Hollow', metallic: 'Metallic', noisy: 'Noisy',
}

/** The envelopes offered. (Swell is the brass family's own; Atmo was Pad + long + Hall: measured, both too close
 *  to Bowed and Pad.) */
export const SHAPES = ['pluck', 'struck', 'bowed', 'pad', 'reverse', 'gate'] as const
export type Shape = (typeof SHAPES)[number]
export const SHAPE_LABELS: Record<Shape, string> = {
  pluck: 'Pluck', struck: 'Keys', bowed: 'Bowed', pad: 'Pad', reverse: 'Reverse', gate: 'Gate',
}
export const SHAPE_HINTS: Record<Shape, string> = {
  pluck: 'Instant, rings out', struck: 'Keyboard: a quick drop, then a long fade', bowed: 'A soft start, holds', pad: 'Slow in, slow out',
  reverse: 'Swells up, then stops', gate: 'Organ: full level while held',
}

/** The DX's part mode (common 0D: poly, mono-full, mono-legato). */
export const MODES = ['poly', 'mono', 'legato'] as const
export type Mode = (typeof MODES)[number]
export const MODE_LABELS: Record<Mode, string> = { poly: 'Poly', mono: 'Mono', legato: 'Legato' }
export const MODE_HINTS: Record<Mode, string> = {
  poly: 'Chords: every key its own note',
  mono: 'One note at a time; every note starts its envelopes again',
  legato: 'One note at a time; notes played joined glide on without starting the envelopes again',
}
export const MODE_BYTE: Record<Mode, number> = { poly: 0, mono: 1, legato: 2 }

export const SPACES = ['dry', 'ensemble', 'room', 'hall', 'echo'] as const
export type Space = (typeof SPACES)[number]
export const SPACE_LABELS: Record<Space, string> = { dry: 'Dry', ensemble: 'Ensemble', room: 'Room', hall: 'Hall', echo: 'Echo' }

export interface StyleChoices {
  /** 'any': a family picked by the seed */
  family: Family | 'any' | null
  /** 0 (off) … 1 */
  characters: Partial<Record<Character, number>>
  /** −1 mellow … +1 bright */
  brightness: number
  /** −1 tamer up the keyboard … +1 brighter up the keyboard */
  treble: number
  /** null: the family's own shape */
  shape: Shape | null
  /** −1 short … +1 long */
  length: number
  /** 0 … 1 */
  evolving: number
  expressive: number
  /** null: the family's own (or the voice's) */
  mode: Mode | null
  /** 0 … 1: the distortion effect, and some square feedback */
  drive: number
  /** null: from the family and characters */
  space: Space | null
  keepFx: boolean
}

export const NO_STYLE: StyleChoices = {
  family: null, characters: {}, brightness: 0, treble: 0, shape: null, length: 0, evolving: 0, expressive: 0, mode: null, drive: 0, space: null, keepFx: false,
}

/** Whether anything is chosen at all (nothing: Init is the plain VOICE INIT). */
export const isEmpty = (c: StyleChoices) =>
  !c.family && !Object.values(c.characters).some((a) => a) && !c.brightness && !c.treble && !c.shape && !c.length && !c.evolving && !c.expressive && !c.drive && !c.mode && !c.space
