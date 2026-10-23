import { describe, expect, it } from 'vitest'
import { formatValue } from '../src/params/param'
import { COMMON_PARAMS } from '../src/params/common'
import { OPERATOR_PARAMS } from '../src/params/operator'
import { initVoice, RESET_OPERATOR } from '../src/params/init'
import { voiceName } from '../src/sysex/codec'

// The probe's listing of the voice after FUNCTION → Job → VOICE INIT on the DX, 2026-10-23 (FINDINGS Q14).
const COMMON_READ =
  'Transpose 0 · Part mode poly · Portamento 0 · PB range +2 · Algorithm 1 · LFO wave sine · LFO speed 64 · LFO delay 0 · LFO PMD 0 · Pitch EG rate 1 64 · Pitch EG rate 2 64 · Pitch EG rate 3 64 · Pitch EG rate 4 64 · Pitch EG level 1 0 · Pitch EG level 2 0 · Pitch EG level 3 0 · Pitch EG level 4 0 · Effect 1 type thru · Effect 1 param 1 64 · Effect 1 param 2 64 · Effect 2 type thru · Effect 2 param 1 64 · Effect 2 param 2 64'
const OP_READ = (level: number) =>
  `On on · EG rate 1 127 · EG rate 2 127 · EG rate 3 127 · EG rate 4 100 · EG level 1 127 · EG level 2 127 · EG level 3 127 · EG level 4 0 · Rate scaling 0 · KSC L depth 0 · KSC R depth 0 · KSC L curve -lin · KSC R curve +lin · LFO AMD 0 · LFO PMD on · Pitch EG on · Velocity sens 0 · Output level ${level} · Feedback level 0 · Feedback type saw · Freq mode ratio · Coarse 1 · Fine 0 · Detune 0`

describe('init voice', () => {
  it('is what VOICE INIT gives on the DX (Q14)', () => {
    const v = initVoice()
    expect(voiceName(v)).toBe('Init Voice')
    expect(COMMON_PARAMS.map((p) => `${p.label} ${formatValue(p, v.common[p.offset])}`).join(' · ')).toBe(COMMON_READ)
    v.ops.forEach((op, i) => {
      expect(OPERATOR_PARAMS.map((p) => `${p.label} ${formatValue(p, op[p.offset])}`).join(' · ')).toBe(OP_READ(i === 0 ? 100 : 0))
    })
  })

  it('resets a missing operator to a VOICE INIT operator at level 100, as Q7 showed', () => {
    expect(Array.from(initVoice().ops[0])).toEqual(RESET_OPERATOR)
  })
})
