// What the characters, brightness, treble, the envelope modifiers and the space do to a voice (PLAN §7.2). Each is
// in place on a voice and works by role: a carrier's level is loudness, a modulator's is brightness.
// Measured on the DX (docs/SOUND.md): a modulator's level is steep, H2 against H1 at 1 : 1 goes −17 dB at 40, −8 at 60,
// −2.5 at 70, and from 80 the harmonics outgrow the fundamental; rate time halves for every +10. So the steps here
// are small: ±15 levels is a big brightness change, ±15 rates nearly 3× the time.
import { ALGORITHMS } from '../params/algorithms'
import { fixedBytes, ratioBytes, ratioOf } from '../params/display'
import { shiftRates } from '../params/envelope'
import type { Voice } from '../sysex/codec'
import { CHARACTERS, type Character, type Colour, type Space, type StyleChoices } from './choices'
import type { Rng } from './random'

const clamp = (v: number, lo = 0, hi = 127) => Math.max(lo, Math.min(hi, Math.round(v)))

export interface Roles {
  carriers: number[]
  modulators: number[]
}

export function rolesOf(v: Voice): Roles {
  const carriers = [...ALGORITHMS[v.common[0x10]].carriers]
  return { carriers, modulators: [0, 1, 2, 3].filter((o) => !carriers.includes(o)) }
}

/** An operator's ratio (ratio mode only; fixed operators keep their frequency). */
const ratio = (v: Voice, op: number) => ratioOf(v.ops[op][0x16], v.ops[op][0x17])
const setRatio = (v: Voice, op: number, r: number) => {
  if (v.ops[op][0x15] !== 0) return
  const [coarse, fine] = ratioBytes(Math.max(0.5, Math.min(31.99, r)))
  v.ops[op][0x16] = coarse
  v.ops[op][0x17] = fine
}
const raise = (v: Voice, op: number, at: number, to: number) => (v.ops[op][at] = clamp(Math.max(v.ops[op][at], to)))

/** Each character at amount `a` (0–1). */
export const CHARACTER_TRANSFORMS: Record<Character, (v: Voice, r: Roles, a: number, rng: Rng) => void> = {
  // a saw: saw feedback on the carriers, the modulators quieter, whole-number ratios, detune between the carriers
  analogue(v, r, a) {
    r.carriers.forEach((op, i) => {
      v.ops[op][0x14] = 0
      raise(v, op, 0x13, 40 + 70 * a)
      if (r.carriers.length > 1) v.ops[op][0x18] = clamp(64 + (i % 2 ? 1 : -1) * (3 + 7 * a))
    })
    for (const op of r.modulators) {
      v.ops[op][0x12] = clamp(v.ops[op][0x12] - 15 * a)
      if (a > 0.5 && v.ops[op][0x15] === 0) v.ops[op][0x17] = 0
    }
  },
  // a square: odd harmonics only. Square feedback on the carriers, the modulators at 2:1 (even sidebands land
  // on odd harmonics), no saw feedback anywhere
  hollow(v, r, a) {
    for (const op of r.carriers) {
      v.ops[op][0x14] = 1
      raise(v, op, 0x13, 50 + 60 * a)
    }
    const base = ratio(v, r.carriers[0])
    for (const op of r.modulators) {
      setRatio(v, op, base * 2)
      v.ops[op][0x13] = 0
    }
  },
  // inharmonic ratios on the modulators, and with a lot of it on a carrier too
  metallic(v, r, a, rng) {
    for (const op of r.modulators) if (rng.chance(0.4 + 0.6 * a)) setRatio(v, op, ratio(v, op) * rng.pick([1.41, 1.73, 2.27, 2.62, 3.14]))
    if (a > 0.7) setRatio(v, r.carriers[r.carriers.length - 1], ratio(v, r.carriers[r.carriers.length - 1]) * 1.41)
  },
  // the DX sparkle: a high-ratio modulator (or, with none, a carrier) that rings briefly over the start of each note
  glassy(v, r, a, rng) {
    const op = r.modulators.length ? r.modulators[r.modulators.length - 1] : r.carriers[r.carriers.length - 1]
    const o = v.ops[op]
    setRatio(v, op, ratio(v, r.carriers[0]) * rng.pick([7, 14, 14]))
    if (o[0x15] !== 0) o.set([0, ...ratioBytes(14)], 0x15) // a fixed frequency doesn't follow the keys: make it a ratio
    o[0x12] = clamp(Math.max(o[0x12], 90 + 8 * a))
    o.set([127, 74, 60, 70], 0x01) // instant, gone in ~0.6 s
    o.set([127, 0, 0, 0], 0x05)
    raise(v, op, 0x11, 55)
  },
  // noise on a pitched sound: a fixed-frequency modulator and a lot of square feedback on it (the level stays:
  // no amplitude LFO, that was what made it 7 dB quieter)
  noisy(v, r, a, rng) {
    const mods = r.modulators.length ? r.modulators : r.carriers
    const op = rng.pick(mods)
    if (r.modulators.length && rng.chance(a)) {
      const [coarse, fine] = fixedBytes(rng.range(300, 3000))
      v.ops[op].set([1, coarse, fine], 0x15)
    }
    v.ops[op][0x14] = 1
    raise(v, op, 0x13, 80 + 47 * a)
  },
}

