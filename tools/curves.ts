// The curve probes (docs/SOUND.md): which voice each point plays and what is measured from it, shared by
// tools/dxCurves.ts (the DX's audio) and tools/engineCurves.ts (the probe engine), so both measure the same thing.
// Every measure starts from the note's onset, so the DX's pre-roll and the engine's instant start compare.
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { averageCycle, db, envelope, harmonics, noteHz, period, RATE, rms, spectrum } from './dxAudio'

export const CURVES = [
  'attack', 'decay', 'level', 'carrier', 'eglevel', 'feedback', 'velocity',
  'release', 'lfospeed', 'amd', 'pmd', 'lfodelay', 'lfowave', 'peglevel', 'pegrate', 'detune', 'ksc', 'kscplus', 'ratescaling',
] as const
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

/** Where the note starts: the first 2 ms block above 1 % of the loudest, in samples. */
const onsetOf = (x: Float64Array) => {
  const env = envelope(x, BLOCK_S)
  const top = Math.max(...env)
  return env.findIndex((e) => e > top * 0.01) * BLOCK_S * RATE
}

/** A pure sine's frequency over time, by its upward zero crossings: [seconds from `from`, Hz] per `windowS`. */
function frequencies(x: Float64Array, from: number, to: number, windowS = 0.02): [number, number][] {
  const ups: number[] = []
  for (let i = Math.max(1, Math.round(from)); i < Math.min(x.length, Math.round(to)); i++) if (x[i - 1] < 0 && x[i] >= 0) ups.push(i - x[i] / (x[i] - x[i - 1]))
  const out: [number, number][] = []
  const w = windowS * RATE
  for (let k = 0, start = 0; start < ups.length - 1; k++) {
    let end = start
    while (end + 1 < ups.length && ups[end + 1] - ups[start] < w) end++
    if (end === start) break
    out.push([(ups[start] - from) / RATE, (RATE * (end - start)) / (ups[end] - ups[start])])
    start = end
  }
  return out
}
const semis = (hz: number, ref: number) => 12 * Math.log2(hz / ref)

/** The level over time in dB, 2 ms blocks from the onset (a low note needs longer blocks: `blockS`), up to `untilS`
 *  after the onset when given (the key's release left out). */
const levelCurve = (x: Float64Array, untilS?: number, blockS = BLOCK_S) => {
  const on = Math.round(onsetOf(x) / RATE / blockS)
  const c = envelope(x, blockS).slice(on).map((e) => db(e))
  return untilS === undefined ? c : c.slice(0, Math.round(untilS / blockS))
}

/** How often a level curve swings (Hz): its crossings of its own middle, from `fromS`. */
function swingHz(curve: number[], fromS: number): number {
  // no deeper than a take can show (its noise floor is ~75 dB below the note): the engine has no floor
  const top = Math.max(...curve)
  const c = curve.slice(Math.round(fromS / BLOCK_S)).map((x) => Math.max(x, top - 75))
  const [lo, hi] = [Math.min(...c), Math.max(...c)]
  // up through the middle, counted again only after coming back below a quarter: ripples don't count
  const cross: number[] = []
  let below = false
  for (let i = 0; i < c.length; i++) {
    if (c[i] < lo + (hi - lo) * 0.25) below = true
    else if (below && c[i] >= (lo + hi) / 2) { cross.push(i); below = false }
  }
  return cross.length > 1 ? (cross.length - 1) / ((cross[cross.length - 1] - cross[0]) * BLOCK_S) : 0
}

/** OP1 alone, a sine at full level, held, its LFO switches and the common LFO set. */
function lfoSine(wave: number, speed: number, delay: number, pmd: number, amd: number, pmdOn: boolean): Voice {
  const v = steady()
  v.common.set([wave, speed, delay, pmd], 0x11)
  v.ops[0][0x0e] = amd
  v.ops[0][0x0f] = pmdOn ? 1 : 0
  v.ops[0][0x10] = 0
  return v
}

