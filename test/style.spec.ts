import { describe, expect, it } from 'vitest'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { fixedBytes, fixedHzOf, ratioBytes, ratioOf } from '../src/params/display'
import { rng } from '../src/style/random'
import { blend } from '../src/style/style'
import { rolesOf } from '../src/style/transforms'
import { diffVoices, voiceName, voiceProblems, type Voice } from '../src/sysex/codec'

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

describe('Mix and Wild', () => {
  it('blend: 0 changes nothing, 1 lands on the target, and blending again converges', () => {
    const [v, target] = [DEMO_VOICES[0], DEMO_VOICES[2]]
    expect(blend(v, target, 0, rng(1))).toEqual(v)
    expect(distance(blend(v, target, 1, rng(1)), target)).toBe(0)
    let w = v
    const distances = [distance(w, target)]
    for (let i = 0; i < 6; i++) {
      w = blend(w, target, 0.4, rng(100 + i))
      distances.push(distance(w, target))
    }
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThan(distances[i - 1])
    expect(distances.at(-1)!).toBeLessThan(distances[0] / 10)
  })
})
