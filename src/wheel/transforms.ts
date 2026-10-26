// What a tonality does as a light secondary pin (PLAN §8.2): in place, on the base's operators by their roles, as
// far as `a` (0 … 1). A carrier's level is loudness, a modulator's brightness; every operator's feedback is its own,
// so a tonality can colour one operator (square feedback for a reed, saw for strings) without taking it over.
// Steps on the reface's scale (docs/SOUND.md): ±20 levels on a modulator is a big change, ±15 rates ~3× the time.
import { ALGORITHMS } from '../params/algorithms'
import { ratioBytes, ratioOf } from '../params/display'
import type { Voice } from '../sysex/codec'
import type { Rng } from '../style/random'
import type { Tonality } from './choices'

export const clamp = (x: number, lo = 0, hi = 127) => Math.max(lo, Math.min(hi, Math.round(x)))

/** A noise operator: a square wave (feedback near the top) whose modulation roughens what it modulates. Intensity,
 *  brightness and transforms leave it alone. */
export const isNoiseOp = (v: Voice, op: number) => v.ops[op][0x14] === 1 && v.ops[op][0x13] >= 112

export const level = (v: Voice, op: number) => v.ops[op][0x12]
export const setLevel = (v: Voice, op: number, l: number) => (v.ops[op][0x12] = clamp(l))
export const sounding = (v: Voice, op: number) => v.ops[op][0x00] === 1 && v.ops[op][0x12] > 0

/** The sounding carriers and modulators (noise operators left out of the modulators). */
export function roles(v: Voice) {
  const a = ALGORITHMS[v.common[0x10]]
  const ops = [0, 1, 2, 3].filter((op) => sounding(v, op))
  return {
    carriers: ops.filter((op) => a.carriers.includes(op)),
    modulators: ops.filter((op) => !a.carriers.includes(op) && !isNoiseOp(v, op)),
    /** the operators modulating `op` */
    into: (op: number) => a.modulations.filter(([, to]) => to === op).map(([from]) => from),
  }
}

/** An operator's ratio, or null in fixed mode. */
export const ratio = (v: Voice, op: number) => (v.ops[op][0x15] ? null : ratioOf(v.ops[op][0x16], v.ops[op][0x17]))
export function setRatio(v: Voice, op: number, r: number) {
  v.ops[op].set([0, ...ratioBytes(Math.max(0.5, Math.min(31.99, r)))], 0x15)
}
/** Times `factor`; high partials (above 8 : 1, a sparkle) stay where they are. */
const scaleRatio = (v: Voice, op: number, factor: number) => {
  const r = ratio(v, op)
  if (r !== null && r <= 8) setRatio(v, op, r * factor)
}

/** Faster (positive) or slower rates on some stages of an operator's envelope. */
export function faster(v: Voice, op: number, by: number, stages: readonly number[] = [0, 1, 2, 3]) {
  for (const i of stages) if (v.ops[op][0x01 + i] < 127) v.ops[op][0x01 + i] = clamp(v.ops[op][0x01 + i] + by)
}

/** An operator's envelope `a` of the way to a transient's (a quick drop to nothing, whatever the shape). */
export function transientBy(v: Voice, op: number, a: number) {
  const o = v.ops[op]
  const to = (i: number, x: number) => (o[i] = clamp(o[i] + (x - o[i]) * a))
  to(0x01, 127)
  to(0x02, Math.max(o[0x02], 80))
  to(0x06, 0)
  to(0x07, 0)
}

/** A pitch blip into the note on the carriers, two semitones at full, none below a tenth. */
export function pitchBlipBy(v: Voice, from: 'above' | 'below', a: number) {
  const depth = Math.round(2 * Math.min(1, a))
  if (!depth) return
  // each note starts at L1 (measured): from there back to the note at R2 (42: ~30 ms)
  v.common.set([127, 42, 127, 127, 64 + (from === 'above' ? depth : -depth), 64, 64, 64], 0x15)
  for (const op of roles(v).carriers) v.ops[op][0x10] = 1
}

/** Delayed vibrato on every operator, at least as deep as `depth` (a deeper one of the base's stays). */
function vibratoAtLeast(v: Voice, speed: number, delay: number, depth: number) {
  if (v.common[0x14] >= depth) return
  v.common.set([0, speed, delay, depth], 0x11)
  for (const o of v.ops) o[0x0f] = 1
}

/** Breath or noise into the voice, `a` 0 … 1: the least important modulator turns into a noise operator (square
 *  feedback at the top), as rough as its level, from `low` to `top`; without one, the highest carrier gets an airy
 *  feedback. The roughness grows with the level up to ~112 (tonalities.ts, the noise graft). */
function addNoise(v: Voice, a: number, low: number, top: number) {
  const { carriers, modulators } = roles(v)
  const m = modulators[modulators.length - 1]
  if (m !== undefined) {
    v.ops[m][0x13] = 127
    v.ops[m][0x14] = 1
    setLevel(v, m, low + (top - low) * a)
    return
  }
  const c = carriers.reduce((x, y) => ((ratio(v, y) ?? 0) > (ratio(v, x) ?? 0) ? y : x), carriers[0])
  if (c === undefined) return
  v.ops[c][0x13] = clamp(Math.max(v.ops[c][0x13], 100 + 15 * a))
  v.ops[c][0x14] = 1
}