/** OP1 alone with its pitch EG on: rates and levels (bytes, 0x40 none). */
function pegSine(rates: number[], levels: number[]): Voice {
  const v = steady()
  v.common.set([...rates, ...levels], 0x15)
  v.ops[0][0x0f] = 0
  v.ops[0][0x10] = 1
  return v
}

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
    // R4 → time from note-off to −20 and −40 dB (L1–L3 127, L4 0)
    case 'release': return [40, 60, 80, 100, 110, 120, 127].map((r) => ({
      curve, at: { rate: r }, voice: sine([127, 127, 127, r], [127, 127, 127, 0]), note: 60, holdS: 0.5, tailS: r < 60 ? 5 : 1.2,
      measure: (x) => {
        const c = levelCurve(x)
        const off = Math.round(0.5 / BLOCK_S)
        const top = Math.max(...c.slice(off - 50, off))
        const t = (dB: number) => {
          const i = c.slice(off).findIndex((e) => e < top + dB)
          return i < 0 ? null : i * BLOCK_S * 1000
        }
        return { ms20: t(-20), ms40: t(-40) }
      },
    }))
    // LFO speed → how often the level swings (OP1 at full AMD, a sine LFO)
    case 'lfospeed': return [0, 16, 32, 48, 64, 80, 96, 112, 127].map((speed) => {
      // a few cycles at least, however slow
      const holdS = speed <= 16 ? 24 : speed <= 32 ? 12 : speed <= 64 ? 5 : 2.5
      return { curve, at: { speed }, voice: lfoSine(0, speed, 0, 0, 127, false), note: 60, holdS, tailS: 0.1, measure: (x: Float64Array) => ({ hz: swingHz(levelCurve(x, holdS - 0.05), 0.2) }) }
    })
    // AMD → how deep the level swings (a sine LFO at speed 64)
    case 'amd': return [16, 32, 64, 96, 127].map((amd) => ({
      curve, at: { amd }, voice: lfoSine(0, 64, 0, 0, amd, false), note: 60, holdS: 3, tailS: 0.1,
      measure: (x) => {
        const c = levelCurve(x).slice(Math.round(0.3 / BLOCK_S), Math.round(2.9 / BLOCK_S))
        return { swingDb: Math.max(...c) - Math.min(...c) }
      },
    }))
    // PMD → how far the pitch swings (OP1 with its PMD switch on, a slow sine LFO), semitones peak to peak
    case 'pmd': return [16, 32, 64, 96, 127].map((pmd) => ({
      curve, at: { pmd }, voice: lfoSine(0, 48, 0, pmd, 0, true), note: 60, holdS: 4, tailS: 0.1,
      measure: (x) => {
        const on = onsetOf(x)
        const f = frequencies(x, on + 0.3 * RATE, on + 3.9 * RATE).map(([, hz]) => semis(hz, noteHz(60)))
        return { swing: Math.max(...f) - Math.min(...f), centre: (Math.max(...f) + Math.min(...f)) / 2 }
      },
    }))
    // LFO delay → when the level starts to swing and when it swings fully (AMD 127, speed 96)
    case 'lfodelay': return [0, 32, 64, 96, 112, 127].map((delay) => ({
      curve, at: { delay }, voice: lfoSine(0, 96, delay, 0, 127, false), note: 60, holdS: 10, tailS: 0.1,
      measure: (x) => {
        // the swing in 100 ms windows from 0.1 s (the attack left out), against the fullest
        const c = levelCurve(x, 9.95)
        const span = Math.round(0.1 / BLOCK_S)
        const swings = Array.from({ length: Math.floor(c.length / span) - 1 }, (_, k) => {
          const w = c.slice((k + 1) * span, (k + 2) * span)
          return Math.max(...w) - Math.min(...w)
        })
        const full = Math.max(...swings)
        const first = (share: number) => swings.findIndex((s) => s >= full * share)
        return { startMs: (first(0.1) + 1) * 100, fullMs: (first(0.9) + 1) * 100, fullDb: full }
      },
    }))
    // LFO wave → the level over two of its cycles (AMD 127, speed 40), 32 points: its shape
    case 'lfowave': return [0, 1, 2, 3, 4, 5, 6].map((wave) => ({
      curve, at: { wave }, voice: lfoSine(wave, 40, 0, 0, 127, false), note: 60, holdS: 6, tailS: 0.1,
      measure: (x) => {
        const c = levelCurve(x, 5.95)
        const hz = swingHz(c, 0.2) || 1
        const start = Math.round(0.5 / BLOCK_S)
        const len = 2 / hz / BLOCK_S
        return { hz, shape: Array.from({ length: 32 }, (_, k) => c[start + Math.round((k * len) / 32)] ?? 0) }
      },
    }))
    // pitch EG level → the pitch it holds, semitones (all four levels the same)
    case 'peglevel': return [0x10, 0x28, 0x38, 0x3c, 0x40, 0x44, 0x48, 0x58, 0x70].map((level) => ({
      curve, at: { level }, voice: pegSine([127, 127, 127, 127], [level, level, level, level]), note: 60, holdS: 0.8, tailS: 0.1,
      measure: (x) => {
        const on = onsetOf(x)
        const f = frequencies(x, on + 0.2 * RATE, on + 0.7 * RATE, 0.15).map(([, hz]) => hz)
        return { semis: semis(f.reduce((a, b) => a + b, 0) / f.length, noteHz(60)) }
      },
    }))
    // pitch EG rate → time from +12 semitones to the note, to half way and to within half a semitone. The reface
    // starts each note at L1, not L4 (measured: an L4 of +12 never sounded), so the fall is R2 from L1 = +12.
    case 'pegrate': return [20, 40, 60, 80, 100, 120].map((rate) => ({
      curve, at: { rate }, voice: pegSine([127, rate, 127, 127], [0x40 + 12, 0x40, 0x40, 0x40]), note: 60, holdS: rate < 50 ? 8 : 2, tailS: 0.1,
      measure: (x) => {
        const on = onsetOf(x)
        const f = frequencies(x, on, x.length - 0.2 * RATE, 0.01).map(([t, hz]) => [t, semis(hz, noteHz(60))] as const)
        const when = (st: number) => f.find(([, s]) => s <= st)?.[0] ?? null
        return { halfMs: when(6) === null ? null : when(6)! * 1000, nearMs: when(0.5) === null ? null : when(0.5)! * 1000 }
      },
    }))
    // detune → cents
    case 'detune': return [0, 32, 64, 96, 127].map((detune) => {
      const v = steady()
      v.ops[0][0x18] = detune
      return {
        curve, at: { detune }, voice: v, note: 60, holdS: 1.2, tailS: 0.1,
        measure: (x) => {
          const on = onsetOf(x)
          const f = frequencies(x, on + 0.1 * RATE, on + 1.1 * RATE, 0.5).map(([, hz]) => hz)
          return { cents: 100 * semis(f.reduce((a, b) => a + b, 0) / f.length, noteHz(60)) }
        },
      }
    })
    // keyboard level scaling → the level at seven notes against no scaling (one side, depth and curve)
    case 'ksc': return ([['right', 127, 0], ['right', 127, 3], ['right', 127, 1], ['right', 64, 0], ['left', 127, 0], ['left', 127, 1]] as const).flatMap(([side, depth, curve]) =>
      [24, 36, 48, 60, 72, 84, 96].map((note) => {
        const v = steady()
        v.ops[0].set(side === 'right' ? [0, depth, 0, curve] : [depth, 0, curve, 0], 0x0a)
        return { curve: 'ksc' as const, at: { side: side === 'right', depth, kcurve: curve, note }, voice: v, note, holdS: 0.5, tailS: 0.1, measure: (x: Float64Array) => ({ db: steadyDbShort(x) }) }
      }))
    // keyboard level scaling upwards (+lin, +exp): on a carrier at level 64, so it has room to grow
    case 'kscplus': return ([['right', 3], ['right', 2], ['left', 3]] as const).flatMap(([side, curve]) =>
      (side === 'right' ? [60, 72, 84, 96] : [24, 36, 48, 60]).map((note) => {
        const v = steady()
        v.ops[0][0x12] = 64
        v.ops[0].set(side === 'right' ? [0, 127, 0, curve] : [127, 0, curve, 0], 0x0a)
        return { curve: 'kscplus' as const, at: { side: side === 'right', kcurve: curve, note }, voice: v, note, holdS: 0.5, tailS: 0.1, measure: (x: Float64Array) => ({ db: steadyDbShort(x) }) }
      }))
    // rate scaling → decay time (R2 60, L1 127 → L2 0) at three notes
    case 'ratescaling': return [0, 64, 127].flatMap((scaling) => [36, 60, 84].map((note) => {
      const v = sine([127, 60, 127, 127], [127, 0, 0, 0])
      v.ops[0][0x09] = scaling
      return {
        curve, at: { scaling, note }, voice: v, note, holdS: 2, tailS: 0.1,
        measure: (x) => {
          // 20 ms blocks: a 2 ms block is shorter than a cycle of C1
          const c = levelCurve(x, 1.95, 0.02)
          const top = Math.max(...c)
          const at = c.indexOf(top)
          const i = c.slice(at).findIndex((e) => e < top - 20)
          return { ms20: i < 0 ? null : i * 20 }
        },
      }
    }))
  }
}

/** RMS in dB from 0.1 to 0.4 s after the top (a short steady note). */
const steadyDbShort = (x: Float64Array) => {
  const at = peakAt(x)
  return db(rms(x, at + 0.1 * RATE, at + 0.4 * RATE))
}

/** A point's file name: "attack-40", "feedback-64-square". */
export const pointName = (p: Point) => [p.curve, ...Object.entries(p.at).map(([k, x]) => (typeof x === 'boolean' ? (x ? k : '') : String(x)))].filter(Boolean).join('-')
