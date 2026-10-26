import { describe, expect, it } from 'vitest'
import { centroid, envelope, flatness, pitch, rms, slice, toDb } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { ALGORITHMS } from '../src/params/algorithms'
import { SHAPES } from '../src/style/choices'
import type { Envelope } from '../src/style/shapes'
import { voiceName, voiceProblems } from '../src/sysex/codec'
import { angleOf, mixOf, NO_PINS, REGISTERS, SECTOR, TONALITIES, type Pin, type Tonality, type WheelChoices } from '../src/wheel/choices'
import { BRANCH_SHARE, generateWheel, wheelName } from '../src/wheel/generate'
import { findLayout } from '../src/wheel/layout'
import { ensureAudible, levelLoudness, loudness, SILENT_DB, TARGET_DB } from '../src/wheel/loudness'
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

describe('loudness and audibility', () => {
  it('every tonality from one pin is levelled to the target, within 1 dB', () => {
    for (const t of TONALITIES) for (const radius of [0, 1]) {
      const { loudness } = generateWheel(choices([pin(t, radius)]), { seed: 1 })
      expect(Math.abs(loudness - TARGET_DB), `${t} r${radius} ${loudness.toFixed(1)}`).toBeLessThan(1)
    }
  })

  it('200 random pin sets and controls: none silent, none more than 3 dB off the target', () => {
    const r = rng(42)
    for (let i = 0; i < 200; i++) {
      const pins = Array.from({ length: r.int(1, 3) }, () => ({ angle: r.range(0, 360), radius: r.next(), weight: r.range(0.2, 1) }))
      const shape = r.chance(0.5) ? r.pick(ENVELOPES) : null
      const controls: Partial<WheelChoices> = {
        length: r.range(-1, 1), brightness: r.range(-1, 1), treble: r.range(-1, 1), complexity: r.next(), motion: r.next(),
        register: r.chance(0.5) ? r.pick(REGISTERS) : null, velocity: r.chance(0.5) ? r.next() : null, pitchAccent: r.chance(0.3),
      }
      const g = generateWheel({ ...choices(pins, shape), ...controls }, { seed: i, wild: r.next() })
      const label = JSON.stringify({ pins, shape, i })
      expect(voiceProblems(g.voice), label).toEqual([])
      expect(g.loudness, label).toBeGreaterThan(SILENT_DB)
      expect(Math.abs(g.loudness - TARGET_DB), label).toBeLessThan(3)
    }
  })

  it('levelling moves every carrier by the same steps: the balance between pins stays', () => {
    const g = generateWheel(choices([pin('bell', 0.5, 1), pin('warm', 0.5, 0.5)]), { seed: 1 })
    const carriers = ALGORITHMS[g.voice.common[0x10]].carriers.filter((op) => g.voice.ops[op][0x12] > 0)
    const bell = carriers.find((op) => g.opTonality[op] === 'bell')!
    const warm = carriers.find((op) => g.opTonality[op] === 'warm')!
    const before = { common: g.voice.common.slice(), ops: g.voice.ops.map((o) => o.slice()) as typeof g.voice.ops }
    before.ops[bell][0x12] -= 20
    before.ops[warm][0x12] -= 20
    levelLoudness(before)
    expect(before.ops[bell][0x12] - before.ops[warm][0x12]).toBe(g.voice.ops[bell][0x12] - g.voice.ops[warm][0x12])
  })

  it('a voice with no carrier heard gets one', () => {
    const v = generateWheel(choices([pin('bell')]), { seed: 1 }).voice
    for (const op of ALGORITHMS[v.common[0x10]].carriers) v.ops[op][0x12] = 0
    ensureAudible(v)
    expect(loudness(v)).toBeGreaterThan(SILENT_DB)
  })
})

