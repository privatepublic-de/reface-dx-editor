import { describe, expect, it } from 'vitest'
import { kscBytes, kscSide } from '../src/params/operator'

describe('keyboard scaling as the DX shows it', () => {
  it('reads the four curve bytes as sign and shape', () => {
    expect([0, 1, 2, 3].map((c) => kscSide(40, c))).toEqual([
      { depth: -40, exp: false },
      { depth: -40, exp: true },
      { depth: 40, exp: true },
      { depth: 40, exp: false },
    ])
  })

  it('writes them back, and depth 0 keeps the sign', () => {
    for (let c = 0; c < 4; c++) for (const d of [0, 1, 127]) expect(kscBytes(kscSide(d, c), c)).toEqual([d, c])
    expect(kscBytes({ depth: -5, exp: false }, 3)).toEqual([5, 0])
    expect(kscBytes({ depth: 0, exp: true }, 0)).toEqual([0, 1])
    expect(kscBytes({ depth: 0, exp: true }, 3)).toEqual([0, 2])
  })
})
