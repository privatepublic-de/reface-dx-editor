import { describe, expect, it } from 'vitest'
import { renderNote, type RenderOptions } from '../src/engine/render'
import { centroid, flatness, pitch, rms, slice, toDb, type Segment } from '../src/engine/measure'
import { ALGORITHMS } from '../src/params/algorithms'
import { fixedBytes } from '../src/params/display'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { points, type Curve, type Point } from '../tools/curves'
import { RATE } from '../tools/dxAudio'
import CURVES from './fixtures/dx-curves.json'

const play = (v: Voice, o: RenderOptions = {}): Segment => ({ samples: renderNote(v, { sampleRate: RATE, ...o }), sampleRate: RATE })
const steady = (s: Segment) => slice(s, 0.3, 0.8)
const voice = (...edits: ((v: Voice) => void)[]) => {
  const v = cloneVoice(initVoice())
  for (const e of edits) e(v)
  return v
}
const C4 = 261.626
/** A curve point played by the engine and measured as on the DX (tools/curves.ts). */
const engine = (curve: Parameters<typeof points>[0]) =>
  points(curve).map((p) => ({ at: p.at, m: p.measure(Float64Array.from(renderNote(p.voice, { note: p.note, velocity: p.velocity, holdSeconds: p.holdS, releaseSeconds: p.tailS, sampleRate: RATE }))) }))

/** H1…H8 in dB against H1 from a steady stretch: the same as the curve probe uses. */
const harmonicsOf = (v: Voice, note = 48) => {
  const p = { ...points('level')[0], voice: v, note }
  return p.measure(Float64Array.from(renderNote(v, { note, holdSeconds: 0.8, sampleRate: RATE }))).h as number[]
}

describe('frequency', () => {
  it('VOICE INIT plays C4 as a sine', () => {
    const s = steady(play(initVoice()))
    expect(pitch(s)).toBeCloseTo(C4, 0)
    expect(flatness(s)).toBeLessThan(0.01)
  })

  it('ratio, transpose and fixed frequency as the DX shows them', () => {
    expect(pitch(steady(play(voice((v) => (v.ops[0][0x16] = 0)))))).toBeCloseTo(C4 / 2, 0)
    expect(pitch(steady(play(voice((v) => (v.ops[0][0x17] = 50)))))).toBeCloseTo(C4 * 1.5, 0)
    expect(pitch(steady(play(voice((v) => (v.common[0x0c] = 0x40 + 12)))))).toBeCloseTo(C4 * 2, 0)
    expect(pitch(steady(play(voice((v) => v.ops[0].set([1, ...fixedBytes(440)], 0x15)))))).toBeCloseTo(440, -1)
  })
})

describe('algorithms', () => {
  it('every algorithm sounds with its carriers, and a modulator at level 0 changes nothing', () => {
    for (let a = 0; a < 12; a++) {
      const base = voice((v) => {
        v.common[0x10] = a
        v.ops.forEach((o) => (o[0x12] = 0))
        v.ops[0][0x12] = 110
      })
      const s = steady(play(base))
      expect(toDb(rms(s))).toBeGreaterThan(-30)
      expect(pitch(s)).toBeCloseTo(C4, 0)
    }
  })

  it('an operator that is off is silent, even at full level', () => {
    const s = steady(play(voice((v) => (v.ops[0][0x00] = 0))))
    expect(rms(s)).toBe(0)
  })
})

describe('against the DX (test/fixtures/dx-curves.json)', () => {
  it('attack times within 15 % for R1 30–100', () => {
    for (const { at, m } of engine('attack')) {
      const rate = at.rate as number
      if (rate < 30 || rate > 100) continue
      const dx = CURVES.attack[String(rate) as keyof typeof CURVES.attack]
      expect(Math.abs((m.ms as number) / dx - 1), `R1 ${rate}`).toBeLessThan(0.15)
    }
  })

  it('decay times to −20 dB within 15 % for R2 30–100', () => {
    for (const { at, m } of engine('decay')) {
      const rate = at.rate as number
      if (rate < 30 || rate > 100) continue
      const dx = CURVES.decay[String(rate) as keyof typeof CURVES.decay]!
      expect(Math.abs((m.ms20 as number) / dx - 1), `R2 ${rate}`).toBeLessThan(0.15)
    }
  })

  it('modulator depth: H2–H5 within 3 dB on average', () => {
    let sum = 0
    let n = 0
    for (const { at, m } of engine('level')) {
      const dx = CURVES.level[String(at.level) as keyof typeof CURVES.level]
      const h = m.h as number[]
      for (let k = 1; k < 5; k++) { sum += Math.abs(Math.max(-60, h[k]) - Math.max(-60, dx[k])); n++ }
    }
    expect(sum / n).toBeLessThan(3)
  })
})

