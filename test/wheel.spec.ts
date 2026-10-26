import { describe, expect, it } from 'vitest'
import { centroid, flatness, slice } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { ALGORITHMS } from '../src/params/algorithms'
import { SHAPES } from '../src/style/choices'
import type { Envelope } from '../src/style/shapes'
import { voiceName, voiceProblems } from '../src/sysex/codec'
import { angleOf, mixOf, NO_PINS, SECTOR, TONALITIES, type Pin, type Tonality, type WheelChoices } from '../src/wheel/choices'
import { BRANCH_SHARE, generateWheel, wheelName } from '../src/wheel/generate'
import { findLayout } from '../src/wheel/layout'
import { rng } from '../src/style/random'
import { TRANSFORMS } from '../src/wheel/transforms'
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

describe('more pins', () => {
  const modulates = (a: number, x: number, y: number) => ALGORITHMS[a].modulations.some(([f, t]) => f === x && t === y)

  it('every pair of tonalities at every weight gives a valid voice, the base keeping a carrier that plays', () => {
    for (const a of TONALITIES) for (const b of TONALITIES) for (const w of [0.2, 0.4, 0.8, 1]) {
      if (a === b) continue
      const g = generateWheel(choices([pin(a, 0.5, 1), pin(b, 0.5, w)]), { seed: 3 })
      const v = g.voice
      const label = `${a}+${b}@${w}`
      expect(voiceProblems(v), label).toEqual([])
      const carriers = ALGORITHMS[v.common[0x10]].carriers
      expect(carriers.some((op) => g.opTonality[op] === a && v.ops[op][0x12] >= 80), label).toBe(true)
      // every sounding operator belongs to a tonality, every silent one to none
      v.ops.forEach((o, op) => expect(g.opTonality[op] !== null, `${label} OP${op + 1}`).toBe(o[0x12] > 0))
      expect(g.roles.map((r) => r.tonality)).toEqual(g.mix.map((p) => p.tonality))
    }
  })

  it('a light pin colours the base: all four operators stay the base’s', () => {
    const g = generateWheel(choices([pin('bell', 0.5, 1), pin('warm', 0.5, BRANCH_SHARE - 0.05)]), { seed: 1 })
    expect(g.roles[1].as).toBe('transform')
    expect(new Set(g.opTonality.filter(Boolean))).toEqual(new Set(['bell']))
  })

  it('a heavier pin takes the pair the base can spare, in the base’s own algorithm', () => {
    const g = generateWheel(choices([pin('bell', 0.5, 1), pin('warm', 0.5, 0.5)]), { seed: 1 })
    expect(g.roles[1].as).toBe('branch')
    expect(g.voice.common[0x10]).toBe(7)
    expect(g.opTonality).toEqual(['bell', 'bell', 'warm', 'warm'])
  })

  it('without a pair to spare, one operator alone: its feedback carries it', () => {
    const g = generateWheel(choices([pin('tine', 0.5, 1), pin('reed', 0.5, 0.8)]), { seed: 1 })
    expect(g.roles[1].as).toBe('solo')
    const op = g.opTonality.indexOf('reed')
    expect(ALGORITHMS[g.voice.common[0x10]].carriers).toContain(op)
    expect(g.voice.ops[op][0x14]).toBe(1)
    expect(g.voice.ops[op][0x13]).toBeGreaterThan(50)
    // the tine's two pairs are still pairs
    expect(g.opTonality.filter((t) => t === 'tine')).toHaveLength(3)
  })

  it('a pin lighter than 60 % grafts where its tonality can: a modulator in the base’s main carrier', () => {
    const g = generateWheel(choices([pin('wooden', 0.5, 1), pin('bell', 0.5, 0.4)]), { seed: 1 })
    expect(g.roles[1].as).toBe('graft')
    const op = g.opTonality.indexOf('bell')
    const a = g.voice.common[0x10]
    const into = ALGORITHMS[a].modulations.filter(([f]) => f === op).map(([, t]) => t)
    expect(into).toHaveLength(1)
    expect(g.opTonality[into[0]]).toBe('wooden')
    expect(ALGORITHMS[a].carriers).toContain(into[0])
  })

  it('a noise graft makes the base noisier (the probe engine)', () => {
    const noisiness = (pins: Pin[]) => {
      const v = generateWheel(choices(pins, 'gate'), { seed: 1 }).voice
      return flatness(slice({ samples: renderNote(v, { note: 48, holdSeconds: 0.6, sampleRate: 48000 }), sampleRate: 48000 }, 0.1, 0.55))
    }
    const g = generateWheel(choices([pin('metallic', 0.5, 1), pin('noise', 0.5, 0.4)]), { seed: 1 })
    expect(g.roles[1].as).toBe('graft')
    expect(noisiness([pin('metallic', 0.5, 1), pin('noise', 0.5, 0.4)])).toBeGreaterThan(noisiness([pin('metallic', 0.5, 1)]) * 1.5)
  })

  it('a third pin leaves the second one’s operators alone', () => {
    for (const [a, b, c] of [['bell', 'warm', 'reed'], ['organ', 'string', 'glass'], ['tine', 'brass', 'noise']] as Tonality[][]) {
      const two = generateWheel(choices([pin(a, 0.5, 1), pin(b, 0.5, 0.7)]), { seed: 4 })
      const three = generateWheel(choices([pin(a, 0.5, 1), pin(b, 0.5, 0.7), pin(c, 0.5, 0.5)]), { seed: 4 })
      expect(three.opTonality.filter((t) => t === b).length, `${a} ${b} ${c}`).toBe(two.opTonality.filter((t) => t === b).length)
      expect(voiceProblems(three.voice)).toEqual([])
    }
  })

  it('a place for a pin keeps who modulates whom among the base’s operators', () => {
    for (const t of TONALITIES) {
      const v = generateWheel(choices([pin(t)]), { seed: 2 }).voice
      for (const need of [{ kind: 'pair' }, { kind: 'solo' }] as const) {
        const l = findLayout(v, need, [])
        if (!l) continue
        const kept = [0, 1, 2, 3].filter((op) => v.ops[op][0x12] > 0 && !l.given.includes(op))
        const a = v.common[0x10]
        for (const x of kept) for (const y of kept) expect(modulates(l.algorithm, l.perm[x], l.perm[y]), `${t} ${need.kind}`).toBe(modulates(a, x, y))
      }
    }
  })

  it('every transform changes a voice', () => {
    for (const t of TONALITIES) {
      const base = generateWheel(choices([pin(t === 'bell' ? 'brass' : 'bell')]), { seed: 1 }).voice
      const v = { common: base.common.slice(), ops: base.ops.map((o) => o.slice()) as typeof base.ops }
      TRANSFORMS[t](v, 1, rng(1))
      expect(JSON.stringify(v), t).not.toBe(JSON.stringify(base))
    }
  })
})
