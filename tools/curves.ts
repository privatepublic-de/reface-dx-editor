// The curve probes (docs/SOUND.md): which voice each point plays and what is measured from it, shared by
// tools/dxCurves.ts (the DX's audio) and tools/engineCurves.ts (the probe engine), so both measure the same thing.
// Every measure starts from the note's onset, so the DX's pre-roll and the engine's instant start compare.
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { averageCycle, db, envelope, harmonics, noteHz, period, RATE, rms, spectrum } from './dxAudio'

export const CURVES = ['attack', 'decay', 'level', 'carrier', 'eglevel', 'feedback', 'velocity'] as const
export type Curve = (typeof CURVES)[number]

export interface Point {
  curve: Curve
  /** what the point is, for the log: { rate: 40 }, { level: 80 }, { feedback: 64, square: true } … */
  at: Record<string, number | boolean>
  voice: Voice
  note: number
  holdS: number
  tailS: number
  velocity?: number
  measure: (x: Float64Array) => Record<string, number | number[] | null>
}

const BLOCK_S = 0.002

/** VOICE INIT with OP1 alone (a sine), envelope set. */
export function sine(rates: number[], levels: number[]): Voice {
  const v = cloneVoice(initVoice())
  v.ops[0].set(rates, 0x01)
  v.ops[0].set(levels, 0x05)
  v.ops[0][0x12] = 127
  return v
}
const steady = () => sine([127, 127, 127, 127], [127, 127, 127, 0])

/** Where the note reaches its top: the first 5 ms block within 1 dB of the loudest, in samples. (Not the loudest
 *  itself: on a steady note that can be anywhere, late enough to leave no room for the measure.) */
const peakAt = (x: Float64Array) => {
  const env = envelope(x, 0.005)
  const top = Math.max(...env)
  return env.findIndex((e) => e >= top * 0.89) * 0.005 * RATE
}

/** RMS in dB from 0.1 to 0.5 s after the loudest block (a steady note). */
const steadyDb = (x: Float64Array) => {
  const at = peakAt(x)
  return db(rms(x, at + 0.1 * RATE, at + 0.5 * RATE))
}

/** H1…H8 in dB against H1 on a steady stretch of `note`. */
function harmonicsDb(x: Float64Array, note: number): number[] {
  const at = peakAt(x)
  const w = x.subarray(at + 0.05 * RATE, at + 0.45 * RATE)
  const h = harmonics(averageCycle(w, period(w, RATE / noteHz(note))), 8).amp
  return h.map((a) => db(a / h[0]))
}

/** Spectral flatness 200 Hz–12 kHz on a steady stretch: 1 white noise, near 0 a few partials. */
function flatness(x: Float64Array): number {
  const at = peakAt(x)
  const { hz, amp } = spectrum(x.subarray(at + 0.05 * RATE, at + 0.6 * RATE), 8192)
  let logSum = 0
  let sum = 0
  let n = 0
  hz.forEach((f, k) => {
    if (f < 200 || f > 12000) return
    const p = amp[k] ** 2 + 1e-20
    logSum += Math.log(p)
    sum += p
    n++
  })
  return Math.exp(logSum / n) / (sum / n)
}

const RATES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