describe('feedback, against the DX (test/fixtures/dx-curves.json)', () => {
  it('shapes the wave as the DX does: H2–H5 within 1 dB (faint ones 2), the loudness within 0.7 dB, saw and square, at 127 and 100', () => {
    const sine = engine('carrier')[0].m.db as number
    for (const p of points('feedback')) {
      const name = `${p.at.square ? 'square' : 'saw'}${p.at.level ? '100' : ''}` as keyof typeof CURVES.feedback
      const dx = (CURVES.feedback[name] as Record<string, { h: number[]; db: number }>)[String(p.at.feedback)]
      const m = p.measure(Float64Array.from(renderNote(p.voice, { note: p.note, holdSeconds: p.holdS, sampleRate: RATE })))
      const h = m.h as number[]
      // the harmonics that are there (a square's even ones are below −80 on both); the faint ones within 2 dB
      for (let k = 1; k < 5; k++) if (dx.h[k] > -60) expect(Math.abs(h[k] - dx.h[k]), `${JSON.stringify(p.at)} H${k + 1}`).toBeLessThan(dx.h[k] > -40 ? 1 : 2)
      expect(Math.abs((m.db as number) - sine - (dx.db - CURVES.carrier['127'])), `${JSON.stringify(p.at)} dB`).toBeLessThan(0.7)
    }
  })

  it('a carrier with feedback, modulated fast and inharmonically, is as loud as a sine carrier (voiceProbe noisegap)', () => {
    const v = (carrierFb: number) => voice((x) => {
      x.common[0x10] = 4
      x.ops.forEach((o) => o.set([127, 127, 127, 127, 127, 127, 127, 0], 0x01))
      x.ops[0].set([carrierFb, 1], 0x13)
      x.ops[1][0x12] = 100
      x.ops[1].set([1, ...fixedBytes(3000)], 0x15)
    })
    const loud = (x: Voice) => toDb(rms(steady(play(x, { note: 48 }))))
    expect(Math.abs(loud(v(127)) - loud(v(0)))).toBeLessThan(1.5)
  })

  it('never turns to noise, and doesn’t follow the operator’s level', () => {
    const fb = (feedback: number, level: number) => voice((v) => {
      v.ops[0][0x12] = level
      v.ops[0][0x13] = feedback
    })
    expect(flatness(steady(play(fb(127, 127), { note: 48 })))).toBeLessThan(0.01)
    expect(harmonicsOf(fb(112, 80))[1]).toBeCloseTo(harmonicsOf(fb(112, 127))[1], 0)
  })

  it('a shaped modulator modulates harder than a sine at the same level (voiceProbe: its fundamental at full strength)', () => {
    const mod = (feedback: number) => voice((v) => {
      v.ops[0][0x12] = 127
      v.ops[1].set([127, 127, 127, 127, 127, 127, 127, 0], 0x01)
      v.ops[1][0x12] = 60
      v.ops[1][0x13] = feedback
    })
    const centroidOf = (v: Voice) => centroid(steady(play(v, { note: 48 })))
    expect(centroidOf(mod(127))).toBeGreaterThan(2 * centroidOf(mod(0)))
  })
})

describe('levels and velocity, against the DX', () => {
  const loud = (v: Voice, velocity = 100) => toDb(rms(steady(play(v, { velocity }))))
  it('output level and EG level within 0.5 dB of the DX, against level 127', () => {
    for (const curve of ['carrier', 'eglevel'] as const) {
      const ref = engine(curve)[0].m.db as number
      for (const { at, m } of engine(curve)) {
        const dx = CURVES[curve][String(at.level) as keyof (typeof CURVES)[typeof curve]] - CURVES[curve]['127']
        expect(Math.abs((m.db as number) - ref - dx), `${curve} ${at.level}`).toBeLessThan(0.5)
      }
    }
  })

  it('velocity within 0.5 dB of the DX', () => {
    for (const sens of [64, 127]) {
      const v = voice((x) => (x.ops[0][0x11] = sens))
      const table = CURVES.velocity[String(sens) as '64']
      for (const vel of [20, 40, 64, 100]) {
        const dx = table[String(vel) as '20'] - table['127']
        expect(Math.abs(loud(v, vel) - loud(v, 127) - dx), `sens ${sens} velocity ${vel}`).toBeLessThan(0.5)
      }
    }
  })

  it('the output is divided by the number of carriers (two 6 dB, four 12 dB quieter than one)', () => {
    const carriers = (algorithm: number) => voice((v) => {
      v.common[0x10] = algorithm
      v.ops.forEach((o) => { o[0x12] = 127; o.set([127, 127, 127, 127, 127, 127, 127, 0], 0x01) })
      // the modulators silent: only the carriers count
      for (let op = 0; op < 4; op++) if (!ALGORITHMS[algorithm].carriers.includes(op)) v.ops[op][0x12] = 0
    })
    // one carrier at 127, four at 127 in phase: four times the amplitude, divided by four
    expect(loud(carriers(11)) - loud(carriers(0))).toBeCloseTo(0, 0)
  })
})

