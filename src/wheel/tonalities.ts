// The twelve tonalities as data (PLAN §8.2): each has a skeleton (algorithm, and per operator its ratio or fixed
// frequency, level, feedback, detune), what it brings into another tonality's voice (a branch: a pair, or one
// operator alone; a graft: a modulator into the base's carrier), and the words it lends a name. Starting points to
// tune on the DX: change the numbers here, not the code.
// The reface's own scale (docs/SOUND.md): a modulator at 1 : 1 adds a touch at ~50, clearly at ~65, strongly at ~75,
// and from 80 the harmonics outgrow the fundamental. Every operator has feedback: saw for all harmonics, square for
// odd ones, both noisy near the top. Where a style family (style/templates.ts) matched, its tuned numbers are taken.
// Operators are 0-based (0 = OP1), algorithms 1–12 as the DX numbers them.
import { ALGORITHMS } from '../params/algorithms'
import { fixedBytes, ratioBytes } from '../params/display'
import { initVoice } from '../params/init'
import { cloneVoice, type Voice } from '../sysex/codec'
import type { Rng } from '../style/random'
import type { Envelope } from '../style/shapes'
import type { Tonality } from './choices'

/** A list is a choice, a [lo, hi] pair a range (spread around its middle). */
type Choice = number | readonly number[]
type Range = number | readonly [lo: number, hi: number]

export interface OpSpec {
  ratio?: Choice
  /** a fixed frequency in Hz, as a range */
  fixed?: readonly [lo: number, hi: number]
  /** 0–127 */
  level: Range
  /** 0–127 */
  feedback?: Range
  square?: boolean
  /** −64 … +63 */
  detune?: Range
  /** 0–127 */
  velocity?: Range
  /** dies away fast whatever the shape */
  fast?: boolean
}

type Ops = readonly [OpSpec, OpSpec | null, OpSpec | null, OpSpec | null]

export interface Skeleton {
  /** 1–12; every one listed must keep the operator roles the specs assume */
  algorithms: readonly number[]
  /** null: silent, free for a branch */
  ops: Ops
  shape: Envelope
  /** operators another tonality may take over: a carrier and its modulator, or a carrier alone */
  branches?: readonly (readonly [number] | readonly [number, number])[]
  /** delayed vibrato on every operator: LFO speed, delay, PMD */
  vibrato?: readonly [speed: number, delay: number, depth: number]
  /** a short pitch fall (above) or scoop (below) into the note */
  pitchBlip?: 'above' | 'below'
  /** −1 short … +1 long, when no length is chosen */
  length?: number
}

/** What a tonality brings as a voice of its own inside another: a carrier and its modulator, or for a lone
 *  operator `solo`, a carrier whose feedback carries the tonality (the reface's own way: no modulator needed). */
export interface BranchSpec {
  carrier: OpSpec
  modulator: OpSpec
  solo: OpSpec
}

/** What a tonality brings grafted into another: a modulator in the base's main carrier, a hybrid rather than a
 *  layer. Its ratio is to the carrier's; its level grows with the pin's share, low … high. */
export interface GraftSpec {
  ratio: readonly number[]
  level: readonly [number, number]
  fast?: boolean
  velocity?: number
  /** square feedback near the top: the modulator roughens the carrier with noise */
  noise?: boolean
}

export interface TonalityDef {
  skeleton: Skeleton
  branch: BranchSpec
  graft?: GraftSpec
  /** a word for names: as the noun, and as the adjective */
  noun: string
  adjective: string
}

