// The reface DX's curves for the probe engine (PLAN §8): what a value 0–127 does, in dB, seconds and cycles.
// Measured on the DX with tools/dxCurves.ts (docs/SOUND.md): envelope rates and release, modulator depth, output
// and EG level, feedback, velocity, keyboard level and rate scaling, detune, the LFO and the pitch EG.
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

/** Output level below 32, measured (dB against 127): it falls faster there. 1 extends the slope below 8. */
const LOW_LEVEL_DB: readonly [number, number][] = [[1, -72], [8, -59.6], [16, -47.6], [24, -41.7], [32, -35.6]]
/** Output level 0–127 → dB (0 at 127): 0.375 dB a step down to 32, measured; 0 is silent. */
export function levelDb(level: number): number {
  if (level <= 0) return SILENT_DB
  return level >= 32 ? -(127 - level) * TUNING.levelStepDb : lerp(LOW_LEVEL_DB, level)
}

/** EG level 0–127 → dB, measured: gentler than the output level (127 → 8 is 36 dB). 0 is silent; 1 extends the
 *  slope below 8. */
const EG_LEVEL_DB: readonly [number, number][] = [
  [1, -60], [8, -36], [16, -29.9], [24, -25.7], [32, -22.4], [48, -17.4], [64, -13], [80, -9.1], [96, -5.7], [112, -2.6], [127, 0],
]
export const egLevelDb = (level: number) => (level <= 0 ? SILENT_DB : lerp(EG_LEVEL_DB, level))

/** Attack: seconds from 1 % to 90 % for R1 = 10, 20 … 120, measured (docs/SOUND.md; 10 and 20 extrapolated: the
 *  takes were too short), less what RISE_S adds: the envelope itself is near instant from 100. */
const ATTACK_S = [9.8, 4.9, 2.44, 1.27, 0.632, 0.306, 0.135, 0.03, 0.018, 0.006, 0.004, 0.004]
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

/** An operator's level follows its envelope up with this time constant, down at once (measured 2026-10-26,
 *  local fastdecay takes): no note gets louder faster than ~21 ms to 90 %, and a fast first decay starts before
 *  the rise is done, so it takes the peak down (R2 60: −1.6 dB, 80: −3.3, 95: −6); with L2 at 64 the note rises
 *  straight to L2. */
export const RISE_S = 0.009
/** A rise heads for this many times its target and stops there (measured, tools/curves.ts attack takes): the
 *  amplitude approaches it exponentially, so a rise starts fast and slows into the top. */
export const ATTACK_OVERSHOOT = 1.5
/** Rising: the time constant of that approach at rate 0–127, seconds, so 90 % comes at the measured time. */
export const attackTau = (rate: number) => interpolate(ATTACK_S, rate) / -Math.log(1 - 0.9 / ATTACK_OVERSHOOT)
/** Falling, dB per second at rate 0–127. */
export const decayDbPerS = (rate: number) => 20 / interpolate(DECAY_S, rate)

/** Release (R4): seconds to −20 dB for R4 = 10, 20 … 120, measured from 40 (10–30 as the decay doubles, 2026-10-26):
 *  like the decay up to 80, faster above, instant from 110. */
const RELEASE_S = [27, 13.6, 6.8, 3.5, 1.7, 0.836, 0.36, 0.156, 0.05, 0.016, 0.002, 0.001]
export const releaseDbPerS = (rate: number) => 20 / interpolate(RELEASE_S, rate)

/** Rate scaling 0–127: the speed multiplier at `note`, measured: centred on C3 (MIDI 60), slower below and faster
 *  above, twice as fast an octave up at 127 (64: 1.38 ×). */
export const rateScale = (note: number, scaling: number) => 2 ** (((scaling / 127) * (note - 60)) / 12)

/** Velocity sensitivity 0–127: dB at a velocity, measured: full sensitivity takes 0.375 dB (an output level step)
 *  per velocity step below 127, half sensitivity half as much. */
export const velocityDb = (velocity: number, sensitivity: number) => -(sensitivity / 127) * (127 - Math.max(1, Math.min(127, velocity))) * TUNING.levelStepDb

/** Keyboard level scaling around C3 (MIDI 60, the DX's break point): dB at `note` for one side's depth 0–127 and
 *  curve (0 −lin, 1 −exp, 2 +exp, 3 +lin), measured: at full depth linear is 18 dB an octave, exponential 9 dB times
 *  the octaves squared (9, 36, 81), both proportional to the depth. Up, it stops at full level (Note.start). */