const INHARMONIC = [1.41, 1.73, 2.27, 2.62, 3.14, 3.5, 4.24, 5.19]

export const TRANSFORMS: Record<Tonality, (v: Voice, a: number, rng: Rng) => void> = {
  warm(v, a) {
    const { carriers, modulators } = roles(v)
    for (const op of modulators) setLevel(v, op, level(v, op) - 20 * a)
    for (let op = 0; op < 4; op++) if (!isNoiseOp(v, op)) v.ops[op][0x13] = clamp(v.ops[op][0x13] * (1 - 0.6 * a))
    for (const op of carriers) faster(v, op, -8 * a, [0])
  },
  reed(v, a) {
    // the reface's way to a reed: square feedback on the main carrier (odd harmonics), and its modulators at
    // twice its frequency, as deep as the amount
    const { carriers, into } = roles(v)
    const main = carriers[0]
    if (main === undefined) return
    v.ops[main][0x13] = clamp(Math.max(v.ops[main][0x13] * (v.ops[main][0x14] ? 1 : 0), 30 + 50 * a))
    v.ops[main][0x14] = 1
    const base = ratio(v, main)
    if (base !== null) for (const m of into(main)) if (sounding(v, m) && !isNoiseOp(v, m) && ratio(v, m) !== null) {
      setRatio(v, m, base * 2)
      setLevel(v, m, Math.max(56 + 16 * a, level(v, m) - 20 * (1 - a)))
    }
  },
  brass(v, a) {
    const { modulators } = roles(v)
    for (const op of modulators) {
      setLevel(v, op, level(v, op) + 10 * a)
      faster(v, op, -12 * a, [0])
    }
    if (modulators[0] !== undefined) v.ops[modulators[0]][0x13] = clamp(Math.max(v.ops[modulators[0]][0x13], 50 * a))
    pitchBlipBy(v, 'below', a)
  },
  string(v, a) {
    // detuned apart as far as the amount (never closer than they were), each a saw, bowed, with vibrato
    roles(v).carriers.forEach((op, i) => {
      const apart = (i % 2 ? 1 : -1) * Math.round(3 + 8 * a)
      if (Math.abs(apart) > Math.abs(v.ops[op][0x18] - 64)) v.ops[op][0x18] = clamp(64 + apart)
      if (!isNoiseOp(v, op)) {
        v.ops[op][0x13] = clamp(Math.max(v.ops[op][0x14] ? 0 : v.ops[op][0x13], 50 + 40 * a))
        v.ops[op][0x14] = 0
      }
      faster(v, op, -10 * a, [0])
    })
    vibratoAtLeast(v, 75, 60, Math.round(6 * a))
  },
  breath: (v, a) => addNoise(v, a, 76, 100),
  noise: (v, a) => addNoise(v, a, 88, 116),
  metallic(v, a, rng) {
    // every modulator toward an inharmonic ratio as far as the amount; past half, the last carrier off the first
    const { carriers, modulators } = roles(v)
    for (const op of modulators) scaleRatio(v, op, rng.pick(INHARMONIC) ** a)
    if (a > 0.5 && carriers.length > 1) scaleRatio(v, carriers[carriers.length - 1], 1.41 ** ((a - 0.5) * 2))
  },
  bell(v, a, rng) {
    const { carriers, modulators } = roles(v)
    for (const op of carriers) faster(v, op, -14 * a, [1, 2])
    if (modulators.length) scaleRatio(v, rng.pick(modulators), rng.pick([3.5, 1.41, 2.78]) ** a)
    for (const op of modulators) faster(v, op, 8 * a, [1, 2])
  },
  glass(v, a, rng) {
    // the highest modulator a sparkle: 7 or 14 times the carrier, as loud as the amount, dying away
    const { carriers, modulators } = roles(v)
    const op = [...modulators].sort((x, y) => (ratio(v, y) ?? 0) - (ratio(v, x) ?? 0))[0]
    if (op === undefined) return
    setRatio(v, op, (ratio(v, carriers[0]) ?? 1) * rng.pick([7, 14, 14]))
    setLevel(v, op, 56 + 34 * a)
    transientBy(v, op, 1)
  },
  tine(v, a) {
    const { carriers, modulators } = roles(v)
    const op = modulators.find((m) => (ratio(v, m) ?? 0) >= 7) ?? modulators[modulators.length - 1]
    if (op === undefined) return
    setRatio(v, op, (ratio(v, carriers[0]) ?? 1) * 14)
    setLevel(v, op, 60 + 28 * a)
    v.ops[op][0x11] = 60
    transientBy(v, op, 1)
  },
  wooden(v, a) {
    for (let op = 0; op < 4; op++) if (sounding(v, op)) faster(v, op, 14 * a, [1, 2, 3])
    for (const op of roles(v).modulators) transientBy(v, op, a)
    pitchBlipBy(v, 'above', a)
  },
  organ(v, a) {
    const { carriers, modulators } = roles(v)
    for (const op of modulators) setLevel(v, op, level(v, op) - 16 * a)
    for (const op of carriers) {
      // held: the sustain as far up toward 125 as the amount
      const o = v.ops[op]
      o[0x07] = clamp(o[0x07] + Math.max(0, 125 - o[0x07]) * a)
      o[0x06] = Math.max(o[0x06], o[0x07])
    }
  },
}
