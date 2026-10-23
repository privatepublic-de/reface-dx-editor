import { describe, expect, it } from 'vitest'
import { commonParam } from '../src/params/common'
import { operatorParam } from '../src/params/operator'
import { formatValue, parseValue } from '../src/params/param'

describe('typing a value', () => {
  it('reads what formatValue shows, clamped to the range', () => {
    expect(parseValue(commonParam('transpose'), '-12')).toBe(0x40 - 12)
    expect(parseValue(commonParam('transpose'), '+30')).toBe(0x58)
    expect(parseValue(commonParam('algorithm'), '12')).toBe(11)
    expect(parseValue(commonParam('lfoWave'), 'Saw Up')).toBe(2)
    expect(parseValue(operatorParam('detune'), '−5')).toBe(59)
    expect(parseValue(operatorParam('level'), '99')).toBe(99)
    expect(parseValue(operatorParam('level'), 'loud')).toBeNull()
  })

  it('round-trips every value of every param', () => {
    for (const p of [commonParam('transpose'), commonParam('algorithm'), commonParam('pegLevel1'), operatorParam('detune'), operatorParam('kscLeftCurve'), operatorParam('fine')]) {
      for (let v = p.min; v <= p.max; v++) expect(parseValue(p, formatValue(p, v))).toBe(v)
    }
  })
})

describe('a param with its own parser', () => {
  it('reads "64 sq" as square (negative), and a plain number keeps the side it had', () => {
    const fb = { offset: 0, key: 'fb', label: 'Feedback', min: -127, max: 127, center: 0, parse: (t: string, current: number) => (/sq/.test(t) || (!/saw/.test(t) && current < 0) ? -1 : 1) * Math.abs(Number.parseFloat(t)) }
    expect(parseValue(fb, '64 sq', 10)).toBe(-64)
    expect(parseValue(fb, '200 saw', -10)).toBe(127)
    expect(parseValue(fb, '30', -70)).toBe(-30)
  })
})
