import { describe, expect, it } from 'vitest'
import { renderNote, type RenderOptions } from '../src/engine/render'
import { flatness, periodicity, pitch, rms, slice, toDb, type Segment } from '../src/engine/measure'
import { fixedBytes } from '../src/params/display'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { points } from '../tools/curves'
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

describe('feedback (to calibrate: tools/dxCurves.ts feedback)', () => {
  /** OP1 alone at full level: the feedback follows the operator's own level */
  const fb = (level: number, square: boolean) => voice((v) => {
    v.ops[0][0x12] = 127
    v.ops[0][0x13] = level
    v.ops[0][0x14] = square ? 1 : 0
  })

  it('saw feedback brings in every harmonic, more with more feedback', () => {
    const mid = harmonicsOf(fb(96, false))
    const high = harmonicsOf(fb(112, false))
    expect(mid[1]).toBeGreaterThan(-30)
    expect(high[1]).toBeGreaterThan(mid[1])
    expect(high[2]).toBeGreaterThan(mid[2])
  })

  it('square feedback brings in odd harmonics only', () => {
    const h = harmonicsOf(fb(112, true))
    expect(h[2]).toBeGreaterThan(-30)
    expect(h[2] - Math.max(h[1], h[3])).toBeGreaterThan(30)
  })

  it('saw feedback near the top turns to noise (at C3; the DX’s takes will say how it goes with pitch)', () => {
    const at = (level: number) => steady(play(fb(level, false), { note: 48 }))
    expect(flatness(at(120))).toBeGreaterThan(0.3)
    expect(periodicity(at(127))).toBeLessThan(periodicity(at(96)) - 0.3)
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
    expect(toDb(rms(steady(play(am))))).toBeLessThan(toDb(rms(steady(play(initVoice())))) - 3)
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
