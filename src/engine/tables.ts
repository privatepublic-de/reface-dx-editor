// The reface DX's curves for the probe engine (PLAN §8): what a value 0–127 does, in dB, seconds and cycles.
// Measured on the DX with tools/dxCurves.ts (docs/SOUND.md): envelope rates, modulator depth, output and EG level,
// feedback, velocity. Everything marked "estimate" is still a guess, with the DX7 as a model.
// Not the DX7's tables: the reface has its own ranges and curves.

/** The constants fitted to the DX's takes (tools/engineCurves.ts --fit); an object so the fit can try values. */
export const TUNING = {
  /** output level: dB per step below 127, measured from 127 down to 32 */
  levelStepDb: 0.375,
  /** the modulation index of an operator at full level, in cycles (2π rad), fitted to the modulator depth */
  maxCycles: 2.0,
  /** a voice's output at full level: one carrier, a sine */
  outputScale: 0.5,
}
/** Quieter than this is silence. */
export const SILENT_DB = -120

/** Between table points [x, y], linear; outside, the end values. */
function lerp(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]
    if (x <= x1) {
      const [x0, y0] = table[i - 1]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return table[table.length - 1][1]
}

/** Output level below 32, measured (dB against 127): it falls faster there. 1 is an estimate. */
const LOW_LEVEL_DB: readonly [number, number][] = [[1, -72], [8, -59.6], [16, -47.6], [24, -41.7], [32, -35.6]]
/** Output level 0–127 → dB (0 at 127): 0.375 dB a step down to 32, measured; 0 is silent. */
export function levelDb(level: number): number {
  if (level <= 0) return SILENT_DB
  return level >= 32 ? -(127 - level) * TUNING.levelStepDb : lerp(LOW_LEVEL_DB, level)
}

/** EG level 0–127 → dB, measured: gentler than the output level (127 → 8 is 36 dB). 0 is silent; 1 an estimate. */
const EG_LEVEL_DB: readonly [number, number][] = [
  [1, -60], [8, -36], [16, -29.9], [24, -25.7], [32, -22.4], [48, -17.4], [64, -13], [80, -9.1], [96, -5.7], [112, -2.6], [127, 0],
]
export const egLevelDb = (level: number) => (level <= 0 ? SILENT_DB : lerp(EG_LEVEL_DB, level))

/** Attack: seconds from 1 % to 90 % for R1 = 10, 20 … 120, measured (docs/SOUND.md; 10 and 20 extrapolated: the
 *  takes were too short). The DX doesn't go faster than ~26 ms. */
const ATTACK_S = [9.8, 4.9, 2.44, 1.27, 0.632, 0.306, 0.144, 0.042, 0.032, 0.026, 0.026, 0.026]
/** Decay: seconds to −20 dB for R2 = 10, 20 … 120, measured (10 and 20 extrapolated, 120 instant). */
const DECAY_S = [27, 13.4, 6.7, 3.43, 1.74, 0.838, 0.424, 0.182, 0.082, 0.036, 0.014, 0.004]

/** Between the measured rates, log-linear; below 10 the time doubles every 10 more. */
function interpolate(table: readonly number[], rate: number): number {
  const x = Math.max(0, Math.min(127, rate)) / 10 - 1
  if (x <= 0) return table[0] * 2 ** -x
  const i = Math.min(table.length - 2, Math.floor(x))
  const f = Math.min(1, x - i)
  return Math.exp(Math.log(table[i]) * (1 - f) + Math.log(table[i + 1]) * f)
}

/** A rise heads for this many times its target and stops there (measured, tools/curves.ts attack takes): the
 *  amplitude approaches it exponentially, so a rise starts fast and slows into the top. */
export const ATTACK_OVERSHOOT = 1.5
/** Rising: the time constant of that approach at rate 0–127, seconds, so 90 % comes at the measured time. */
export const attackTau = (rate: number) => interpolate(ATTACK_S, rate) / -Math.log(1 - 0.9 / ATTACK_OVERSHOOT)
/** Falling, dB per second at rate 0–127. */
export const decayDbPerS = (rate: number) => 20 / interpolate(DECAY_S, rate)

/** Rate scaling 0–127: the speed multiplier higher up the keyboard (estimate: the DX7's, up to about 3 octaves of
 *  speed at the top with full scaling). */
export function rateScale(note: number, scaling: number): number {
  const x = Math.min(31, Math.max(0, Math.floor(note / 3) - 7))
  return 2 ** (((scaling / 127) * 7 * x) / 8 / 4)
}

/** Velocity sensitivity 0–127: dB at a velocity, measured: full sensitivity takes 0.375 dB (an output level step)
 *  per velocity step below 127, half sensitivity half as much. */
export const velocityDb = (velocity: number, sensitivity: number) => -(sensitivity / 127) * (127 - Math.max(1, Math.min(127, velocity))) * TUNING.levelStepDb

/** Keyboard level scaling around C3 (MIDI 60, the DX's break point): dB at `note` for one side's depth 0–127 and
 *  curve (0 −lin, 1 −exp, 2 +exp, 3 +lin). Estimate: at full depth, linear falls ~48 dB over 3 octaves. */
export function kscDb(note: number, leftDepth: number, rightDepth: number, leftCurve: number, rightCurve: number): number {
  const offset = note - 60
  if (!offset) return 0
  const [depth, curve] = offset > 0 ? [rightDepth, rightCurve] : [leftDepth, leftCurve]
  const octaves = Math.abs(offset) / 12
  const exp = curve === 1 || curve === 2
  const amount = exp ? (2 ** octaves - 1) / 7 : octaves / 3
  const db = (depth / 127) * 48 * amount
  return curve <= 1 ? -db : db
}

