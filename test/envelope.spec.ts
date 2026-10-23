import { describe, expect, it } from 'vitest'
import { ALGORITHMS } from '../src/params/algorithms'
import { egOffset, linkedEgChanges, sameRole } from '../src/params/envelope'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'

/** A voice with this algorithm and the given L2 and R2 per operator. */
function voice(algorithm: number, l2: number[], r2: number[]): Voice {
  const v = cloneVoice(initVoice())
  v.common[0x10] = algorithm
  v.ops.forEach((op, i) => {
    op[egOffset('level', 1)] = l2[i]
    op[egOffset('rate', 1)] = r2[i]
  })
  return v
}

const values = (changes: ReturnType<typeof linkedEgChanges>) => Object.fromEntries(changes.map(([a, d]) => [a[1], d[0]]))

describe('linked envelopes', () => {
  it('picks the operators with the same role, for all 12 algorithms', () => {
    ALGORITHMS.forEach((a, alg) => {
      for (let op = 0; op < 4; op++) {
        const role = a.carriers.includes(op)
        expect(sameRole(alg, op).every((o) => o !== op && a.carriers.includes(o) === role)).toBe(true)
        expect(sameRole(alg, op)).toHaveLength([0, 1, 2, 3].filter((o) => a.carriers.includes(o) === role).length - 1)
      }
    })
    // algorithm 8: carriers 1 and 3, modulators 2 and 4
    expect(sameRole(7, 0)).toEqual([2])
    expect(sameRole(7, 3)).toEqual([1])
  })

  it('scales levels by the ratio, so the balance stays', () => {
    const v = voice(11, [90, 120, 60, 30], [50, 50, 50, 50])
    expect(values(linkedEgChanges(v, 0, 'level', 1, 60))).toEqual({ 1: 80, 2: 40, 3: 20 })
  })

  it('moves rates by the delta', () => {
    const v = voice(11, [90, 90, 90, 90], [50, 70, 20, 120])
    expect(values(linkedEgChanges(v, 0, 'rate', 1, 60))).toEqual({ 1: 80, 2: 30, 3: 127 })
  })

  it('follows a level dragged up from 0 by the delta', () => {
    const v = voice(11, [0, 10, 50, 127], [50, 50, 50, 50])
    expect(values(linkedEgChanges(v, 0, 'level', 1, 20))).toEqual({ 1: 30, 2: 70, 3: 127 })
  })

  it('clamps each operator on its own and restores it on the way back (always from the start)', () => {
    const v = voice(11, [100, 120, 60, 10], [50, 50, 50, 50])
    expect(values(linkedEgChanges(v, 0, 'level', 1, 127))).toEqual({ 1: 127, 2: 76, 3: 13 })
    expect(values(linkedEgChanges(v, 0, 'level', 1, 100))).toEqual({ 1: 120, 2: 60, 3: 10 })
  })

  it('changes nobody when the operator has no partner in its role', () => {
    const v = voice(0, [90, 90, 90, 90], [50, 50, 50, 50]) // algorithm 1: OP1 is the only carrier
    expect(linkedEgChanges(v, 0, 'level', 1, 10)).toEqual([])
    expect(values(linkedEgChanges(v, 1, 'level', 1, 45))).toEqual({ 2: 45, 3: 45 })
  })
})