/** Drive: square feedback on a modulator; the distortion effect comes with applyEffects. */
export function applyDrive(v: Voice, r: Roles, rng: Rng) {
  if (!r.modulators.length) return
  const op = rng.pick(r.modulators)
  v.ops[op][0x14] = 1
  raise(v, op, 0x13, 65)
}

/** Mellow (−1) … bright (+1). The modulators' levels, up to 22 up and 38 down (the curve is flat below ~60), and
 *  their feedback; the carriers' feedback (the strings' saws); without modulators (algorithm 12, the organ) the
 *  carriers above the lowest, like drawbars. Measured, ±15 on the modulators alone moved less than another seed. */
export function applyBrightness(v: Voice, r: Roles, b: number) {
  if (!b) return
  for (const op of r.modulators) {
    v.ops[op][0x12] = clamp(v.ops[op][0x12] + (b > 0 ? 22 : 38) * b)
    v.ops[op][0x13] = clamp(b < 0 ? v.ops[op][0x13] * (1 + b) : v.ops[op][0x13] + 30 * b)
  }
  const lowest = Math.min(...r.carriers.map((op) => ratio(v, op)))
  for (const op of r.carriers) {
    if (!r.modulators.length && ratio(v, op) > lowest) v.ops[op][0x12] = clamp(v.ops[op][0x12] + (b > 0 ? 30 : 45) * b)
    if (b > 0) raise(v, op, 0x13, v.ops[op][0x13] + 30 * b)
    else v.ops[op][0x13] = clamp(v.ops[op][0x13] * (1 + b))
  }
}

/** Tamer (−1) … brighter (+1) up the keyboard: the modulators' keyboard scaling on both sides of the break point
 *  (C3), linear. Measured, depth 100 on the right alone took C5 from 1 to 6 harmonics and left the bass alone. */
export function applyTreble(v: Voice, r: Roles, t: number) {
  if (!t) return
  for (const op of r.modulators) {
    v.ops[op][0x0a] = clamp(Math.abs(t) * 30)
    v.ops[op][0x0b] = clamp(Math.abs(t) * 40)
    v.ops[op][0x0c] = t > 0 ? 0 : 3 // left: −LIN (darker down) or +LIN
    v.ops[op][0x0d] = t > 0 ? 3 : 0 // right: +LIN (brighter up) or −LIN
  }
}

/** Short (−1) … long (+1): every rate by up to 15 (about 3× the time either way), instant attacks kept. */
export const applyLength = (v: Voice, l: number) => l && shiftRates(v, [0, 1, 2, 3], Math.round(-15 * l))

