// The families' skeletons (PLAN §7.2) as data: algorithm(s), and per operator its ratio (or fixed frequency),
// level, feedback and detune. Starting points to tune by ear on the DX: change the numbers here, not the code.
// A modulator's level sets its depth steeply (docs/SOUND.md): ~50 a touch, ~65 clearly, ~75 strong, 85+ very bright.
// A list of values is a choice (Init picks among the first two, Randomize among all); a [lo, hi] pair is a range.
import { initVoice } from '../params/init'
import { fixedBytes, ratioBytes } from '../params/display'
import type { Voice } from '../sysex/codec'
import { cloneVoice } from '../sysex/codec'
import { MODE_BYTE, type Family, type Space } from './choices'
import type { Rng } from './random'
import type { Envelope } from './shapes'

type Choice = number | readonly number[]
type Range = number | readonly [lo: number, hi: number]

interface OpSpec {
  ratio?: Choice
  /** fixed frequency in Hz, as a range: percussion */
  fixed?: readonly [lo: number, hi: number]
  level: Range
  feedback?: Range
  square?: boolean
  detune?: Range
  velocity?: Range
  /** a transient: decays fast whatever the shape (the e-piano's tine, a bell's clang) */
  fast?: boolean
}

export interface Template {
  /** 1–12, as the DX numbers them; every one listed keeps OP roles the specs assume */
  algorithms: readonly number[]
  ops: readonly [OpSpec, OpSpec, OpSpec, OpSpec]
  shape: Envelope
  /** the space when none is chosen */
  space: Space
  mono?: 'mono' | 'legato'
  portamento?: number
  transpose?: number
  /** delayed vibrato: LFO speed, delay, pitch modulation depth (on every operator); PMD is quadratic (docs/SOUND.md),
   *  so below ~10 a vibrato is not heard */
  vibrato?: readonly [speed: number, delay: number, depth: number]
  /** length when none is chosen (−1 short … 1 long) */
  length?: number
}

export const TEMPLATES: Record<Family, Template> = {
  bass: {
    algorithms: [1, 3], shape: 'pluck', space: 'dry', transpose: -12, length: -0.2,
    ops: [
      { ratio: [0.5, 1], level: 120, feedback: [0, 20] },
      { ratio: [0.5, 1, 2], level: [72, 85], feedback: [20, 50], velocity: [30, 50] },
      { ratio: [1, 2], level: [50, 65], velocity: [30, 50] },
      { ratio: [1, 3], level: [20, 45] },
    ],
  },
  organ: {
    algorithms: [12], shape: 'gate', space: 'room', vibrato: [95, 0, 10],
    ops: [
      { ratio: [0.5, 1], level: [105, 115] },
      { ratio: [1, 2], level: [115, 125] },
      { ratio: [2, 3], level: [90, 105] },
      { ratio: [3, 4, 6], level: [70, 90] },
    ],
  },
  // two detuned saws (saw feedback on both carriers), lightly modulated: measured, the first version was as close
  // to brass as another seed is
  strings: {
    algorithms: [8], shape: 'bowed', space: 'hall', vibrato: [82, 60, 12],
    ops: [
      { ratio: 1, level: 115, feedback: [75, 95], detune: [-10, -6] },
      { ratio: [1, 2], level: [40, 52] },
      { ratio: 1, level: 112, feedback: [75, 95], detune: [6, 10] },
      { ratio: [2, 1], level: [36, 48] },
    ],
  },
  pluck: {
    algorithms: [1, 2], shape: 'pluck', space: 'room',
    ops: [
      { ratio: 1, level: 125, feedback: [0, 25] },
      { ratio: [1, 2], level: [80, 95], velocity: [40, 60] },
      { ratio: [3, 2], level: [55, 70], fast: true },
      { ratio: [1, 5], level: [30, 50], fast: true },
    ],
  },
  bell: {
    algorithms: [8], shape: 'struck', space: 'hall', length: 0.6,
    ops: [
      { ratio: 1, level: 120 },
      { ratio: [3.5, 2.78, 1.41], level: [65, 80] },
      { ratio: [2, 3], level: 100, detune: [3, 6] },
      { ratio: [7.07, 5.19, 9.33], level: [55, 70], fast: true },
    ],
  },
  // the body (OP2 → OP1) with real depth, the tine (OP4 at 14 : 1 → OP3) loud for the first moment: measured, the
  // first version was nearly a sine
  epiano: {
    algorithms: [8], shape: 'struck', space: 'room',
    ops: [
      { ratio: 1, level: 125, velocity: [30, 50] },
      { ratio: 1, level: [84, 92], velocity: [30, 45] },
      { ratio: 1, level: 110, detune: [3, 6] },
      { ratio: [14, 13, 15], level: [80, 90], velocity: [55, 70], fast: true },
    ],
  },
  // brighter than the strings, the brightness rising into the note, the pitch blip
  brass: {
    algorithms: [1, 5], shape: 'swell', space: 'room',
    ops: [
      { ratio: 1, level: 120 },
      { ratio: 1, level: [100, 110], feedback: [30, 50], velocity: [40, 60] },
      { ratio: [1, 2], level: [50, 70] },
      { ratio: [1, 2], level: [30, 50] },
    ],
  },
  // breath at the start (a fixed-frequency noise modulator that dies away), a reedy body (OP2, at 2 : 1 a clarinet's
  // odd harmonics), a little buzz (feedback), delayed vibrato
  wind: {
    algorithms: [5], shape: 'bowed', space: 'room', vibrato: [84, 80, 12],
    ops: [
      { ratio: 1, level: 120, feedback: [15, 35] },
      { ratio: [1, 2], level: [64, 76], velocity: [40, 60] },
      { fixed: [1500, 4000], level: [74, 86], feedback: [115, 127], square: true, fast: true },
      { ratio: [3, 1], level: [36, 50] },
    ],
  },
  lead: {
    algorithms: [1, 2], shape: 'gate', space: 'echo', mono: 'mono', portamento: 30, vibrato: [86, 70, 13],
    ops: [
      { ratio: 1, level: 125, feedback: [50, 80] },
      { ratio: [1, 2], level: [70, 90] },
      { ratio: [1, 2, 3], level: [40, 60] },
      { ratio: [1, 0.5], level: [20, 40] },
    ],
  },
  perc: {
    algorithms: [5, 2], shape: 'pluck', space: 'room', length: -0.6,
    ops: [
      { ratio: [1, 0.5], level: 120 },
      { fixed: [150, 900], level: [90, 110], feedback: [40, 80], square: true },
      { fixed: [1000, 4000], level: [60, 90], fast: true },
      { ratio: [1, 2.5], level: [40, 70], feedback: [90, 127] },
    ],
  },
  // noise as the sound: every operator into OP1, three at fixed frequencies, everything and its square feedback at
  // the top. Measured (tools/noiseProbe.ts), spectral flatness 0.87 at C1, C3 and C5 (1 is white noise); the first
  // version had 0.50 at C1 and 0.79 at C5. Mellow takes the modulators down and brings the pitch back.
  noise: {
    algorithms: [5, 4], shape: 'struck', space: 'room',
    ops: [
      { ratio: [1, 2], level: 118, feedback: [118, 127], square: true },
      { fixed: [1500, 6000], level: [120, 127], feedback: [120, 127], square: true },
      { fixed: [200, 900], level: [120, 127], feedback: [120, 127], square: true },
      { fixed: [2000, 5000], level: [120, 127], feedback: [120, 127], square: true },
    ],
  },
}

