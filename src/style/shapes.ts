// Envelope shapes (PLAN §7.2) per role: the carriers' envelope is the loudness, the modulators' the timbre, usually
// a little faster or lower, like a filter that opens and closes with the note. The DX's EG starts at L4 at key-on,
// runs R1 → L1, R2 → L2, R3 → L3, holds L3 while the key is down, and R4 → L4 after (FINDINGS Q13).
// Rates measured on the DX (docs/SOUND.md): the time about halves for every +10. Attack (R1, to 90 %): 40 ≈ 1.3 s,
// 50 ≈ 0.6 s, 60 ≈ 0.3 s, 70 ≈ 0.14 s, 80 and up ≈ instant. Decay (to −40 dB): 50 ≈ 3 s, 60 ≈ 1.4 s, 70 ≈ 0.8 s,
// 80 ≈ 0.35 s, 90 ≈ 0.15 s.
import { isCarrier } from '../params/algorithms'
import { setEg, type Eg } from '../params/envelope'
import type { Voice } from '../sysex/codec'
import type { Shape } from './choices'
import type { Rng } from './random'

/** The shapes offered, and the brass family's own swell. */
export type Envelope = Shape | 'swell'

interface ShapeSpec {
  carrier: Eg
  modulator: Eg
  /** a short pitch fall into the note (brass): pitch EG levels L1–L4 around 64, rates */
  pitchBlip?: boolean
}

export const SHAPE_SPECS: Record<Envelope, ShapeSpec> = {
  // carrier rings out in ~1.6 s, the brightness in ~0.8 s; release ~0.4 s
  pluck: { carrier: { rates: [127, 62, 60, 78], levels: [127, 0, 0, 0] }, modulator: { rates: [127, 70, 60, 78], levels: [127, 0, 0, 0] } },
  // a quick drop to a long fading body (~1 s, then ~5 s), brighter at the start; release ~0.6 s
  struck: { carrier: { rates: [127, 62, 40, 72], levels: [127, 96, 0, 0] }, modulator: { rates: [127, 66, 42, 72], levels: [127, 80, 0, 0] } },
  // attack ~0.2 s (the brightness ~0.4 s); release ~0.6 s
  bowed: { carrier: { rates: [65, 60, 60, 70], levels: [127, 122, 118, 0] }, modulator: { rates: [55, 55, 55, 70], levels: [118, 112, 108, 0] } },
  // attack ~1.3 s (the brightness ~2 s); release ~1.5 s
  pad: { carrier: { rates: [40, 50, 50, 60], levels: [127, 125, 120, 0] }, modulator: { rates: [35, 45, 50, 60], levels: [120, 110, 100, 0] } },
  // a swell to the peak in ~0.9 s, then cut off: R2 instant to L2 = 0
  reverse: { carrier: { rates: [45, 127, 60, 127], levels: [127, 0, 0, 0] }, modulator: { rates: [50, 127, 60, 127], levels: [127, 0, 0, 0] } },
  gate: { carrier: { rates: [127, 127, 127, 110], levels: [127, 127, 127, 0] }, modulator: { rates: [127, 127, 127, 110], levels: [127, 127, 127, 0] } },
  // the carriers in ~0.08 s, the modulators in ~0.25 s: the brightness rises into the note; release ~0.6 s
  swell: { carrier: { rates: [75, 60, 60, 72], levels: [127, 115, 110, 0] }, modulator: { rates: [62, 58, 58, 72], levels: [127, 108, 104, 0] }, pitchBlip: true },
}

const jitter = (eg: Eg, rng: Rng, spread: number): Eg => ({
  rates: eg.rates.map((r) => (r === 127 ? r : r + Math.round((rng.next() - 0.5) * 12 * spread))),
  levels: eg.levels,
})

/** Sets every operator's envelope for `shape` by its role, and the pitch EG (flat, or the brass blip). In place. */
export function applyShape(v: Voice, shape: Envelope, rng: Rng, spread: number) {
  const spec = SHAPE_SPECS[shape]
  const algorithm = v.common[0x10]
  for (let op = 0; op < 4; op++) setEg(v, op, jitter(isCarrier(algorithm, op) ? spec.carrier : spec.modulator, rng, spread))
  // Pitch EG: rates 15–18, levels 19–1C around 64 (= no shift). A blip starts 2 semitones low.
  v.common.set(spec.pitchBlip ? [100, 127, 127, 127, 64, 64, 64, 62] : [127, 127, 127, 127, 64, 64, 64, 64], 0x15)
  for (let op = 0; op < 4; op++) v.ops[op][0x10] = spec.pitchBlip && isCarrier(algorithm, op) ? 1 : 0
}

/** A transient decays fast whatever the shape: the e-piano's tine, a bell's clang. In place. */
export function applyTransients(v: Voice, ops: readonly number[]) {
  for (const op of ops) {
    const o = v.ops[op]
    o[0x02] = Math.max(o[0x02], 80) // ~0.35 s
    o[0x06] = 0
    o[0x07] = 0
  }
}