export function points(curve: Curve): Point[] {
  switch (curve) {
    // R1 → time from 1 % to 90 % (OP1 alone)
    case 'attack': return RATES.map((r) => ({
      curve, at: { rate: r }, voice: sine([r, 127, 127, 127], [127, 127, 127, 0]), note: 60, holdS: r < 40 ? 6 : r < 60 ? 3 : 1.2, tailS: 0.2,
      measure: (x) => {
        const env = envelope(x, BLOCK_S)
        const pk = Math.max(...env)
        const on = env.findIndex((e) => e > pk * 0.01)
        return { ms: (env.findIndex((e) => e >= pk * 0.9) - on) * BLOCK_S * 1000 }
      },
    }))
    // R2 → time to −20 and −40 dB from L1 127 to L2 0
    case 'decay': return RATES.map((r) => ({
      curve, at: { rate: r }, voice: sine([127, r, 127, 127], [127, 0, 0, 0]), note: 60, holdS: r < 40 ? 8 : r < 60 ? 4 : 1.5, tailS: 0.1,
      measure: (x) => {
        const env = envelope(x, BLOCK_S)
        const pk = Math.max(...env)
        const top = env.indexOf(pk)
        const t = (dB: number) => {
          const i = env.slice(top).findIndex((e) => e < pk * 10 ** (dB / 20))
          return i < 0 ? null : i * BLOCK_S * 1000
        }
        return { ms20: t(-20), ms40: t(-40) }
      },
    }))
    // modulator level → H1…H8 (OP2 → OP1 at 1 : 1, algorithm 1, OP3/4 off)
    case 'level': return [40, 60, 70, 80, 90, 100, 110, 120, 127].map((l) => {
      const v = steady()
      v.common[0x10] = 0
      v.ops[1].set([127, 127, 127, 127], 0x01)
      v.ops[1].set([127, 127, 127, 0], 0x05)
      v.ops[1][0x12] = l
      v.ops[2][0x12] = 0
      v.ops[3][0x12] = 0
      return { curve, at: { level: l }, voice: v, note: 48, holdS: 0.8, tailS: 0.1, measure: (x) => ({ h: harmonicsDb(x, 48) }) }
    })
    // carrier output level → loudness (OP1 alone)
    case 'carrier': return [127, 112, 96, 80, 64, 48, 32, 24, 16, 8].map((l) => {
      const v = steady()
      v.ops[0][0x12] = l
      return { curve, at: { level: l }, voice: v, note: 60, holdS: 0.8, tailS: 0.1, measure: (x) => ({ db: steadyDb(x) }) }
    })
    // EG level (L1–L3) → loudness (OP1 alone at 127)
    case 'eglevel': return [127, 112, 96, 80, 64, 48, 32, 24, 16, 8].map((l) => ({
      curve, at: { level: l }, voice: sine([127, 127, 127, 127], [l, l, l, 0]), note: 60, holdS: 0.8, tailS: 0.1, measure: (x) => ({ db: steadyDb(x) }),
    }))
    // feedback level and type → harmonics and noise (OP1 alone at 127); a few at output level 100 too: whether
    // the feedback follows the operator's level, as on the DX7
    case 'feedback': return [false, true].flatMap((square) => [
      ...[0, 32, 48, 64, 80, 96, 104, 112, 120, 127].map((f) => [f, 127]),
      ...[96, 112, 120, 127].map((f) => [f, 100]),
    ].map(([f, level]) => {
      const v = steady()
      v.ops[0][0x12] = level
      v.ops[0][0x13] = f
      v.ops[0][0x14] = square ? 1 : 0
      const at: Point['at'] = level === 127 ? { feedback: f, square } : { feedback: f, square, level }
      return { curve, at, voice: v, note: 48, holdS: 0.8, tailS: 0.1, measure: (x) => ({ h: harmonicsDb(x, 48), flatness: flatness(x), db: steadyDb(x) }) }
    }))
    // velocity sensitivity → loudness at several velocities (OP1 alone)
    case 'velocity': return [0, 64, 127].flatMap((sens) => [20, 40, 64, 100, 127].map((vel) => {
      const v = steady()
      v.ops[0][0x11] = sens
      return { curve, at: { sens, velocity: vel }, voice: v, note: 60, velocity: vel, holdS: 0.8, tailS: 0.1, measure: (x) => ({ db: steadyDb(x) }) }
    }))
  }
}

/** A point's file name: "attack-40", "feedback-64-square". */
export const pointName = (p: Point) => [p.curve, ...Object.entries(p.at).map(([k, x]) => (typeof x === 'boolean' ? (x ? k : '') : String(x)))].filter(Boolean).join('-')
