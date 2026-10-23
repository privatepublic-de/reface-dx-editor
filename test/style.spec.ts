import { describe, expect, it } from 'vitest'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { fixedBytes, fixedHzOf, ratioBytes, ratioOf } from '../src/params/display'
import { initVoice } from '../src/params/init'
import { CHARACTERS, FAMILIES, NO_STYLE, SHAPES, type StyleChoices } from '../src/style/choices'
import { mutate, styleAdjust, styleInit, styleName, stylePreview } from '../src/style/style'
import { rolesOf } from '../src/style/transforms'
import { diffVoices, voiceName, voiceProblems, type Voice } from '../src/sysex/codec'

const style = (c: Partial<StyleChoices>): StyleChoices => ({ ...NO_STYLE, ...c })

/** How far apart two voices are: the sum of their byte differences, the name left out. */
const distance = (a: Voice, b: Voice) =>
  [...a.common.subarray(10).map((x, i) => Math.abs(x - b.common[10 + i])), ...a.ops.flatMap((op, n) => [...op].map((x, i) => Math.abs(x - b.ops[n][i])))].reduce((s, d) => s + d, 0)

/** What every result must be: valid, audible, named within the DX's 10 characters. */
function guard(v: Voice) {
  expect(voiceProblems(v)).toEqual([])
  const loud = rolesOf(v).carriers.some((op) => v.ops[op][0x00] === 1 && v.ops[op][0x12] >= 70 && Math.max(v.ops[op][5], v.ops[op][6], v.ops[op][7]) > 0)
  expect(loud).toBe(true)
  expect(voiceName(v).length).toBeLessThanOrEqual(10)
}

describe('ratio and fixed-frequency bytes', () => {
  it('invert the DX’s formulas', () => {
    for (const r of [0.5, 0.75, 1, 1.41, 3.5, 7.07, 14, 31.99]) expect(ratioOf(...ratioBytes(r))).toBeCloseTo(r, 2)
    for (const hz of [1, 3.16, 45.7, 316, 2344, 9772]) expect(fixedHzOf(...fixedBytes(hz)) / hz).toBeCloseTo(1, 1)
  })
})

