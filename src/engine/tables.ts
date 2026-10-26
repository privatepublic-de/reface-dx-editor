// The reface DX's curves for the probe engine (PLAN §8): what a value 0–127 does, in dB, seconds and cycles.
// Measured on the DX where docs/SOUND.md has a measurement (envelope rates, modulator depth); everything marked
// "estimate" is a guess with the DX7 as a model, to be replaced by a measurement (tools/dxCurves.ts).
// Not the DX7's tables: the reface has its own ranges and curves.

/** The constants fitted to the DX's takes (tools/engineCurves.ts --fit); an object so the fit can try values. */
export const TUNING = {
  /** envelope and output levels: dB per step below 127, from the modulator-depth curve */
  levelStepDb: 0.39,
  /** the modulation index of an operator at full level, in cycles (2π rad) */
  maxCycles: 2.0,
  /** feedback 127: how far an operator's own output moves its phase, per cycle of output */
  feedbackMax: 0.5,
  /** feedback steps per halving */
  feedbackHalving: 16,
}
/** Quieter than this is silence. */
export const SILENT_DB = -120

/** Level 0–127 → dB (0 at 127). Below 20 it falls faster, so 0 is silent (estimate, as the DX7's level table). */
export function levelDb(level: number): number {
  if (level <= 0) return SILENT_DB
  return -(127 - level) * TUNING.levelStepDb - Math.max(0, 20 - level) * 2.5
}

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

/** The span an attack is measured over: from the start floor to 1 dB below the top. */
export const ATTACK_FLOOR_DB = -60
/** Rising, dB per second at rate 0–127: an attack from 1 % (−40 dB) to 90 % (−0.9 dB) takes the measured time. */
export const attackDbPerS = (rate: number) => 39.1 / interpolate(ATTACK_S, rate)
/** Falling, dB per second at rate 0–127. */
export const decayDbPerS = (rate: number) => 20 / interpolate(DECAY_S, rate)

/** Rate scaling 0–127: the speed multiplier higher up the keyboard (estimate: the DX7's, up to about 3 octaves of
 *  speed at the top with full scaling). */
export function rateScale(note: number, scaling: number): number {
  const x = Math.min(31, Math.max(0, Math.floor(note / 3) - 7))
  return 2 ** (((scaling / 127) * 7 * x) / 8 / 4)
}

/** Velocity sensitivity 0–127: dB at a velocity, 0 at about 100 as on the DX7 (estimate). */
export const velocityDb = (velocity: number, sensitivity: number) => (sensitivity / 127) * 36 * Math.log2(Math.max(1, velocity) / 100) / 2

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

/** Feedback 0–127: how far an operator's own output moves its phase, per cycle of output (estimate until the
 *  feedback curve is recorded: at 127 a saw turns to noise, as feedback 7 does on the DX7). */
export const feedbackGain = (feedback: number) => (feedback ? TUNING.feedbackMax * 2 ** ((feedback - 127) / TUNING.feedbackHalving) : 0)

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