/** Movement while a note is held: the modulators' later stages drift apart, slowly, and a slow triangle LFO moves
 *  their level (without modulators: the upper carriers', like drawbars). Measured, the first version moved brass by
 *  0.75 dB per 100 ms and the organ not at all. */
export function applyEvolving(v: Voice, r: Roles, e: number, rng: Rng) {
  if (!e) return
  r.modulators.forEach((op, k) => {
    const o = v.ops[op]
    o[0x02] = clamp(Math.min(o[0x02], 70) - 8 * e * (k + 1))
    o[0x03] = clamp(Math.min(o[0x03], 70) - 8 * e * (k + 1))
    const [lo, hi] = rng.chance(0.5) ? [0.55, 1] : [1, 0.55] // fading out, or growing in
    o[0x06] = clamp(o[0x05] * (1 - e + e * lo))
    o[0x07] = clamp(o[0x05] * (1 - e + e * hi))
  })
  v.common[0x11] = 1
  v.common[0x12] = clamp(30 - 15 * e)
  const swaying = r.modulators.length ? r.modulators : r.carriers.slice(1)
  for (const op of swaying) raise(v, op, 0x0e, 70 * e)
}

/** Response to playing: velocity on the modulators (brightness, the classic FM touch) and some on the carriers
 *  (loudness), faster decay up the keys. */
export function applyExpressive(v: Voice, r: Roles, x: number) {
  if (!x) return
  for (const op of r.modulators) {
    raise(v, op, 0x11, 60 + 60 * x)
    v.ops[op][0x12] = clamp(v.ops[op][0x12] + 14 * x) // velocity sensitivity takes depth away at medium velocities
  }
  // steep: 40 gives ~3 dB between velocity 40 and 120, 70 ~17 dB
  for (const op of r.carriers) v.ops[op][0x11] = clamp(45 + 15 * x)
  for (let op = 0; op < 4; op++) raise(v, op, 0x09, 20 + 50 * x)
}

/** Effect slot 1, the colour, and slot 2, the space: [type, param 1, param 2] (EFFECT_PARAM_LABELS). */
export const COLOUR_FX: Record<Colour, [number, number, number]> = {
  clean: [0, 64, 64],
  drive: [1, 90, 50],
  wah: [2, 75, 70],
  chorus: [3, 100, 40],
  flanger: [4, 100, 35],
  phaser: [5, 110, 45],
}
export const SPACE_FX: Record<Space, [number, number, number]> = {
  dry: [0, 64, 64],
  room: [7, 40, 40],
  hall: [7, 70, 100],
  echo: [6, 50, 70],
}
/** The colour a character brings when none is chosen (the first of them that has one). */
const CHARACTER_COLOUR: Partial<Record<Character, Colour>> = { analogue: 'chorus', hollow: 'phaser', noisy: 'wah' }

/** The colour that sounds: the chosen one, else the characters'. */
export const colourOf = (c: StyleChoices): Colour =>
  c.colour ?? CHARACTERS.filter((k) => c.characters[k]).map((k) => CHARACTER_COLOUR[k]).find(Boolean) ?? 'clean'

/** Slot 1 from the colour, slot 2 from the space (kept when null). */
export function applyEffects(v: Voice, c: StyleChoices, space: Space | null) {
  if (c.keepFx) return
  v.common.set(COLOUR_FX[colourOf(c)], 0x1d)
  if (space) v.common.set(SPACE_FX[space], 0x20)
}

/** Some carrier must sound: on, a level that's heard, and an envelope that rises. In place. */
export function ensureAudible(v: Voice, r: Roles) {
  const loud = r.carriers.filter((op) => v.ops[op][0x00] === 1 && v.ops[op][0x12] >= 70 && Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) > 0)
  if (loud.length) return
  const op = r.carriers[0]
  v.ops[op][0x00] = 1
  v.ops[op][0x12] = Math.max(v.ops[op][0x12], 110)
  if (Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) === 0) v.ops[op][0x05] = 127
}
