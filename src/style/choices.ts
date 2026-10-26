// The Style sheet's labels for the envelope shapes, play modes and effects (PLAN §8.4). Left from the family/character
// style editor (PLAN §7.2), which is gone.

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

/** The DX's part mode (common 0D: poly, mono full, mono legato). */
export const MODES = ['poly', 'mono', 'legato'] as const
export type Mode = (typeof MODES)[number]
export const MODE_LABELS: Record<Mode, string> = { poly: 'Poly', mono: 'Mono full', legato: 'Mono legato' }
export const MODE_HINTS: Record<Mode, string> = {
  poly: 'Chords: every key its own note',
  mono: 'One note at a time; every note starts its envelopes again',
  legato: 'One note at a time; notes played joined glide on without starting the envelopes again',
}
export const MODE_BYTE: Record<Mode, number> = { poly: 0, mono: 1, legato: 2 }

/** The DX's two effect slots: Colour (slot 1) and Space (slot 2). Together they offer all seven effects. */
export const COLOURS = ['clean', 'drive', 'wah', 'chorus', 'flanger', 'phaser'] as const
export type Colour = (typeof COLOURS)[number]
export const COLOUR_LABELS: Record<Colour, string> = { clean: 'Clean', drive: 'Distortion', wah: 'Touch wah', chorus: 'Chorus', flanger: 'Flanger', phaser: 'Phaser' }

export const SPACES = ['dry', 'room', 'hall', 'echo'] as const
export type Space = (typeof SPACES)[number]
export const SPACE_LABELS: Record<Space, string> = { dry: 'Dry', room: 'Room', hall: 'Hall', echo: 'Echo' }