export const TONALITY_DEFS: Record<Tonality, TonalityDef> = {
  // two 1 : 1 pairs, gently modulated, a little apart
  warm: {
    noun: 'Sine', adjective: 'Round',
    skeleton: {
      algorithms: [8], shape: 'bowed', branches: [[2, 3]],
      ops: [
        { ratio: 1, level: 120, feedback: [0, 15] },
        { ratio: [1, 2], level: [42, 54] },
        { ratio: [1, 0.5], level: [100, 110], detune: [3, 6] },
        { ratio: 1, level: [32, 46] },
      ],
    },
    branch: { carrier: { ratio: [1, 0.5], level: [104, 114] }, modulator: { ratio: 1, level: [36, 50] }, solo: { ratio: [1, 0.5], level: [104, 114], feedback: [0, 20] } },
  },
  // odd harmonics: square feedback on the carrier, a modulator at twice its frequency (style: the hollow character)
  reed: {
    noun: 'Reed', adjective: 'Reedy',
    skeleton: {
      algorithms: [8], shape: 'bowed', branches: [[2, 3]], vibrato: [70, 80, 7],
      ops: [
        { ratio: 1, level: 120, feedback: [45, 70], square: true },
        { ratio: 2, level: [60, 70], velocity: [30, 50] },
        { ratio: 1, level: [98, 108], detune: [2, 5], feedback: [30, 50], square: true },
        { ratio: [3, 2], level: [44, 56] },
      ],
    },
    branch: { carrier: { ratio: 1, level: [104, 114], feedback: [40, 60], square: true }, modulator: { ratio: 2, level: [58, 68] }, solo: { ratio: 1, level: [104, 114], feedback: [70, 95], square: true } },
    graft: { ratio: [2], level: [52, 72] },
  },
  // the style's brass: a deep 1 : 1 modulator with saw feedback, the brightness swelling into the note
  brass: {
    noun: 'Brass', adjective: 'Brassy',
    skeleton: {
      algorithms: [1, 5], shape: 'swell',
      ops: [
        { ratio: 1, level: 120 },
        { ratio: 1, level: [100, 110], feedback: [30, 50], velocity: [40, 60] },
        { ratio: [1, 2], level: [50, 70] },
        { ratio: [1, 2], level: [30, 50] },
      ],
    },
    branch: { carrier: { ratio: 1, level: [106, 116], detune: [2, 4] }, modulator: { ratio: 1, level: [86, 96], velocity: [40, 55] }, solo: { ratio: 1, level: [104, 114], feedback: [85, 100] } },
  },
  // the style's strings: two detuned saws (saw feedback on both carriers), lightly modulated, bowed, vibrato
  string: {
    noun: 'Strings', adjective: 'Bowed',
    skeleton: {
      algorithms: [8], shape: 'bowed', branches: [[2, 3]], vibrato: [75, 60, 6], length: 0.3,
      ops: [
        { ratio: 1, level: 115, feedback: [75, 95], detune: [-10, -6] },
        { ratio: [1, 2], level: [40, 52] },
        { ratio: 1, level: 112, feedback: [75, 95], detune: [6, 10] },
        { ratio: [2, 1], level: [36, 48] },
      ],
    },
    branch: { carrier: { ratio: 1, level: [104, 112], feedback: [75, 95], detune: [6, 10] }, modulator: { ratio: [1, 2], level: [36, 48] }, solo: { ratio: 1, level: [104, 112], feedback: [80, 100], detune: [6, 10] } },
  },
  // the style's wind: breath at the start (a fixed-frequency noise modulator that dies away), a reedy body,
  // delayed vibrato
  breath: {
    noun: 'Flute', adjective: 'Airy',
    skeleton: {
      algorithms: [5], shape: 'bowed', vibrato: [70, 80, 7],
      ops: [
        { ratio: 1, level: 120, feedback: [15, 35] },
        { ratio: [1, 2], level: [64, 76], velocity: [40, 60] },
        { fixed: [1500, 4000], level: [74, 86], feedback: [115, 127], square: true, fast: true },
        { ratio: [3, 1], level: [36, 50] },
      ],
    },
    branch: { carrier: { ratio: [1, 2], level: [96, 106] }, modulator: { fixed: [1500, 4000], level: [70, 82], feedback: [115, 127], square: true }, solo: { ratio: [1, 2], level: [92, 102], feedback: [112, 120], square: true } },
  },
  // the style's FM noise: every operator into OP1, three at fixed frequencies, square feedback near the top
  // (flatness 0.87 on the DX, docs/SOUND.md)
  noise: {
    noun: 'Noise', adjective: 'Noisy',
    skeleton: {
      algorithms: [5, 4], shape: 'struck',
      ops: [
        { ratio: [1, 2], level: 118, feedback: [118, 127], square: true },
        { fixed: [1500, 6000], level: [120, 127], feedback: [120, 127], square: true },
        { fixed: [200, 900], level: [120, 127], feedback: [120, 127], square: true },
        { fixed: [2000, 5000], level: [120, 127], feedback: [120, 127], square: true },
      ],
    },
    branch: { carrier: { ratio: [1, 2], level: [96, 108], feedback: [118, 127], square: true }, modulator: { fixed: [1500, 6000], level: [118, 127], feedback: [120, 127], square: true }, solo: { ratio: [1, 2], level: [96, 108], feedback: [122, 127], square: true } },
    // noise only comes from high levels (in the probe engine feedback follows the operator's level, as on the DX7:
    // flatness 0.03 at 110, 0.3 at 120; whether the reface does too, its feedback takes will tell)
    graft: { ratio: [1, 3.5], level: [106, 124], noise: true },
  },
  // dense inharmonic: three modulators into one carrier, none at whole ratios, one buzzing
  metallic: {
    noun: 'Metal', adjective: 'Metal',
    skeleton: {
      algorithms: [5, 4], shape: 'struck', length: 0.3,
      ops: [
        { ratio: [1, 1.41], level: 120 },
        { ratio: [1.41, 2.62], level: [76, 86] },
        { ratio: [2.27, 1.73], level: [68, 78] },
        { ratio: [5.19, 7.07], level: [60, 72], feedback: [40, 70] },
      ],
    },
    branch: { carrier: { ratio: [1.41, 2.27], level: [100, 110] }, modulator: { ratio: [3.14, 5.19], level: [70, 80] }, solo: { ratio: [1.41, 2.27], level: [100, 110], feedback: [95, 110], square: true } },
  },
  // the style's bell: inharmonic pairs that ring long
  bell: {
    noun: 'Bell', adjective: 'Bell',
    skeleton: {
      algorithms: [8], shape: 'struck', branches: [[2, 3]], length: 0.6,
      ops: [
        { ratio: 1, level: 120 },
        { ratio: [3.5, 2.78, 1.41], level: [65, 80] },
        { ratio: [2, 3], level: 100, detune: [3, 6] },
        { ratio: [7.07, 5.19, 9.33], level: [55, 70], fast: true },
      ],
    },
    branch: { carrier: { ratio: [1, 2], level: [100, 110] }, modulator: { ratio: [3.5, 1.41], level: [62, 74] }, solo: { ratio: [3.5, 2.78], level: [92, 102] } },
    graft: { ratio: [3.5, 1.41, 2.78], level: [55, 72] },
  },
  // clean high partials, a sparkle at the start
  glass: {
    noun: 'Glass', adjective: 'Glassy',
    skeleton: {
      algorithms: [8], shape: 'struck', branches: [[2, 3]],
      ops: [
        { ratio: 1, level: 118 },
        { ratio: [5, 7], level: [46, 58] },
        { ratio: [4, 3], level: [96, 106] },
        { ratio: [14, 7], level: [50, 62], fast: true },
      ],
    },
    branch: { carrier: { ratio: [4, 7], level: [92, 104] }, modulator: { ratio: 14, level: [48, 60], fast: true }, solo: { ratio: [4, 7, 5], level: [90, 100] } },
    // the style's glassy character: a 7 or 14 : 1 modulator that rings over the start
    graft: { ratio: [7, 14], level: [70, 92], fast: true },
  },
  // the style's e-piano: a 1 : 1 body with real depth, a 14 : 1 tine loud for the first moment, both on velocity
  tine: {
    noun: 'E.Piano', adjective: 'Tine',
    skeleton: {
      algorithms: [8], shape: 'struck',
      ops: [
        { ratio: 1, level: 125, velocity: [30, 50] },
        { ratio: 1, level: [84, 92], velocity: [30, 45] },
        { ratio: 1, level: 110, detune: [3, 6] },
        { ratio: [14, 13, 15], level: [80, 90], velocity: [55, 70], fast: true },
      ],
    },
    branch: { carrier: { ratio: 1, level: [104, 114], detune: [3, 6] }, modulator: { ratio: 14, level: [78, 88], velocity: [55, 70], fast: true }, solo: { ratio: [14, 7], level: [80, 92], velocity: [55, 70], fast: true } },
    graft: { ratio: [14], level: [70, 90], fast: true, velocity: 60 },
  },
  // short and knocky: a low body, quickly dying high modulators, a pitch fall into the note
  wooden: {
    noun: 'Marimba', adjective: 'Wood',
    skeleton: {
      algorithms: [3, 1], shape: 'pluck', pitchBlip: 'above', length: -0.4,
      ops: [
        { ratio: 1, level: 125 },
        { ratio: [4, 3], level: [62, 74], fast: true },
        { ratio: [1, 2], level: [48, 60], fast: true },
        { ratio: [3, 10], level: [50, 62], fast: true },
      ],
    },
    branch: { carrier: { ratio: [4, 3], level: [94, 104] }, modulator: { ratio: 1, level: [56, 66], fast: true }, solo: { ratio: [4, 3], level: [90, 100], fast: true } },
  },
  // the style's organ: four carriers at drawbar ratios; each one alone is a place for another tonality
  organ: {
    noun: 'Organ', adjective: 'Organ',
    skeleton: {
      algorithms: [12], shape: 'gate', vibrato: [95, 0, 5], branches: [[3], [2]],
      ops: [
        { ratio: [0.5, 1], level: [105, 115] },
        { ratio: [1, 2], level: [115, 125] },
        { ratio: [2, 3], level: [90, 105] },
        { ratio: [3, 4, 6], level: [70, 90] },
      ],
    },
    branch: { carrier: { ratio: 2, level: [96, 106] }, modulator: { ratio: 1, level: [30, 44] }, solo: { ratio: [2, 4], level: [92, 104] } },
  },
}