/** Detune −64…+63 as the DX shows it: a frequency factor (estimate: 1.00034 per step, from the RDX emulator, PLAN §0). */
export const detuneFactor = (detune: number) => 1.00034 ** (detune - 64)

/** Feedback, measured (OP1 alone at C3, 2026-10-26): it doesn't feed the output back into the phase as on the DX7, it
 *  shapes the wave, from a sine to a saw (all harmonics, 1/n) or a square (odd ones), the same at any output level,
 *  and never turns to noise. Per feedback value: the loudness against a sine (dB) and the harmonics against H1 (dB):
 *  saw H1…H8, square H1, H3, H5, H7. */
const SAW: readonly [number, number, readonly number[]][] = [
  [0, 0, [0, -120, -120, -120, -120, -120, -120, -120]],
  [32, 0, [0, -15.3, -27.1, -37.5, -47.1, -56.3, -65.1, -73.5]],
  [48, 0, [0, -11.4, -19.4, -26, -31.8, -37.2, -42.2, -47.1]],
  [64, -0.1, [0, -9, -14.7, -19.1, -22.8, -26.1, -29, -31.8]],
  [80, -0.5, [0, -7.6, -12.1, -15.4, -18.1, -20.4, -22.3, -24.1]],
  [96, -1.7, [0, -6.8, -10.9, -13.7, -16, -17.9, -19.5, -20.9]],
  [104, -2.7, [0, -6.6, -10.5, -13.3, -15.5, -17.2, -18.8, -20.1]],
  [112, -3.9, [0, -6.5, -10.3, -13, -15.1, -16.8, -18.3, -19.5]],
  [120, -5.3, [0, -6.4, -10.1, -12.8, -14.8, -16.5, -17.9, -19.1]],
  [127, -6.6, [0, -6.3, -10, -12.6, -14.6, -16.3, -17.6, -18.8]],
]
const SQUARE: readonly [number, number, readonly number[]][] = [
  [0, 0, [0, -120, -120, -120]],
  [32, -0.1, [0, -21, -31.3, -38.5]],
  [48, -0.1, [0, -17, -25.2, -31.3]],
  [64, -0.3, [0, -14.4, -20.8, -25.6]],
  [80, -0.7, [0, -12.6, -17.9, -21.6]],
  [96, -1.6, [0, -11.6, -16.3, -19.5]],
  [104, -2.5, [0, -11.3, -15.9, -18.9]],
  [112, -3.6, [0, -11.1, -15.7, -18.6]],
  [120, -4.9, [0, -11, -15.5, -18.4]],
  [127, -6.1, [0, -10.9, -15.3, -18.1]],
]

/** An operator's wave for feedback 0–127, saw or square: the loudness against a sine (dB) and the amplitude of
 *  every harmonic up to `maxHarmonic` against H1. Between the measured values, linear in dB; above H8 (H7 for the
 *  square) the harmonics go on falling as a power law through the last two measured. */
export function feedbackWave(feedback: number, square: boolean, maxHarmonic: number): { gainDb: number; harmonics: number[] } {
  const table = square ? SQUARE : SAW
  const i = Math.max(0, table.findIndex(([f]) => f >= feedback) - 1)
  const [f0, g0, h0] = table[i]
  const [f1, g1, h1] = table[Math.min(table.length - 1, i + 1)]
  const t = f1 === f0 ? 0 : Math.max(0, Math.min(1, (feedback - f0) / (f1 - f0)))
  const db = h0.map((x, k) => x + (h1[k] - x) * t)
  // the measured harmonic numbers: 1…8, or the odd 1, 3, 5, 7
  const n = db.map((_, k) => (square ? 2 * k + 1 : k + 1))
  const last = db.length - 1
  const power = (db[last - 1] - db[last]) / 20 / Math.log10(n[last] / n[last - 1])
  const harmonics: number[] = []
  for (let h = 1; h <= maxHarmonic; h++) {
    if (square && h % 2 === 0) { harmonics.push(0); continue }
    const k = n.indexOf(h)
    harmonics.push(k >= 0 ? 10 ** (db[k] / 20) : 10 ** (db[last] / 20) * (n[last] / h) ** power)
  }
  return { gainDb: g0 + (g1 - g0) * t, harmonics }
}

/** LFO speed 0–127 → Hz (estimate: 0.06 … 50 Hz, exponential). */
export const lfoHz = (speed: number) => 0.06 * 2 ** ((speed / 127) * Math.log2(50 / 0.06))
/** LFO delay 0–127 → seconds before the LFO starts, then as long again to fade in (estimate: up to ~5 s). */
export const lfoDelayS = (delay: number) => (delay ? 0.01 * 2 ** ((delay / 127) * 9) : 0)
/** LFO PMD 0–127 → the pitch swing at the top, in semitones (estimate: a semitone at 64, an octave at 127). */
export const pitchModSemitones = (pmd: number) => 12 * (pmd / 127) ** 3.6
/** LFO AMD 0–127 → how far an operator's level dips at the LFO's bottom, in dB (estimate). */
export const ampModDb = (amd: number) => 48 * (amd / 127) ** 1.5

/** Pitch EG level byte (0x10–0x70) → semitones, 0x40 none. */
export const pitchEgSemitones = (level: number) => level - 0x40
/** Pitch EG rate 0–127 → semitones per second (estimate: doubling every 10, ~45 at 64). */
export const pitchEgSemitonesPerS = (rate: number) => 0.5 * 2 ** (rate / 10) + 0.5