/** A value from a choice list: Init (small spread) picks among the first two, Randomize among all. */
function choose(c: Choice, rng: Rng, spread: number): number {
  if (typeof c === 'number') return c
  return c[rng.int(0, Math.min(c.length - 1, spread >= 0.6 ? c.length - 1 : 1))]
}

/** A value in a range: around its middle, the wider the spread (1 = anywhere in it). */
export function within(r: Range, rng: Rng, spread: number): number {
  if (typeof r === 'number') return r
  const [lo, hi] = r
  const mid = (lo + hi) / 2
  return Math.round(mid + (rng.next() - 0.5) * (hi - lo) * Math.min(1, spread * 2))
}

/** The family's skeleton on top of VOICE INIT: algorithm, ratios, levels, feedback, detune, play mode. */
export function buildTemplate(t: Template, rng: Rng, spread: number): Voice {
  const v = cloneVoice(initVoice())
  v.common[0x10] = (t.algorithms.length > 1 ? choose(t.algorithms, rng, spread) : t.algorithms[0]) - 1
  v.common[0x0c] = 0x40 + (t.transpose ?? 0)
  v.common[0x0d] = MODE_BYTE[t.mono ?? 'poly']
  v.common[0x0e] = t.portamento ?? 0
  if (t.vibrato) v.common.set([0, t.vibrato[0], t.vibrato[1], t.vibrato[2]], 0x11)
  t.ops.forEach((s, i) => {
    const op = v.ops[i]
    op[0x12] = within(s.level, rng, spread)
    op[0x13] = s.feedback === undefined ? 0 : within(s.feedback, rng, spread)
    op[0x14] = s.square ? 1 : 0
    op[0x18] = 64 + (s.detune === undefined ? 0 : within(s.detune, rng, spread))
    op[0x11] = s.velocity === undefined ? 0 : within(s.velocity, rng, spread)
    op[0x0f] = t.vibrato ? 1 : 0
    if (s.fixed) {
      const [coarse, fine] = fixedBytes(within(s.fixed, rng, spread))
      op.set([1, coarse, fine], 0x15)
    } else {
      const [coarse, fine] = ratioBytes(choose(s.ratio ?? 1, rng, spread))
      op.set([0, coarse, fine], 0x15)
    }
  })
  return v
}

/** The operators the template marks as transients. */
export const transients = (t: Template) => t.ops.flatMap((s, i) => (s.fast ? [i] : []))