export function kscDb(note: number, leftDepth: number, rightDepth: number, leftCurve: number, rightCurve: number): number {
  const offset = note - 60
  if (!offset) return 0
  const [depth, curve] = offset > 0 ? [rightDepth, rightCurve] : [leftDepth, leftCurve]
  const octaves = Math.abs(offset) / 12
  const exp = curve === 1 || curve === 2
  const db = (depth / 127) * (exp ? 9 * octaves * octaves : 18 * octaves)
  return curve <= 1 ? -db : db
}

/** Detune −64…+63 as the DX shows it: a frequency factor, measured: 0.59 cents a step (−37.6 … +36.9 cents). */
export const detuneFactor = (detune: number) => 1.00034 ** (detune - 64)

/** Feedback, measured on the DX (tools/dxCurves.ts feedback, tools/voiceProbe.ts noisegap, 2026-10-26): the operator's
 *  own wave, smoothed by a one-pole low-pass (FEEDBACK_SMOOTHING), moves its phase. Saw feeds back the wave itself
 *  (all harmonics, towards a saw), square its absolute value (odd harmonics, towards a square). The wave, not the
 *  output, is fed back, so it is the same at any level, unlike the DX7. The saw builds up an offset, which the DX's
 *  output blocks: that's why it is quieter at the top (−6.6 dB at 127). Under fast modulation the loop is scrambled:
 *  the offset goes (a modulated carrier with feedback is as loud as a sine) and noise comes in. */
export const FEEDBACK_SMOOTHING = 0.2
/** The loop gain (cycles of phase per unit of the smoothed wave) at feedback 0, 32 … 127: saw, square. Fitted to the
 *  DX's harmonics and loudness by hand (tools/engineCurves.ts feedback: H2–H5 within 0.6 dB, loudness 0.5 dB). */
const FEEDBACK_GAIN: readonly [number, number, number][] = [
  [0, 0, 0], [32, 0.055, 0.057], [48, 0.093, 0.095], [64, 0.14, 0.14], [80, 0.2, 0.2], [96, 0.29, 0.27],
  [104, 0.33, 0.32], [112, 0.42, 0.4], [120, 0.52, 0.5], [127, 0.6, 0.62],
]
/** An operator's feedback 0–127 as its loop gain, saw or square. */
export function feedbackGain(feedback: number, square: boolean): number {
  return lerp(FEEDBACK_GAIN.map(([f, saw, sq]) => [f, square ? sq : saw] as const), feedback)
}
/** Between table points, linear in the logarithm (for positive values). */
const logLerp = (table: readonly (readonly [number, number])[], x: number) => Math.exp(lerp(table.map(([a, b]) => [a, Math.log(b)] as const), x))

/** LFO speed 0–127 → Hz, measured (0: a cycle of ~28 s). */
const LFO_HZ: readonly [number, number][] = [[0, 0.036], [16, 0.7], [32, 1.3], [48, 2], [64, 2.7], [80, 4.4], [96, 8.4], [112, 17.5], [127, 39.7]]
export const lfoHz = (speed: number) => logLerp(LFO_HZ, speed)
/** LFO delay 0–127 → seconds before it starts and seconds it then takes to fade in, measured (to 0.1 s). */
const LFO_DELAY: readonly [number, number, number][] = [[0, 0, 0], [32, 0.05, 0.1], [64, 0.35, 0.2], [96, 1.05, 0.5], [112, 1.75, 0.4], [127, 2.95, 0.3]]
export const lfoDelayS = (delay: number): [wait: number, fade: number] => [lerp(LFO_DELAY.map(([d, w]) => [d, w]), delay), lerp(LFO_DELAY.map(([d, , f]) => [d, f]), delay)]
/** LFO PMD 0–127 → the pitch swing at the top, semitones, measured: quadratic, ±24 at 127 (±6 at 64). */
export const pitchModSemitones = (pmd: number) => 23.9 * (pmd / 127) ** 2
/** LFO AMD 0–127 → how far an operator's level dips from top to bottom of the LFO, dB, measured: quadratic, 24.7 at
 *  64, 56 at 96 (127 goes below the takes' noise floor: ~98 by the same curve). */
export const ampModDb = (amd: number) => 98 * (amd / 127) ** 2

/** Pitch EG level byte (0x10–0x70) → semitones, 0x40 none. */
export const pitchEgSemitones = (level: number) => level - 0x40
/** Pitch EG rate 0–127 → semitones per second, measured (a fall of 12 semitones at 20 in 0.8 s, at 40 in 0.19 s, at
 *  60 in 26 ms, instant from 80; 0 extends the slope). The pitch EG starts each note at L1, not L4 (measured). */
const PEG_SEMITONES_PER_S: readonly [number, number][] = [[0, 3.3], [20, 14.5], [40, 63], [60, 450], [80, 5000], [127, 100000]]
export const pitchEgSemitonesPerS = (rate: number) => logLerp(PEG_SEMITONES_PER_S, rate)