describe('Init with a style', () => {
  it('is the plain VOICE INIT with nothing chosen', () => {
    expect(styleInit(NO_STYLE, 1)).toEqual(initVoice())
  })

  it('gives a valid, audible, named voice for every family × shape', () => {
    for (const family of FAMILIES) for (const shape of SHAPES) for (const seed of [1, 2]) guard(styleInit(style({ family, shape }), seed))
  })

  it('stays valid with every character at full, with the sliders at their ends', () => {
    for (const family of [...FAMILIES, null]) {
      for (const k of CHARACTERS) {
        guard(styleInit(style({ family, characters: { [k]: 1 }, brightness: -1, treble: 1, length: 1, evolving: 1, expressive: 1 }), 3))
        guard(styleInit(style({ family, characters: { [k]: 1 }, brightness: 1, treble: -1, length: -1 }), 4))
      }
    }
  })

  it('gives the same voice for the same seed, and Roll again (another seed) varies it', () => {
    const c = style({ family: 'bass', characters: { analogue: 0.5 } })
    expect(styleInit(c, 7)).toEqual(styleInit(c, 7))
    expect([1, 2, 3, 4, 5].map((s) => styleInit(c, s)).some((v, _, all) => diffVoices(all[0], v).length > 0)).toBe(true)
  })

  it('does what the words say', () => {
    const hollow = styleInit(style({ family: 'bass', characters: { hollow: 1 } }), 1)
    expect(rolesOf(hollow).carriers.every((op) => hollow.ops[op][0x14] === 1 && hollow.ops[op][0x13] >= 90)).toBe(true)
    const metal = styleInit(style({ family: 'organ', characters: { metallic: 1 } }), 1)
    expect(metal.ops.some((op) => op[0x17] !== 0)).toBe(true) // off whole-number ratios
    const treble = styleInit(style({ family: 'epiano', treble: -1 }), 1)
    expect(rolesOf(treble).modulators.every((op) => treble.ops[op][0x0b] === 40 && treble.ops[op][0x0d] === 0 && treble.ops[op][0x0c] === 3)).toBe(true) // −LIN up, +LIN down
    const hall = styleInit(style({ shape: 'pad', space: 'hall' }), 1)
    expect(hall.common[0x20]).toBe(7) // reverb
    const driven = styleInit(style({ family: 'lead', colour: 'drive' }), 1)
    expect(driven.common[0x1d]).toBe(1) // distortion
    expect(styleInit(style({ colour: 'drive' }), 1).common[0x1d]).toBe(1) // without a family too
    expect(styleInit(style({ family: 'bass', characters: { hollow: 1 } }), 1).common[0x1d]).toBe(5) // a character's colour: phaser
    expect(styleInit(style({ family: 'bass', characters: { hollow: 1 }, colour: 'wah' }), 1).common[0x1d]).toBe(2) // the chosen one wins
    const glassy = styleInit(style({ family: 'bass', characters: { glassy: 1 } }), 1)
    expect(glassy.ops.some((op) => op[0x15] === 0 && op[0x16] >= 7 && op[0x06] === 0)).toBe(true) // a high ratio that dies away
  })

  it('keeps the effects of the voice it replaces with keepFx', () => {
    const now = DEMO_VOICES[0]
    const v = styleInit(style({ family: 'bass', colour: 'drive', space: 'hall', keepFx: true }), 1, now)
    expect(Array.from(v.common.subarray(0x1d, 0x23))).toEqual(Array.from(now.common.subarray(0x1d, 0x23)))
  })

  it('names after the style, within 10 characters', () => {
    expect(styleName(style({ characters: { hollow: 1 } }), 'bass')).toBe('Hollow Bass'.length <= 10 ? 'Hollow Bass' : 'Bass')
    expect(styleName(style({ brightness: -1 }), 'bass')).toBe('Soft Bass')
    expect(styleName(style({ characters: { metallic: 1 } }), 'bell')).toBe('Metal Bell')
    expect(styleName(style({ shape: 'pad' }), null)).toBe('Pad')
    for (const f of FAMILIES) for (const k of CHARACTERS) expect(styleName(style({ characters: { [k]: 1 }, brightness: 1 }), f).length).toBeLessThanOrEqual(10)
  })
})

describe('Adjust', () => {
  const voice = DEMO_VOICES[0]

  it('changes nothing at amount 0', () => {
    expect(styleAdjust(voice, style({ family: 'organ', brightness: 1 }), 0, 1, 1)).toEqual(voice)
  })

  it('moves towards the style click by click, and keeps the name', () => {
    const c = style({ family: 'organ', characters: { hollow: 0.5 } })
    const target = styleInit(c, 9)
    let v = voice
    const distances = [distance(v, target)]
    for (let i = 0; i < 6; i++) {
      v = styleAdjust(v, c, 0.4, 9, 100 + i)
      distances.push(distance(v, target))
      guard(v)
      expect(voiceName(v)).toBe(voiceName(voice))
    }
    // every click gets closer; after six, less than a tenth of the way is left
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThan(distances[i - 1])
    expect(distances.at(-1)!).toBeLessThan(distances[0] / 10)
  })

  it('without a family keeps the algorithm and ratios', () => {
    const v = styleAdjust(voice, style({ brightness: 1, shape: 'pad', length: 1 }), 1, 2, 2)
    expect(v.common[0x10]).toBe(voice.common[0x10])
    expect(v.ops.map((o) => [o[0x15], o[0x16], o[0x17]])).toEqual(voice.ops.map((o) => [o[0x15], o[0x16], o[0x17]]))
    guard(v)
  })

  it('keeps the effects with keepFx', () => {
    const v = styleAdjust(voice, style({ family: 'lead', colour: 'drive', keepFx: true }), 1, 3, 3)
    expect(Array.from(v.common.subarray(0x1d, 0x23))).toEqual(Array.from(voice.common.subarray(0x1d, 0x23)))
  })
})

