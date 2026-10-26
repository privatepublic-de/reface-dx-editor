// What brightness, treble, length, evolving and the effects do to a voice, measured for the old style editor (PLAN
// §7.2) and used by the wheel (PLAN §8). Each is in place on a voice and works by role: a carrier's level is
// loudness, a modulator's is brightness.
// Measured on the DX (docs/SOUND.md): a modulator's level is steep, H2 against H1 at 1 : 1 goes −17 dB at 40, −8 at 60,
// −2.5 at 70, and from 80 the harmonics outgrow the fundamental; rate time halves for every +10. So the steps here
// are small: ±15 levels is a big brightness change, ±15 rates nearly 3× the time.
import { ALGORITHMS } from '../params/algorithms'
import { ratioOf } from '../params/display'
import { shiftRates } from '../params/envelope'
import type { Voice } from '../sysex/codec'
import type { Colour, Space } from './choices'
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

/** An operator's ratio. */
const ratio = (v: Voice, op: number) => ratioOf(v.ops[op][0x16], v.ops[op][0x17])
const raise = (v: Voice, op: number, at: number, to: number) => (v.ops[op][at] = clamp(Math.max(v.ops[op][at], to)))

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
/** Some carrier must sound: on, a level that's heard, and an envelope that rises. In place. */
export function ensureAudible(v: Voice, r: Roles) {
  const loud = r.carriers.filter((op) => v.ops[op][0x00] === 1 && v.ops[op][0x12] >= 70 && Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) > 0)
  if (loud.length) return
  const op = r.carriers[0]
  v.ops[op][0x00] = 1
  v.ops[op][0x12] = Math.max(v.ops[op][0x12], 110)
  if (Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) === 0) v.ops[op][0x05] = 127
}