describe('the controls (measured with the probe engine)', () => {
  const SR = 48000
  const gen = (t: Tonality, c: Partial<WheelChoices> = {}, seed = 1) => generateWheel({ ...choices([pin(t)]), ...c }, { seed })
  const play = (c: Partial<WheelChoices>, t: Tonality, o: { note?: number; velocity?: number; hold?: number } = {}) => ({
    samples: renderNote(gen(t, c).voice, { note: o.note ?? 60, velocity: o.velocity ?? 100, holdSeconds: o.hold ?? 1, sampleRate: SR }), sampleRate: SR,
  })
  const bright = (c: Partial<WheelChoices>, t: Tonality, note = 60) => centroid(slice(play({ shape: 'gate', ...c }, t, { note }), 0.1, 0.5)) / (440 * 2 ** ((note - 69) / 12))
  const db = (s: ReturnType<typeof play>, from: number, to: number) => toDb(rms(slice(s, from, to)))

  it('brightness: mellow darker, bright brighter', () => {
    for (const t of ['bell', 'brass', 'reed', 'organ'] as Tonality[]) {
      expect(bright({ brightness: 1 }, t), t).toBeGreaterThan(bright({}, t) * 1.1)
      expect(bright({ brightness: -1 }, t), t).toBeLessThan(bright({}, t))
    }
  })

  it('length: a long struck note still sounds where a short one has died', () => {
    const late = (length: number) => { const s = play({ length }, 'bell', { hold: 2 }); return db(s, 1.5, 1.8) - db(s, 0.05, 0.25) }
    expect(late(1)).toBeGreaterThan(late(-1) + 10)
  })

  it('treble: brighter up the keyboard against the bass', () => {
    const tilt = (treble: number) => bright({ treble }, 'brass', 84) / bright({ treble }, 'brass', 36)
    expect(tilt(1)).toBeGreaterThan(tilt(-1) * 1.3)
  })

  it('complexity: pure is two operators, a quarter three; dense adds and deepens', () => {
    const count = (complexity: number, t: Tonality) => gen(t, { complexity }).voice.ops.filter((o) => o[0x12] > 0).length
    for (const t of TONALITIES) {
      expect(count(0, t), t).toBeLessThanOrEqual(2)
      expect(count(0.25, t), t).toBeLessThanOrEqual(3)
      expect(count(1, t), t).toBeGreaterThanOrEqual(count(0.5, t))
    }
    expect(bright({ complexity: 1 }, 'warm')).toBeGreaterThan(bright({}, 'warm'))
  })

  it('motion: a held note keeps moving; a voice with vibrato keeps its LFO', () => {
    const sway = (motion: number) => {
      const env = [...envelope(slice(play({ motion }, 'brass', { hold: 2 }), 0.5, 2), 0.05)].map((x) => toDb(x))
      return Math.max(...env) - Math.min(...env)
    }
    expect(sway(1)).toBeGreaterThan(sway(0) + 1)
    const lfo = (motion: number) => [...gen('string', { motion }).voice.common.subarray(0x11, 0x15)]
    expect(lfo(1)).toEqual(lfo(0))
  })

  it('register: an octave or two down or up; lead glides one note at a time', () => {
    const f0 = (register: WheelChoices['register']) => pitch(slice(play({ register, shape: 'gate' }, 'warm'), 0.3, 0.6))
    expect(f0('bass')).toBeCloseTo(f0('mid') / 2, 0)
    expect(f0('sub')).toBeCloseTo(f0('mid') / 4, 0)
    expect(f0('high')).toBeCloseTo(f0('mid') * 2, -1)
    const lead = gen('brass', { register: 'lead' }).voice
    expect(lead.common[0x0d]).toBe(2)
    expect(lead.common[0x0e]).toBeGreaterThan(0)
    expect(gen('brass', { register: 'lead', mode: 'poly' }).voice.common[0x0d]).toBe(0)
  })

  it('velocity: strong answers to the keys, none doesn’t', () => {
    const range = (velocity: number) => db(play({ velocity, shape: 'gate' }, 'tine', { velocity: 120 }), 0.1, 0.4) - db(play({ velocity, shape: 'gate' }, 'tine', { velocity: 40 }), 0.1, 0.4)
    expect(range(0)).toBeLessThan(1)
    expect(range(1)).toBeGreaterThan(6)
  })

  it('pitch accent: each note falls into its pitch', () => {
    const s = play({ pitchAccent: true, shape: 'gate' }, 'warm')
    expect(pitch(slice(s, 0, 0.02))).toBeGreaterThan(pitch(slice(s, 0.3, 0.5)) * 1.02)
  })

  it('effects: the colour in slot 1, the space in slot 2, the tonality’s own when none is chosen', () => {
    expect(gen('bell').voice.common[0x20]).toBe(7)
    const v = gen('bell', { colour: 'chorus', space: 'echo' }).voice
    expect([v.common[0x1d], v.common[0x20]]).toEqual([3, 6])
  })
})
