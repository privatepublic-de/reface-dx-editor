import { describe, expect, it } from 'vitest'
import { centroid, slice } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { ALGORITHMS } from '../src/params/algorithms'
import { SHAPES } from '../src/style/choices'
import type { Envelope } from '../src/style/shapes'
import { voiceName, voiceProblems } from '../src/sysex/codec'
import { angleOf, mixOf, NO_PINS, SECTOR, TONALITIES, type Pin, type Tonality, type WheelChoices } from '../src/wheel/choices'
import { generateWheel, wheelName } from '../src/wheel/generate'
import { rolesHold, TONALITY_DEFS } from '../src/wheel/tonalities'

const pin = (t: Tonality, radius = 0.5, weight = 1, offset = 0): Pin => ({ angle: angleOf(t) + offset, radius, weight })
const choices = (pins: Pin[], shape: Envelope | null = null): WheelChoices => ({ ...NO_PINS, pins, shape })
const ENVELOPES: Envelope[] = [...SHAPES, 'swell']

describe('the mix', () => {
  it('a pin near a sector’s centre is that tonality alone', () => {
    expect(mixOf([pin('bell', 0.7, 2, 3)])).toEqual([{ tonality: 'bell', weight: 2, intensity: 0.7 }])
  })

  it('a pin between two sectors belongs to both, and the same tonality adds up', () => {
    const halfway = mixOf([pin('bell', 0.5, 1, SECTOR / 2)])
    expect(halfway.map((p) => p.tonality)).toEqual(['bell', 'glass'])
    expect(halfway[0].weight).toBeCloseTo(0.5)
    const two = mixOf([pin('warm', 0.2, 1), pin('reed', 0.5, 1), pin('warm', 0.9, 1)])
    expect(two[0]).toEqual({ tonality: 'warm', weight: 2, intensity: 0.9 })
  })

  it('heaviest first, ties in wheel order; the wheel wraps', () => {
    expect(mixOf([pin('string'), pin('noise'), pin('organ', 0.5, 3)]).map((p) => p.tonality)).toEqual(['organ', 'noise', 'string'])
    expect(mixOf([{ angle: -SECTOR / 2, radius: 0.5, weight: 1 }]).map((p) => p.tonality).sort()).toEqual(['breath', 'noise'])
  })
})

describe('the tonalities', () => {
  it('every skeleton keeps its roles in every algorithm it lists, with algorithms 1–12', () => {
    for (const t of TONALITIES) {
      const { skeleton } = TONALITY_DEFS[t]
      expect(skeleton.algorithms.every((a) => a >= 1 && a <= 12), t).toBe(true)
      expect(rolesHold(skeleton), t).toBe(true)
    }
  })

  it('a branch is free: its operators are silent in the skeleton or carriers of their own', () => {
    for (const t of TONALITIES) {
      const { skeleton } = TONALITY_DEFS[t]
      for (const n of skeleton.algorithms) {
        const a = ALGORITHMS[n - 1]
        for (const [c, m] of skeleton.branches ?? []) {
          // the carrier feeds nothing else, its modulator only it
          expect(a.modulations.some(([from]) => from === c), `${t} ${n}`).toBe(false)
          if (m !== undefined) expect(a.modulations.filter(([from]) => from === m).map(([, to]) => to), `${t} ${n}`).toEqual([c])
        }
      }
    }
  })

  it('every name fits the DX’s 10 characters, alone and with any second tonality', () => {
    for (const a of TONALITIES) for (const b of TONALITIES) {
      const name = wheelName(mixOf([pin(a, 0.5, 2), pin(b)]))
      expect(name.length, `${a} ${b}`).toBeLessThanOrEqual(10)
    }
    expect(wheelName(mixOf([pin('bell', 0.5, 2), pin('breath')]))).toBe('Airy Bell')
  })
})

describe('a voice from one pin', () => {
  it('every tonality, shape, radius and wildness gives a valid voice with a carrier that plays', () => {
    for (const t of TONALITIES) for (const shape of [null, ...ENVELOPES]) for (const radius of [0, 1]) for (const wild of [0, 1]) {
      const { voice: v, mix } = generateWheel(choices([pin(t, radius)], shape), { seed: 7, wild })
      const label = `${t} ${shape} r${radius} w${wild}`
      expect(voiceProblems(v), label).toEqual([])
      expect(mix[0].tonality).toBe(t)
      const carriers = ALGORITHMS[v.common[0x10]].carriers
      expect(carriers.some((op) => v.ops[op][0x00] === 1 && v.ops[op][0x12] >= 90 && v.ops[op][0x05] > 0), label).toBe(true)
      expect(voiceName(v).length).toBeGreaterThan(0)
    }
  })

  it('the same seed gives the same voice; another seed another one', () => {
    const c = choices([pin('bell', 0.6)])
    expect(generateWheel(c, { seed: 3 }).voice).toEqual(generateWheel(c, { seed: 3 }).voice)
    const seeds = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(generateWheel(c, { seed, wild: 1 }).voice)))
    expect(seeds.size).toBeGreaterThan(3)
  })

  it('without pins the seed picks a tonality', () => {
    const { mix, voice } = generateWheel(NO_PINS, { seed: 11 })
    expect(mix).toHaveLength(1)
    expect(voiceProblems(voice)).toEqual([])
  })

  it('further out, deeper: the modulators go up, on the organ the upper drawbars', () => {
    const levels = (t: Tonality, radius: number) => [...generateWheel(choices([pin(t, radius)]), { seed: 5 }).voice.ops].map((o) => o[0x12])
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    for (const t of TONALITIES.filter((x) => x !== 'organ' && x !== 'noise')) expect(sum(levels(t, 1)), t).toBeGreaterThan(sum(levels(t, 0)))
    expect(sum(levels('organ', 1))).toBeGreaterThan(sum(levels('organ', 0)))
  })

  it('further out sounds brighter (the probe engine, modulator depth fitted to the DX)', () => {
    const bright = (t: Tonality, radius: number) => {
      const v = generateWheel(choices([pin(t, radius)], 'gate'), { seed: 5 }).voice
      const s = { samples: renderNote(v, { note: 48, holdSeconds: 0.5, sampleRate: 48000 }), sampleRate: 48000 }
      return centroid(slice(s, 0.1, 0.45))
    }
    for (const t of ['warm', 'reed', 'brass', 'bell', 'tine'] as Tonality[]) expect(bright(t, 1), t).toBeGreaterThan(bright(t, 0) * 1.1)
  })
})