// ---------- building a skeleton ----------

/** A value from a choice list: near the middle (spread below 0.6) the first two, wilder any. */
export function choose(c: Choice, rng: Rng, spread: number): number {
  if (typeof c === 'number') return c
  return c[rng.int(0, Math.min(c.length - 1, spread >= 0.6 ? c.length - 1 : 1))]
}

/** A value in a range: around its middle, the wider the spread (1 = anywhere in it, a little beyond). */
export function within(r: Range, rng: Rng, spread: number): number {
  if (typeof r === 'number') return r
  const [lo, hi] = r
  return Math.round((lo + hi) / 2 + (rng.next() - 0.5) * (hi - lo) * Math.min(1.3, spread * 1.3))
}

const clamp = (x: number, lo = 0, hi = 127) => Math.max(lo, Math.min(hi, Math.round(x)))

/** One operator from its spec, on top of what it has (on, envelope and scaling stay). In place. */
export function applyOpSpec(v: Voice, op: number, s: OpSpec, rng: Rng, spread: number) {
  const o = v.ops[op]
  o[0x00] = 1
  if (s.fixed) {
    o.set([1, ...fixedBytes(Math.exp(rng.range(Math.log(s.fixed[0]), Math.log(s.fixed[1]))))], 0x15)
  } else {
    o.set([0, ...ratioBytes(choose(s.ratio ?? 1, rng, spread))], 0x15)
  }
  o[0x12] = clamp(within(s.level, rng, spread))
  o[0x13] = s.feedback === undefined ? 0 : clamp(within(s.feedback, rng, spread))
  o[0x14] = s.square ? 1 : 0
  o[0x18] = clamp(64 + (s.detune === undefined ? 0 : within(s.detune, rng, spread)))
  o[0x11] = s.velocity === undefined ? 0 : clamp(within(s.velocity, rng, spread))
}

