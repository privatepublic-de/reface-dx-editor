import { describe, expect, it } from 'vitest'
import { ALGORITHM_CC_VALUES, algorithmFromCc, ccLabel, ccToParameter, ccValueFor, FM_CCS } from '../src/params/cc'

describe('FM section CCs', () => {
  it('covers the 25 documented numbers', () => {
    expect(FM_CCS.map((c) => c.cc)).toEqual([80, 85, 86, 87, 88, 89, 90, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119])
  })

  it('reads each sent algorithm value as its algorithm, and the range edges', () => {
    expect(ALGORITHM_CC_VALUES.map(algorithmFromCc)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect([11, 12, 21, 22, 116, 117].map(algorithmFromCc)).toEqual([0, 1, 1, 2, 10, 11])
  })

  it('labels CCs for the log', () => {
    expect(ccLabel(104, 127)).toBe('OP2 feedback type → square')
    expect(ccLabel(80, 35)).toBe('Algorithm → 4')
    expect(ccLabel(64, 0)).toBe('sustain')
  })
})

describe('FM CCs to parameters', () => {
  it('maps received values as the Data List recognizes them', () => {
    expect(ccToParameter(80, 22)).toEqual({ address: [0x30, 0, 0x10], value: 2 })
    expect(ccToParameter(117, 63)).toEqual({ address: [0x31, 3, 0x15], value: 0 })
    expect(ccToParameter(89, 127)).toEqual({ address: [0x31, 0, 0x16], value: 31 })
    expect(ccToParameter(7, 100)).toBeNull()
    expect([ccValueFor('algorithm', 11), ccValueFor('feedbackType', 1), ccValueFor('fine', 42)]).toEqual([127, 127, 42])
  })
})