describe('modulation', () => {
  it('the LFO moves the pitch only of operators with PMD on', () => {
    const vib = (on: number) => voice((v) => {
      v.common.set([0, 40, 0, 127], 0x11) // a slow sine, ~0.5 Hz
      v.ops[0][0x0f] = on
    })
    const spread = (v: Voice) => {
      const s = play(v, { holdSeconds: 1.2 })
      const ps = [0.2, 0.35, 0.5, 0.65, 0.8].map((t) => pitch(slice(s, t, t + 0.05)))
      return Math.max(...ps) / Math.min(...ps)
    }
    expect(spread(vib(1))).toBeGreaterThan(1.03)
    expect(spread(vib(0))).toBeLessThan(1.002)
  })

  it('the pitch EG moves the pitch only of operators with it on', () => {
    const peg = (on: number) => voice((v) => {
      v.common.set([127, 127, 127, 127, 0x40, 0x40, 0x40, 0x40 + 12], 0x15)
      v.ops[0][0x10] = on
    })
    // L4 is where the note starts: an octave up, then down to 0 at once
    expect(pitch(slice(play(peg(1)), 0.3, 0.5))).toBeCloseTo(C4, 0)
    expect(pitch(slice(play(peg(0), { holdSeconds: 0.5 }), 0.1, 0.3))).toBeCloseTo(C4, 0)
  })

  it('amplitude modulation lowers the level of its operator', () => {
    const am = voice((v) => {
      v.common.set([4, 100, 0, 0], 0x11)
      v.ops[0][0x0e] = 127
    })
    // a square LFO: half the time full, half the time ~98 dB down, so 3 dB down on average
    expect(toDb(rms(steady(play(am))))).toBeLessThan(toDb(rms(steady(play(initVoice())))) - 2.5)
  })
})

describe('notes', () => {
  it('the same voice renders the same samples', () => {
    const v = voice((x) => (x.ops[0][0x13] = 120))
    expect(renderNote(v, { holdSeconds: 0.2 })).toEqual(renderNote(v, { holdSeconds: 0.2 }))
  })

  it('a released note dies away at its release rate', () => {
    const s = play(voice((v) => (v.ops[0][0x04] = 80)), { holdSeconds: 0.3, releaseSeconds: 1 })
    expect(toDb(rms(slice(s, 1.1, 1.3)))).toBeLessThan(toDb(rms(slice(s, 0.1, 0.3))) - 60)
  })

  it('velocity sensitivity makes soft notes quieter', () => {
    const v = voice((x) => (x.ops[0][0x11] = 127))
    expect(toDb(rms(steady(play(v, { velocity: 30 }))))).toBeLessThan(toDb(rms(steady(play(v, { velocity: 120 })))) - 6)
  })
})

describe('release, LFO, pitch EG, detune and scaling, against the DX (dx-curves.json points)', () => {
  /** How close each measure has to be: absolute, or a share of the DX's value. */
  const TOLERANCE: Record<string, { abs?: number; share?: number }> = {
    db: { abs: 0.6 }, swingDb: { abs: 1 }, hz: { share: 0.05 }, swing: { share: 0.05, abs: 0.1 }, centre: { abs: 0.2 },
    semis: { abs: 0.2 }, cents: { abs: 0.5 }, ms20: { share: 0.15, abs: 25 }, ms40: { share: 0.15, abs: 25 },
    halfMs: { share: 0.15, abs: 12 }, nearMs: { share: 0.15, abs: 12 }, startMs: { abs: 100 }, fullMs: { abs: 150 },
  }
  /** Beyond what a take can show: its noise floor (~75 dB down) and LFO 127's deep, fast swing in 2 ms blocks. */
  const beyondTakes = (curve: string, at: Record<string, unknown>, key: string) =>
    key === 'fullDb' || (curve === 'amd' && at.amd === 127) || (curve === 'lfospeed' && at.speed === 127) || (curve === 'ksc' && key === 'db' && at.kcurve === 1 && (at.note === 24 || at.note === 96))
  const POINTS = (CURVES as unknown as { points: Record<string, { at: Record<string, unknown>; m: Record<string, number | null> }[]> }).points

  const measured = (p: Point) => p.measure(Float64Array.from(renderNote(p.voice, { note: p.note, velocity: p.velocity ?? 100, holdSeconds: p.holdS, releaseSeconds: p.tailS, sampleRate: RATE })))

  for (const [curve, rows] of Object.entries(POINTS)) {
    it(curve, () => {
      const all = points(curve as Curve)
      // loudness against the curve's own first point: the takes' recording level isn't the engine's
      const offset = typeof rows[0].m.db === 'number' ? rows[0].m.db - (measured(all[0]).db as number) : 0
      for (const p of all) {
        const row = rows.find((r) => Object.entries(r.at).every(([k, x]) => p.at[k] === x) && Object.keys(p.at).length === Object.keys(r.at).length)
        if (!row) continue
        const m = measured(p)
        for (const [key, dx] of Object.entries(row.m)) {
          const t = TOLERANCE[key]
          if (!t || dx === null || beyondTakes(curve, p.at, key)) continue
          const got = (m[key] as number) + (key === 'db' ? offset : 0)
          const allowed = Math.max(t.abs ?? 0, (t.share ?? 0) * Math.abs(dx))
          expect(Math.abs(got - dx), `${curve} ${JSON.stringify(p.at)} ${key}: DX ${dx}, engine ${got.toFixed(2)}`).toBeLessThanOrEqual(allowed)
        }
      }
    })
  }
})