describe('Variation and Mutate', () => {
  it('wild variation: valid for every family, and for any family', () => {
    for (const family of [...FAMILIES, 'any' as const]) for (const seed of [1, 2, 3]) guard(styleInit(style({ family }), seed, undefined, 1))
  })

  it('any family: the seed picks one, the same each time', () => {
    const c = style({ family: 'any' })
    expect(styleInit(c, 5)).toEqual(styleInit(c, 5))
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => voiceName(styleInit(c, s)))).size).toBeGreaterThan(2)
  })

  it('Adjust with full amount lands on what New makes with the same seed and variation', () => {
    const c = style({ family: 'any', characters: { hollow: 1 } })
    const v = styleAdjust(DEMO_VOICES[1], c, 1, 4, 4, 0.6)
    expect(distance(v, styleInit(c, 4, undefined, 0.6))).toBe(0)
  })

  it('mutate: 0 % changes nothing; more changes more; the name stays; the algorithm only from 50 %', () => {
    const v = DEMO_VOICES[3]
    expect(mutate(v, 0, 1)).toEqual(v)
    const small = diffVoices(v, mutate(v, 5, 1)).length
    const big = diffVoices(v, mutate(v, 60, 1)).length
    expect(small).toBeLessThan(big)
    for (let seed = 1; seed < 20; seed++) {
      const m = mutate(v, 40, seed)
      expect(m.common[0x10]).toBe(v.common[0x10])
      expect(voiceName(m)).toBe(voiceName(v))
      guard(m)
    }
    const kept = mutate(v, 100, 5, true)
    expect(Array.from(kept.common.subarray(0x1d, 0x23))).toEqual(Array.from(v.common.subarray(0x1d, 0x23)))
  })
})

describe('the style editor preview', () => {
  const original = DEMO_VOICES[2]
  const c = style({ family: 'bell', characters: { hollow: 1 }, brightness: 0.5 })
  const p = { mix: 0, wild: 0.2 }

  it('mix 0 is the voice as it was', () => {
    expect(stylePreview(original, c, 5, p)).toEqual(original)
  })

  it('mix 1 is a new voice in the style; the way there gets closer step by step, and coming back goes back', () => {
    const full = stylePreview(original, c, 5, { ...p, mix: 1 })
    expect(full).toEqual(styleInit(c, 5, original, 0.4))
    const ds = [0, 0.25, 0.5, 0.75, 0.95].map((m) => distance(stylePreview(original, c, 5, { ...p, mix: m }), full))
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeLessThan(ds[i - 1])
    expect(stylePreview(original, c, 5, { ...p, mix: 0.4 })).toEqual(stylePreview(original, c, 5, { ...p, mix: 0.4 }))
  })

  it('wild: the first half widens the variation, the second half mutates on top, the same for the same seed', () => {
    expect(stylePreview(original, c, 5, { mix: 1, wild: 0.5 })).toEqual(styleInit(c, 5, original, 1))
    const m = stylePreview(original, c, 5, { mix: 1, wild: 1 })
    expect(distance(m, styleInit(c, 5, original, 1))).toBeGreaterThan(0)
    expect(stylePreview(original, c, 5, { mix: 1, wild: 1 })).toEqual(m)
    guard(m)
    expect(distance(stylePreview(original, c, 5, { mix: 0, wild: 1 }), original)).toBeGreaterThan(0) // mutation on my voice too
  })
})

describe('the play mode', () => {
  it('is the family’s own unless chosen, and a chosen one holds through morph and mutation', () => {
    expect(styleInit(style({ family: 'lead' }), 1).common[0x0d]).toBe(1)
    expect(styleInit(style({ family: 'lead', mode: 'poly' }), 1).common[0x0d]).toBe(0)
    expect(styleInit(style({ shape: 'pad', mode: 'legato' }), 1).common[0x0d]).toBe(2)
    const mine = DEMO_VOICES[0]
    for (const mix of [0, 0.3, 1]) expect(stylePreview(mine, style({ mode: 'legato' }), 4, { mix, wild: 1 }).common[0x0d]).toBe(2)
    expect(stylePreview(mine, style({ mode: 'mono' }), 4, { mix: 0, wild: 0 }).common.subarray(0x0e)).toEqual(mine.common.subarray(0x0e))
  })
})
