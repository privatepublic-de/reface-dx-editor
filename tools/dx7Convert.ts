// The volca fm generator's Start from instruments (classic DX7 voices, six operators) as reface DX voices (four),
// PLAN §8.6, docs/SOUND.md "Instruments from the DX7". Both engines are the oracles: the volca's DX7 engine plays the
// original, the probe engine (measured on the reface) plays each candidate.
//
// 1. Every parameter by what it does, not by its number: levels by dB, envelope rates by fitting the curve over
//    time, velocity, keyboard level and rate scaling, detune, the LFO and the pitch EG through the measured tables;
//    feedback by the harmonics of a lone fed-back operator in both engines (fed back to noise: the reface's noise).
// 2. Six operators to four: every choice of three or four of the sounding operators (also after merging two at the
//    same frequency), the edges among them as they are or through a dropped operator, placed on each reface
//    algorithm that has that shape (or the same with fewer edges), in every numbering. Each candidate is played
//    beside the original at C2, C3 and C4: loudness over time and the spectrum in bands of harmonics, frame by
//    frame. The closest few are fine-tuned (levels, attack and first decay, feedback), the best is kept.
//
// tools/fromDx7.ts runs it over the instruments.
// Needs the volca fm generator checked out beside this repository; excluded from tsc for that reason.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { algorithmOf } from '../../volca-fm-generator/src/dx7/algorithms'
import { OP, opBase, VC, type Voice as DxVoice } from '../../volca-fm-generator/src/dx7/voice'
import { renderNote as dxRender } from '../../volca-fm-generator/src/engine/render'
import {
  AMP_MOD_DEPTH, lfoDelayRates, lfoHz as dxLfoHz, PITCH_LEVEL, PITCH_MOD_SENS, PITCH_RATE, PITCH_RATE_UNIT, scaleLevel, scaleOutLevel, scaleVelocity,
} from '../../volca-fm-generator/src/engine/tables'
import { DEFAULT_CHOICES } from '../../volca-fm-generator/src/generator/choices'
import { generate } from '../../volca-fm-generator/src/generator/generate'
import { INSTRUMENTS, type InstrumentId } from '../../volca-fm-generator/src/generator/instruments'
import { rng as dxRng } from '../../volca-fm-generator/src/generator/random'
import { attackTime, centroid, decayTime, envelope, flatness, slice, spectrum, toDb } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { envelopeDb } from '../src/engine/synth'
import { ampModDb, ATTACK_OVERSHOOT, attackTau, decayDbPerS, egLevelDb, kscDb, releaseDbPerS, levelDb, lfoDelayS, lfoHz, pitchEgSemitonesPerS, pitchModSemitones, velocityDb } from '../src/engine/tables'
import { ALGORITHMS } from '../src/params/algorithms'
import { fixedBytes, ratioBytes } from '../src/params/display'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'

export const volcaAt = process.env.VOLCA ?? join(process.cwd(), '../volca-fm-generator')

const DB_PER_UNIT = 6.0206 / 256
export const SR = 48000

// ---------- the sources ----------

/** The volca's comments name each original ("after STEINWAY (Original Yamaha/TX7/TX18 #18)"), the recipe's first,
 *  then its variants', in order. */