/** The skeleton on top of VOICE INIT: algorithm, operators (silent ones at level 0, still on, so the DX and a
 *  .syx play the same), vibrato. */
export function buildSkeleton(s: Skeleton, rng: Rng, spread: number): Voice {
  const v = cloneVoice(initVoice())
  v.common[0x10] = choose(s.algorithms, rng, spread) - 1
  s.ops.forEach((spec, op) => {
    if (spec) applyOpSpec(v, op, spec, rng, spread)
    else v.ops[op][0x12] = 0
  })
  if (s.vibrato) {
    v.common.set([0, s.vibrato[0], s.vibrato[1], s.vibrato[2]], 0x11)
    for (const o of v.ops) o[0x0f] = 1
  } else {
    v.common[0x14] = 0
  }
  return v
}

/** The operators a skeleton marks as transients. */
export const fastOps = (s: Skeleton) => s.ops.flatMap((spec, op) => (spec?.fast ? [op] : []))

/** Whether every algorithm a skeleton lists gives its specs the roles they assume: the first operator a carrier,
 *  and a branch's first operator a carrier and its second (if any) a modulator of it. */
export function rolesHold(s: Skeleton): boolean {
  return s.algorithms.every((n) => {
    const a = ALGORITHMS[n - 1]
    if (!a.carriers.includes(0)) return false
    return (s.branches ?? []).every(([c, m]) => a.carriers.includes(c) && (m === undefined || a.modulations.some(([from, to]) => from === m && to === c)))
  })
}