export function sourceNames(): Record<string, string[]> {
  const text = readFileSync(join(volcaAt, 'src/generator/instruments.ts'), 'utf8')
  const out: Record<string, string[]> = {}
  let id: string | null = null
  let pending: string | null = null
  for (const line of text.split('\n')) {
    const after = line.match(/^\s*\/\/ after (.*)$/)
    if (after) { pending = after[1]; continue }
    const key = line.match(/^  (\w+): \{/)
    if (key) { id = key[1]; out[id] = [pending ?? 'our own']; pending = null; continue }
    if (id && /^\s{6}\{\s*$/.test(line)) { out[id].push(pending ?? 'our own'); pending = null; continue }
    if (!/^\s*\/\//.test(line)) pending = null
  }
  return out
}

/** Each variant of an instrument as the volca plays it at Wild none: the seed whose first draw picks it. */
export function variantsOf(id: InstrumentId): DxVoice[] {
  const n = 1 + (INSTRUMENTS[id].variants?.length ?? 0)
  return Array.from({ length: n }, (_, k) => {
    let seed = 1
    while (n > 1 && dxRng(seed).int(0, n - 1) !== k) seed++
    return generate({ ...DEFAULT_CHOICES, instrument: id }, { seed, wild: 0 }).voice
  })
}

export const op = (v: DxVoice, n: number, p: keyof typeof OP) => v[opBase(n) + OP[p]]

// ---------- one operator, parameter by parameter ----------

/** Nearest x in lo…hi whose f(x) is closest to the target. */
export function invert(f: (x: number) => number, target: number, lo = 0, hi = 127): number {
  let best = lo
  for (let x = lo; x <= hi; x++) if (Math.abs(f(x) - target) < Math.abs(f(best) - target)) best = x
  return best
}

export const dxOutDb = (level: number) => (scaleOutLevel(level) - 127) * 32 * DB_PER_UNIT
export const dxEgDb = (level: number) => (((scaleOutLevel(level) >> 1) << 6) - (63 << 6)) * DB_PER_UNIT
const dxVelDb = (velocity: number, sens: number) => scaleVelocity(velocity, sens) * DB_PER_UNIT
/** Output level with keyboard scaling at a note, dB against full (the DX7 caps it at full). */
export const dxLevelAt = (v: DxVoice, n: number, note: number) =>
  (Math.min(127, scaleOutLevel(op(v, n, 'outputLevel')) + scaleLevel(note, op(v, n, 'breakPoint'), op(v, n, 'leftDepth'), op(v, n, 'rightDepth'), op(v, n, 'leftCurve'), op(v, n, 'rightCurve'))) - 127) * 32 * DB_PER_UNIT
const dxQrateBoost = (note: number, sens: number) => (sens * Math.min(31, Math.max(0, Math.floor(note / 3) - 7))) >> 3

/** The DX7's envelope as the volca engine runs it (MSFA's env.cc), dB against full, every `stepS`: held `holdS`. */
export function dxEnvelopeDb(rates: number[], levels: number[], outLevelUnits: number, rateBoost: number, holdS: number, totalS: number, stepS: number, stageStarts?: number[]): number[] {
  const subSteps = 8
  const incScale = (44100 / 64) * (stepS / subSteps)
  let level = 0
  let ix = 0
  let down = true
  let target = 0
  let rising = false
  let inc = 0
  let now = 0
  const advance = (i: number) => {
    ix = i
    if (stageStarts) stageStarts[i] = now
    if (i >= 4) return
    target = Math.max(16, ((scaleOutLevel(levels[i]) >> 1) << 6) + outLevelUnits - 4256)
    rising = target > level
    const qrate = Math.min(63, ((rates[i] * 41) >> 6) + rateBoost)
    inc = (((4 + (qrate & 3)) * 2 ** (8 + (qrate >> 2))) / 65536) * incScale
  }
  advance(0)
  const full = outLevelUnits + (63 << 6) - 4256
  const out: number[] = []
  for (let k = 0; k * stepS < totalS; k++) {
    if (down && k * stepS >= holdS) { now = k * stepS; down = false; advance(3) }
    for (let s = 0; s < subSteps; s++) {
      now = (k + s / subSteps) * stepS
      if (ix < 3 || (ix < 4 && !down)) {
        if (rising) {
          if (level < 1716) level = 1716
          level += Math.floor(17 - level / 256) * inc
          if (level >= target) { level = target; advance(ix + 1) }
        } else {
          level -= inc
          if (level <= target) { level = target; advance(ix + 1) }
        }
      }
    }
    out.push(level <= 16 ? -120 : (level - full) * DB_PER_UNIT)
  }
  return out
}

/** The fastest first decay after an attack whose peak the DX plays reliably (docs/SOUND.md "Right after the attack":
 *  up to 80 every take loses 2–3 dB; above, a take loses either a little or a lot, by where the key-on falls). */
const FIRST_FALL_MAX = 80
export const EG_STEP = 0.005
export const EG_HOLD = 3
export const EG_TOTAL = 5
/** Curve distance, dB, the start weighted more (an attack of 10 ms is as much the sound as a 3 s fade). */
function curveError(a: number[], b: number[], hold = EG_HOLD): number {
  let e = 0
  let w = 0
  for (let k = 0; k < a.length; k++) {
    const t = k * EG_STEP
    const wt = 1 / (t < hold ? t + 0.05 : t - hold + 0.05)
    e += Math.abs(Math.max(-40, a[k]) - Math.max(-40, b[k])) * wt
    w += wt
  }
  return e / w
}

/** The DX7 envelope as fitted: held long (its whole course) and held short (its release from where it is). */
export interface EgTarget { curve: number[]; hold: number; total: number }
const egError = (targets: readonly EgTarget[], rates: number[], levels: number[]) =>
  targets.reduce((e, t) => e + curveError(t.curve, envelopeDb(rates, levels, t.hold, t.total, EG_STEP), t.hold), 0)

/** The reface rate whose stage, from one level to the next (dB), takes as long as `seconds`: a rise approaches 1.5 ×
 *  its target in amplitude, a fall goes evenly in dB (the release, stage 3, by its own table). */
function rateForStage(stage: number, fromDb: number, toDb: number, seconds: number): number {
  const time = (r: number) => {
    if (toDb > fromDb) {
      const a0 = fromDb <= -119 ? 0 : 10 ** (fromDb / 20)
      const t = 10 ** (toDb / 20)
      return attackTau(r) * Math.log((ATTACK_OVERSHOOT * t - a0) / (ATTACK_OVERSHOOT * t - t))
    }
    return (Math.min(fromDb, 0) - Math.max(toDb, -96)) / (stage === 3 ? releaseDbPerS : decayDbPerS)(r)
  }
  return invert((r) => Math.log(Math.max(1e-4, time(r))), Math.log(Math.max(1e-4, seconds)))
}

/** Each stage's rate so it takes as long as the DX7's (`stages`: when each began, from dxEnvelopeDb). */
function stageRates(levels: number[], start: number[], free: number[], stages: number[]): number[] {
  const rates = [...start]
  const db = levels.map((l) => (l === 0 ? -120 : egLevelDb(l)))
  const from = [-120, db[0], db[1], db[2]]
  for (const i of free) {
    const begin = stages[i]
    if (begin === undefined || i === 3) continue
    // a stage the DX7 doesn't finish while held lasts the hold, at least
    const end = i < 2 ? stages[i + 1] : stages[3]
    const seconds = end === undefined ? EG_TOTAL : end - begin
    if (Math.abs(from[i] - db[i]) > 0.5) rates[i] = rateForStage(i, from[i], db[i], Math.max(0.001, seconds))
  }
  return rates
}

/** Rates fitted to the DX7 envelope: coordinate descent on the curves from each start, the best kept. A trial that
 *  never rises above the floor where the original does is no fit (it would win by being flat). */
export function fitRates(targets: readonly EgTarget[], levels: number[], starts: number[][], free = [0, 1, 2, 3]): number[] {
  const audible = (c: number[]) => c.some((x) => x > -40)
  const wantAudible = audible(targets[0].curve)
  let bestOf: { rates: number[]; e: number } | null = null
  for (const start of starts) {
    const rates = [...start]
    let best = egError(targets, rates, levels)
    for (let pass = 0; pass < 3; pass++) {
      let moved = false
      for (const i of free) {
        for (let r = 0; r <= 127; r++) {
          if (r === rates[i]) continue
          const trial = [...rates]
          trial[i] = r
          if (wantAudible && !audible(envelopeDb(trial, levels, EG_HOLD, EG_TOTAL, EG_STEP))) continue
          const e = egError(targets, trial, levels)
          if (e < best - 1e-6) { best = e; rates[i] = r; moved = true }
        }
      }
      if (!moved) break
    }
    if (!bestOf || best < bestOf.e) bestOf = { rates, e: best }
  }
  return bestOf!.rates
}

/** The keyboard level scaling of one side: depth and curve closest to the DX7's dB over those notes. */
function fitScaling(out: number, target: (note: number) => number, notes: number[], side: 'left' | 'right'): [number, number] {
  let best: [number, number] = [0, 0]
  let bestE = Infinity
  for (let curve = 0; curve < 4; curve++) {
    for (let depth = 0; depth <= 127; depth++) {
      let e = 0
      for (const n of notes) {
        const k = side === 'left' ? kscDb(n, depth, 0, curve, 0) : kscDb(n, 0, depth, 0, curve)
        e += (Math.min(0, levelDb(out) + k) - target(n)) ** 2
      }
      if (e < bestE - 1e-9) { bestE = e; best = [depth, curve] }
    }
  }
  return best
}

/** Feedback: the reface value whose lone operator has the DX7's harmonics (the DX7's depends on the operator's level,
 *  the reface's doesn't: matched at the operator's loudest). */
const harmonics = (samples: Float32Array, hz: number) => {
  const seg = slice({ samples, sampleRate: SR }, 0.15, 0.15 + 8192 / SR)
  const { magnitudes, binHz } = spectrum(seg)
  const at = (h: number) => {
    const c = Math.round((h * hz) / binHz)
    let m = 0
    for (let i = c - 2; i <= c + 2; i++) m = Math.max(m, magnitudes[i] ?? 0)
    return m
  }
  const h1 = at(1)
  return [2, 3, 4, 5, 6, 7, 8].map((h) => Math.max(-60, toDb(at(h) / h1)))
}
const fbCache = new Map<string, Feedback>()
export interface Feedback { value: number; square: boolean }
/** A DX7 operator feeding back hard enough turns to noise; the reface's feedback never does (docs/SOUND.md): it makes
 *  noise from a square wave at the top modulating deep, so that's what a noisy one becomes. */
const NOISY = 1e-3
export function feedbackFor(fb: number, levelDbAtPeak: number): Feedback {
  const lv = Math.round(levelDbAtPeak / 3) * 3
  const key = `${fb}/${lv}`
  const hit = fbCache.get(key)
  if (hit !== undefined) return hit
  const dx = new Uint8Array(155)
  dx.set(DX_INIT)
  // OP6 alone, the one with feedback in algorithm 32, at the operator's loudest
  const b = opBase(6)
  dx.set([99, 99, 99, 99, 99, 99, 99, 0], b)
  dx[b + OP.outputLevel] = invert(dxOutDb, lv, 0, 99)
  for (let n = 1; n <= 5; n++) dx[opBase(n) + OP.outputLevel] = 0
  dx[VC.algorithm] = 31
  dx[VC.feedback] = fb
  const lone = dxRender(dx, { note: 60, holdSeconds: 0.35 })
  if (flatness(slice({ samples: lone, sampleRate: SR }, 0.1, 0.35)) > NOISY) {
    fbCache.set(key, { value: 127, square: true })
    return { value: 127, square: true }
  }
  const want = harmonics(lone, 261.63)
  let best = 0
  let bestE = Infinity
  for (let x = 0; x <= 127; x += 1) {
    const v = initVoice()
    v.ops[0].set([127, 127, 127, 127, 127, 127, 127, 0], 0x01)
    v.ops[0][0x12] = 127
    v.ops[0][0x13] = x
    const got = harmonics(renderNote(v, { note: 60, holdSeconds: 0.35, sampleRate: SR }), 261.63)
    const e = got.reduce((s, g, i) => s + Math.abs(g - want[i]), 0)
    if (e < bestE) { bestE = e; best = x }
  }
  fbCache.set(key, { value: best, square: false })
  return { value: best, square: false }
}

/** The volca's INIT VOICE bytes, for probes. */
const DX_INIT = (() => {
  const v = new Uint8Array(155)
  for (let n = 1; n <= 6; n++) {
    const b = opBase(n)
    v.set([99, 99, 99, 99, 99, 99, 99, 0], b)
    v[b + OP.breakPoint] = 39
    v[b + OP.coarse] = 1
    v[b + OP.detune] = 7
  }
  v.set([99, 99, 99, 99, 50, 50, 50, 50], VC.pitchRate1)
  v[VC.oscKeySync] = 1
  v[VC.lfoSpeed] = 35
  v[VC.lfoSync] = 1
  v[VC.pitchModSens] = 3
  v[VC.transpose] = 24
  return v
})()

/** One DX7 operator as a reface operator: everything but feedback (that's the algorithm's) and its place. */
export function translateOp(v: DxVoice, n: number): Uint8Array {
  const o = initVoice().ops[0]
  const at = (p: keyof typeof OP) => op(v, n, p)
  // frequency, by the number
  if (at('oscMode') === 0) {
    const r = (at('coarse') === 0 ? 0.5 : at('coarse')) * (1 + at('fine') / 100)
    o[0x15] = 0
    o.set(ratioBytes(Math.min(31.99, r)), 0x16)
  } else {
    o[0x15] = 1
    o.set(fixedBytes(10 ** ((at('coarse') & 3) + at('fine') / 100)), 0x16)
  }
  // detune: 0.90 cents a step on the DX7 (MSFA), 0.59 on the reface
  o[0x18] = Math.max(0, Math.min(127, 64 + Math.round(((at('detune') - 7) * 0.9016) / 0.59)))
  // velocity: the reface's line closest to the DX7's curve, relative to velocity 100 (where the sound is compared)
  const sens = at('velocitySens')
  let vel = 0
  let velE = Infinity
  for (let s = 0; s <= 127; s++) {
    let e = 0
    for (let x = 20; x <= 127; x += 4) e += (velocityDb(x, s) - velocityDb(100, s) - (dxVelDb(x, sens) - dxVelDb(100, sens))) ** 2
    if (e < velE) { velE = e; vel = s }
  }
  o[0x11] = vel
  const velComp = dxVelDb(100, sens) - velocityDb(100, vel)
  // output level at C3 (the reface's break point), then each side's scaling
  const total = (note: number) => dxLevelAt(v, n, note) + velComp
  const out = Math.max(1, invert(levelDb, total(60), 1, 127))
  o[0x12] = out
  const [ld, lc] = fitScaling(out, total, [36, 40, 44, 48, 52, 56], 'left')
  const [rd, rc] = fitScaling(out, total, [64, 68, 72, 76, 80, 84, 88, 92, 96], 'right')
  o.set([ld, rd, lc, rc], 0x0a)
  // rate scaling: 2^(sens/8) an octave on the DX7, 2^(x/127) on the reface
  o[0x09] = Math.round((127 * at('rateScaling')) / 8)
  // the envelope: levels by dB, rates fitted to the curve at C3 (with the DX7's rate scaling there)
  const dxRates = [at('rate1'), at('rate2'), at('rate3'), at('rate4')]
  const dxLevels = [at('level1'), at('level2'), at('level3'), at('level4')]
  const levels = dxLevels.map((l) => (l === 0 ? 0 : invert(egLevelDb, dxEgDb(l), 1, 127)))
  const outUnits = Math.min(127, scaleOutLevel(at('outputLevel'))) << 5
  // dB against the operator's own top (the reface adds the output level apart)
  const stages: number[] = []
  const egOnly = dxEnvelopeDb(dxRates, dxLevels, outUnits, dxQrateBoost(60, at('rateScaling')), EG_HOLD, EG_TOTAL, EG_STEP, stages)
  // the attack by when it gets to the top: the DX7 climbs evenly in dB, the reface rushes and slows into the top, so
  // the curves can't meet early; the time they arrive can
  // a modulator's early level is brightness: there the curve itself matters more than when it arrives
  const carrier = algorithmOf(v[VC.algorithm]).carriers.includes(n)
  let r1 = Math.round((dxRates[0] * 127) / 99)
  if (carrier && dxLevels[0] > 0) {
    const arrive = (curve: number[], db: number) => curve.findIndex((x) => x >= db - 1)
    const want = arrive(egOnly, dxEgDb(dxLevels[0]))
    // the fastest of equally good rates: they differ once rate scaling speeds them up
    const err = (r: number) => {
      const got = arrive(envelopeDb([r, 127, 127, 127], [levels[0], levels[0], levels[0], 0], EG_HOLD, EG_HOLD, EG_STEP), egLevelDb(levels[0]))
      return got < 0 ? 1e9 : Math.abs(Math.log(Math.max(1, got)) - Math.log(Math.max(1, want)))
    }
    if (want >= 0) for (let r = 127; r >= 0; r--) if (err(r) < err(r1) - 1e-9 || r === 127) r1 = r
  }
  // the release counts too: held long the note has often died before the key goes, so also held short
  const boost = dxQrateBoost(60, at('rateScaling'))
  const targets: EgTarget[] = [
    { curve: egOnly, hold: EG_HOLD, total: EG_TOTAL },
    { curve: dxEnvelopeDb(dxRates, dxLevels, outUnits, boost, 0.3, 2.3, EG_STEP), hold: 0.3, total: 2.3 },
  ]
  const free = carrier ? [1, 2, 3] : [0, 1, 2, 3]
  const scaled = [r1, ...dxRates.slice(1).map((r) => Math.round((r * 127) / 99))]
  // the release's speed from the short hold: how fast the DX7 falls 30 dB from where it is when the key goes
  const short = targets[1].curve
  const k0 = Math.round(0.3 / EG_STEP)
  const k30 = short.findIndex((x, i) => i > k0 && x < short[k0] - 30)
  const release = short[k0] > -50 ? invert((r) => Math.log(releaseDbPerS(r)), Math.log(30 / (Math.max(1, (k30 < 0 ? short.length : k30) - k0) * EG_STEP))) : scaled[3]
  const staged = stageRates(levels, scaled, free, stages)
  const rates = fitRates(targets, levels, [scaled, staged, [...staged.slice(0, 3), release]], free)
  // a first fall faster than this right after the attack takes the note's peak away on the DX (docs/SOUND.md). Where
  // it was wanted faster and the DX7's third stage only holds (L3 = L2: drums, plucks), fall at the limit for a
  // moment, then fast: the DX plays that alike every time
  let eg = { rates, levels }
  if (levels[1] < levels[0] && rates[1] > FIRST_FALL_MAX) {
    const capped = { rates: [rates[0], FIRST_FALL_MAX, rates[2], rates[3]], levels }
    const err = (e: { rates: number[]; levels: number[] }) => egError(targets, e.rates, e.levels)
    eg = capped
    if (dxLevels[1] === dxLevels[2]) for (let mid = levels[0] - 4; mid > levels[1]; mid -= 4) {
      const ls = [levels[0], mid, levels[1], levels[3]]
      const two = { rates: fitRates(targets, ls, [[rates[0], FIRST_FALL_MAX, rates[1], rates[3]]], [2]), levels: ls }
      if (err(two) < err(eg)) eg = two
    }
  }
  o.set(eg.rates, 0x01)
  o.set(eg.levels, 0x05)
  // amplitude modulation: the dip the DX7's LFO makes on this operator
  const ams = at('ampModSens')
  const dip = ams && v[VC.lfoAmpDepth] ? (v[VC.lfoAmpDepth] / 99) * AMP_MOD_DEPTH[ams] * DB_PER_UNIT : 0
  o[0x0e] = dip ? invert(ampModDb, dip) : 0
  o[0x13] = 0
  o[0x14] = 0
  return o
}

/** The voice-wide parts: transpose, LFO, pitch modulation, pitch EG. Returns whether the pitch EG and the LFO's pitch
 *  modulation are used (switched on per operator). */
export function translateCommon(v: DxVoice, rv: Voice): { peg: boolean; pmd: boolean } {
  const c = rv.common
  c[0x0c] = Math.max(0x28, Math.min(0x58, 0x40 + v[VC.transpose] - 24))
  c[0x0d] = 0
  c[0x0e] = 0
  // LFO: DX7 triangle, saw down, saw up, square, sine, S&H; the reface's order differs
  c[0x11] = [1, 3, 2, 4, 0, 6][v[VC.lfoWave]] ?? 0
  c[0x12] = invert((x) => Math.log(lfoHz(x)), Math.log(dxLfoHz(v[VC.lfoSpeed])))
  const delay = lfoDelayRates(v[VC.lfoDelay])
  c[0x13] = delay ? invert((x) => lfoDelayS(x)[0], 0.5 / delay[0]) : 0
  // vibrato depth, semitones either way
  const semis = (((v[VC.lfoPitchDepth] * 165) >> 6) * PITCH_MOD_SENS[v[VC.pitchModSens] & 7] * 0.5 * 12) / 32768
  c[0x14] = semis > 0.005 ? invert(pitchModSemitones, semis) : 0
  // pitch EG
  const peg = translatePitchEg(v, c)
  return { peg, pmd: c[0x14] > 0 }
}

/** The DX7 starts the pitch at L4 and moves through L1, L2 to L3; the reface starts at L1 and moves through L2 to L3
 *  (R1 never sounds, measured). One of the DX7's moves has to go: the one whose loss is smaller. */
function translatePitchEg(v: DxVoice, c: Uint8Array): boolean {
  const semis = (l: number) => (PITCH_LEVEL[l] / 32) * 12
  const speed = (r: number) => PITCH_RATE[r] * PITCH_RATE_UNIT * 12
  const R = [0, 1, 2, 3].map((i) => v[VC.pitchRate1 + i])
  const L = [0, 1, 2, 3].map((i) => semis(v[VC.pitchLevel1 + i]))
  if (L.every((x) => Math.abs(x) < 0.01)) {
    c.set([64, 64, 64, 64, 0x40, 0x40, 0x40, 0x40], 0x15)
    return false
  }
  const run = (start: number, points: [number, number][], hold = 1.5, release: [number, number] = [L[3], speed(R[3])]) => {
    const out: number[] = []
    let x = start
    let i = 0
    for (let k = 0; k < 400; k++) {
      const t = k * 0.005
      const [to, s] = t >= hold ? release : (points[i] ?? [x, 0])
      const step = s * 0.005
      if (Math.abs(to - x) <= step) { x = to; if (t < hold) i++ } else x += Math.sign(to - x) * step
      out.push(x)
    }
    return out
  }
  const want = run(L[3], [[L[0], speed(R[0])], [L[1], speed(R[1])], [L[2], speed(R[2])]])
  const options: [number, [number, number][]][] = [
    // from L1 (the DX7's first move dropped)
    [L[0], [[L[1], speed(R[1])], [L[2], speed(R[2])]]],
    // from L4 into L1, then to L3 (the DX7's L2 dropped)
    [L[3], [[L[0], speed(R[0])], [L[2], speed(R[2])]]],
  ]
  const err = (o: (typeof options)[number]) => run(o[0], o[1]).reduce((s, x, k) => s + Math.abs(x - want[k]), 0)
  const [start, [[l2, s2], [l3, s3]]] = options.reduce((a, b) => (err(b) < err(a) ? b : a))
  const level = (x: number) => Math.max(0x10, Math.min(0x70, 0x40 + Math.round(x)))
  const rate = (s: number) => invert((r) => Math.log(pitchEgSemitonesPerS(r)), Math.log(Math.max(0.01, s)))
  c.set([127, rate(s2), rate(s3), rate(speed(R[3]))], 0x15)
  c.set([level(start), level(l2), level(l3), level(L[3])], 0x19)
  return true
}

// ---------- six operators to four ----------

interface Graph { ops: number[]; carriers: number[]; edges: [number, number][] }
interface Candidate { algorithm: number; place: Map<number, number>; describe: string }

/** The DX7 voice as a graph, before reducing: its sounding operators (translated), carriers and modulations. A merge
 *  makes another: two carriers at the same frequency become one (their amplitudes add: in phase from key-on), and
 *  so do two modulators at the same frequency into the same operators; the merged one keeps the louder one's
 *  envelope, and takes over what modulated the other. */
export interface Source { sounding: number[]; carriers: number[]; edges: [number, number][]; ops: Map<number, Uint8Array>; describe: string }

export function sources(v: DxVoice, ops: Map<number, Uint8Array>): Source[] {
  const a = algorithmOf(v[VC.algorithm])
  const sounding = [...ops.keys()]
  const edges: [number, number][] = []
  for (let t = 1; t <= 6; t++) for (const m of a.modulators[t]) if (ops.has(m) && ops.has(t)) edges.push([m, t])
  const base: Source = { sounding, carriers: a.carriers.filter((c) => ops.has(c)), edges, ops, describe: '' }
  const out = [base]
  const freq = (n: number) => [...ops.get(n)!.subarray(0x15, 0x19)].join()
  const targets = (n: number) => edges.filter(([m]) => m === n).map(([, t]) => t).sort().join()
  for (const x of sounding) for (const y of sounding) {
    if (y <= x || freq(x) !== freq(y)) continue
    const bothCarriers = base.carriers.includes(x) && base.carriers.includes(y)
    const sameTargets = !base.carriers.includes(x) && !base.carriers.includes(y) && targets(x) === targets(y)
    if (!bothCarriers && !sameTargets) continue
    const [keep, gone] = levelDb(ops.get(x)![0x12]) >= levelDb(ops.get(y)![0x12]) ? [x, y] : [y, x]
    const merged = new Map(ops)
    const o = ops.get(keep)!.slice()
    o[0x12] = invert(levelDb, toDb(10 ** (levelDb(o[0x12]) / 20) + 10 ** (levelDb(ops.get(gone)![0x12]) / 20)), 1, 127)
    merged.set(keep, o)
    merged.delete(gone)
    const e = edges.filter(([m]) => m !== gone).map(([m, t]): [number, number] => [m, t === gone ? keep : t])
    out.push({
      sounding: sounding.filter((n) => n !== gone), carriers: base.carriers.filter((c) => c !== gone),
      edges: e.filter(([m, t], i) => m !== t && e.findIndex(([m2, t2]) => m2 === m && t2 === t) === i), ops: merged, describe: `OP${gone} into OP${keep}, `,
    })
  }
  return out
}

export function candidates(src: Source): Candidate[] {
  const { sounding, edges } = src
  const subsets: number[][] = []
  const sizes = sounding.length <= 4 ? [sounding.length] : [4, 3]
  const pick = (from: number[], k: number, acc: number[]) => {
    if (acc.length === k) return void subsets.push(acc)
    for (let i = 0; i < from.length; i++) pick(from.slice(i + 1), k, [...acc, from[i]])
  }
  for (const k of sizes) pick(sounding, k, [])
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const keep of subsets) {
    const carriers = src.carriers.filter((c) => keep.includes(c))
    if (!carriers.length) continue
    const induced = edges.filter(([m, t]) => keep.includes(m) && keep.includes(t))
    // through a dropped operator: what modulated it now modulates what it modulated
    const reach = (m: number, seenOps = new Set<number>()): number[] => edges.filter(([f]) => f === m).flatMap(([, t]) => {
      if (keep.includes(t)) return [t]
      if (seenOps.has(t)) return []
      seenOps.add(t)
      return reach(t, seenOps)
    })
    const spliced: [number, number][] = keep.flatMap((m) => [...new Set(reach(m))].map((t): [number, number] => [m, t]))
    const dropped = sounding.filter((n) => !keep.includes(n))
    for (const [kind, es] of [['', induced], ['spliced ', spliced]] as const) {
      if (kind && JSON.stringify(es) === JSON.stringify(induced)) continue
      const g: Graph = { ops: keep, carriers, edges: es }
      for (const c of placements(g)) {
        const key = `${c.algorithm}:${[...c.place].sort().join()}`
        if (seen.has(key)) continue
        seen.add(key)
        const rest = `${dropped.length ? `${kind}without OP${dropped.join(', OP')}` : 'all'}${c.describe}`
        c.describe = src.describe + (src.describe && rest === 'all' ? 'the rest' : rest)
        out.push(c)
      }
    }
  }
  return out
}

const PERMS: number[][] = (() => {
  const out: number[][] = []
  const go = (p: number[]) => (p.length === 4 ? void out.push(p) : [0, 1, 2, 3].forEach((i) => !p.includes(i) && go([...p, i])))
  go([])
  return out
})()

/** Every reface algorithm and numbering where the kept operators keep their roles: carriers stay carriers, every
 *  modulation the algorithm makes among them is one of the graph's (some of the graph's may go), and every kept
 *  modulator still modulates one of them. */
function placements(g: Graph): Candidate[] {
  const out: Candidate[] = []
  for (let alg = 0; alg < 12; alg++) {
    const A = ALGORITHMS[alg]
    for (const perm of PERMS) {
      const place = new Map(g.ops.map((n, i) => [n, perm[i]]))
      const slots = [...place.values()]
      const isC = (s: number) => A.carriers.includes(s)
      if (!g.ops.every((n) => isC(place.get(n)!) === g.carriers.includes(n))) continue
      const algEdges = A.modulations.filter(([f, t]) => slots.includes(f) && slots.includes(t))
      const graphEdges = new Set(g.edges.map(([m, t]) => `${place.get(m)}>${place.get(t)}`))
      if (!algEdges.every(([f, t]) => graphEdges.has(`${f}>${t}`))) continue
      if (!g.ops.every((n) => g.carriers.includes(n) || algEdges.some(([f]) => f === place.get(n)))) continue
      const lost = graphEdges.size - algEdges.length
      out.push({ algorithm: alg, place, describe: lost ? ` (${lost} modulation${lost > 1 ? 's' : ''} lost)` : '' })
    }
  }
  return out
}

export function build(v: DxVoice, c: Candidate, ops: Map<number, Uint8Array>, common: Voice['common'], use: { peg: boolean; pmd: boolean }, feedback: Map<number, Feedback>): Voice {
  const rv = initVoice()
  rv.common.set(common)
  rv.common[0x10] = c.algorithm
  for (let s = 0; s < 4; s++) rv.ops[s][0x12] = 0
  for (const [n, s] of c.place) {
    rv.ops[s].set(ops.get(n)!)
    rv.ops[s][0x10] = use.peg ? 1 : 0
    rv.ops[s][0x0f] = use.pmd ? 1 : 0
    rv.ops[s][0x13] = feedback.get(n)?.value ?? 0
    rv.ops[s][0x14] = feedback.get(n)?.square ? 1 : 0
  }
  return rv
}

/** A noisy DX7 voice the reface way (the wheel's Noise tonality, docs/SOUND.md): what the noise source modulated, now
 *  modulated by three square waves at fixed frequencies (algorithm 5); or by one, with the voice's loudest other
 *  carrier beside it for the tone (algorithm 10). */
function noiseRebuilt(v: DxVoice, ops: Map<number, Uint8Array>, common: Voice['common'], use: { peg: boolean; pmd: boolean }): { voice: Voice; describe: string }[] {
  const a = algorithmOf(v[VC.algorithm])
  // down from the noise source to the carrier it ends in
  let target = a.feedback.to
  while (!a.carriers.includes(target)) target = [1, 2, 3, 4, 5, 6].find((t) => a.modulators[t].includes(target)) ?? target
  const carrier = ops.get(target)
  if (!carrier) return []
  const noiseOp = (hz: number) => {
    const o = initVoice().ops[0]
    o.set([127, 127, 127, 127, 127, 127, 127, 0], 0x01)
    o[0x12] = 124
    o[0x13] = 124
    o[0x14] = 1
    o[0x15] = 1
    o.set(fixedBytes(hz), 0x16)
    return o
  }
  const voice = (alg: number, slots: Uint8Array[]) => {
    const rv = initVoice()
    rv.common.set(common)
    rv.common[0x10] = alg
    slots.forEach((o, i) => {
      rv.ops[i].set(o)
      rv.ops[i][0x10] = use.peg ? 1 : 0
      rv.ops[i][0x0f] = use.pmd ? 1 : 0
    })
    return rv
  }
  const out = [{ voice: voice(4, [carrier, noiseOp(3000), noiseOp(450), noiseOp(5000)]), describe: 'noise rebuilt: three square waves into its carrier' }]
  const tone = a.carriers.filter((c) => c !== target && ops.has(c)).sort((x, y) => op(v, y, 'outputLevel') - op(v, x, 'outputLevel'))[0]
  if (tone !== undefined) {
    const second = carrier.slice()
    second.set(fixedBytes(4000), 0x16)
    second[0x15] = 1
    out.push({ voice: voice(9, [ops.get(tone)!, carrier, second, noiseOp(3000)]), describe: `noise rebuilt: one square wave into its carrier, OP${tone} for the tone` })
  }
  return out
}

// ---------- comparing sounds ----------

export const NOTES = [48, 60, 72]
export const HOLD = 1.0
const RELEASE = 0.4
export const FRAMES = [0.005, 0.03, 0.08, 0.2, 0.5, 0.95, 1.08, 1.25]
const FRAME = 2048
const BANDS = [0.75, 1.5, 2.5, 4.5, 8.5, 16.5, 32.5, 1e9]

export interface Print { loud: number[]; bands: number[][] }

export function fingerprint(samples: Float32Array, hz: number): Print {
  const env = envelope({ samples, sampleRate: SR }, FRAME / SR / 4)
  const top = Math.max(...env, 1e-12)
  const loud: number[] = []
  const bands: number[][] = []
  for (const t of FRAMES) {
    const seg = slice({ samples, sampleRate: SR }, t, t + FRAME / SR)
    let s = 0
    for (const x of seg.samples) s += x * x
    // below −30 dB a difference is hardly heard
    loud.push(Math.max(-30, toDb(Math.sqrt(s / seg.samples.length) / top)))
    const { magnitudes, binHz } = spectrum(seg)
    const e = BANDS.slice(0, -1).map((lo, b) => {
      let sum = 0
      for (let i = Math.max(1, Math.ceil((lo * hz) / binHz)); i < Math.min(magnitudes.length, (BANDS[b + 1] * hz) / binHz); i++) sum += magnitudes[i] ** 2
      return sum
    })
    const total = e.reduce((a, b) => a + b, 0) || 1e-24
    bands.push(e.map((x) => Math.max(-50, 10 * Math.log10(x / total + 1e-12))))
  }
  return { loud, bands }
}

/** dB: loudness over time and the share of each band of harmonics, frame by frame, averaged. */
export function distance(a: Print, b: Print): number {
  let d = 0
  for (let f = 0; f < FRAMES.length; f++) {
    d += Math.abs(a.loud[f] - b.loud[f])
    // the spectrum only where it's heard
    if (Math.max(a.loud[f], b.loud[f]) > -29) d += a.bands[f].reduce((s, x, i) => s + Math.abs(x - b.bands[f][i]), 0) / a.bands[f].length
  }
  return d / FRAMES.length
}

export const keyHz = (note: number, transpose: number) => 440 * 2 ** ((note + transpose - 69) / 12)
export const dxPrints = (v: DxVoice) => NOTES.map((n) => fingerprint(dxRender(v, { note: n, holdSeconds: HOLD, releaseSeconds: RELEASE, sampleRate: SR }), keyHz(n, v[VC.transpose] - 24)))
export const rfPrints = (v: Voice) => NOTES.map((n) => fingerprint(renderNote(v, { note: n, holdSeconds: HOLD, releaseSeconds: RELEASE, sampleRate: SR }), keyHz(n, v.common[0x0c] - 0x40)))
export const score = (want: Print[], v: Voice) => rfPrints(v).reduce((s, p, i) => s + distance(want[i], p), 0) / NOTES.length

// ---------- one voice ----------

export interface Converted { voice: Voice; describe: string; score: number }

export function convert(v: DxVoice): Converted {
  const ops = new Map<number, Uint8Array>()
  for (let n = 1; n <= 6; n++) if (op(v, n, 'outputLevel') > 0) ops.set(n, translateOp(v, n))
  const common = initVoice().common
  const tmp = { common, ops: initVoice().ops }
  const use = translateCommon(v, tmp)
  // feedback, on the operator that feeds back (a loop over several operators: on the one it goes into)
  const a = algorithmOf(v[VC.algorithm])
  const feedback = new Map<number, Feedback>()
  const fbOp = a.feedback.to
  if (v[VC.feedback] && ops.has(fbOp)) {
    const peak = Math.max(...[1, 2, 3].map((i) => dxEgDb(op(v, fbOp, `level${i}` as 'level1'))))
    feedback.set(fbOp, feedbackFor(v[VC.feedback], dxLevelAt(v, fbOp, 60) + peak))
  }
  const want = dxPrints(v)
  const rebuilt = feedback.get(fbOp)?.square ? noiseRebuilt(v, ops, common, use) : []
  // the same shape in another numbering sounds the same: once each
  const seen = new Set<string>()
  const all = sources(v, ops).flatMap((src) => candidates(src).map((c) => ({ c, src }))).flatMap(({ c, src }) => {
    const A = ALGORITHMS[c.algorithm]
    const dxAt = new Map([...c.place].map(([n, s]) => [s, n]))
    const key = src.describe + [...c.place].map(([n, s]) => `${n}${A.carriers.includes(s) ? 'c' : ''}<${A.modulations.filter(([f, t]) => t === s && dxAt.has(f)).map(([f]) => dxAt.get(f)).sort()}`).sort().join('|')
    if (seen.has(key)) return []
    seen.add(key)
    const voice = build(v, c, src.ops, common, use, feedback)
    return [{ voice, describe: c.describe, score: score(want, voice) }]
  }).concat(rebuilt.map((r) => ({ ...r, score: score(want, r.voice) })))
  all.sort((x, y) => x.score - y.score)
  if (process.env.DX_DEBUG) for (const c of all.slice(0, 8)) console.error(`  ${c.score.toFixed(2)} alg ${c.voice.common[0x10] + 1} ${c.describe}`)
  // fine-tune the closest few: each operator's level, its attack and first decay, then the feedback
  const tuned = all.slice(0, 3).map((c) => {
    const voice = cloneVoice(c.voice)
    let best = c.score
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 0; s < 4; s++) {
        if (!voice.ops[s][0x12]) continue
        const tries = [[0x12, [-8, -4, -2, 2, 4, 8]], [0x01, [-16, -8, -4, 4, 8, 16]], [0x02, [-8, -4, 4, 8]], [0x13, voice.ops[s][0x13] ? [-24, -12, -6, 6, 12, 24] : []]] as const
        for (const [byte, steps] of tries) {
          for (const d of steps) {
            const was = voice.ops[s][byte]
            voice.ops[s][byte] = Math.max(byte === 0x12 ? 1 : 0, Math.min(byte === 0x02 && voice.ops[s][0x06] < voice.ops[s][0x05] ? FIRST_FALL_MAX : 127, was + d))
            const e = score(want, voice)
            if (e < best - 1e-4) best = e
            else voice.ops[s][byte] = was
          }
        }
      }
    }
    return { voice, describe: c.describe, score: best }
  })
  return tuned.reduce((x, y) => (y.score < x.score ? y : x))
}

// ---------- traits, for the table ----------

export function traits(samples: Float32Array, hz: number) {
  const seg = { samples, sampleRate: SR }
  return {
    attack: attackTime(seg),
    decay: decayTime(slice(seg, 0, HOLD)),
    early: centroid(slice(seg, 0.02, 0.02 + FRAME / SR)) / hz,
    body: centroid(slice(seg, 0.5, 0.5 + FRAME / SR)) / hz,
  }
}

