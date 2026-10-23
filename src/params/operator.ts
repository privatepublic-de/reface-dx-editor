// VOICE Operator, address 31 op xx (op 0–3 = OP1–OP4), 28 bytes (reface Data List p. 9).
import { OFF_ON, type Param } from './param'

export const KSC_CURVES = ['-lin', '-exp', '+exp', '+lin'] as const

const rate = (n: number): Param => ({ offset: n, key: `egRate${n}`, label: `EG rate ${n}`, min: 0, max: 127 })
const level = (n: number): Param => ({ offset: 4 + n, key: `egLevel${n}`, label: `EG level ${n}`, min: 0, max: 127 })

export const OPERATOR_PARAMS: readonly Param[] = [
  { offset: 0x00, key: 'on', label: 'On', min: 0, max: 1, labels: OFF_ON },
  rate(1), rate(2), rate(3), rate(4),
  level(1), level(2), level(3), level(4),
  { offset: 0x09, key: 'rateScaling', label: 'Rate scaling', min: 0, max: 127 },
  { offset: 0x0a, key: 'kscLeftDepth', label: 'KSC L depth', min: 0, max: 127 },
  { offset: 0x0b, key: 'kscRightDepth', label: 'KSC R depth', min: 0, max: 127 },
  { offset: 0x0c, key: 'kscLeftCurve', label: 'KSC L curve', min: 0, max: 3, labels: KSC_CURVES },
  { offset: 0x0d, key: 'kscRightCurve', label: 'KSC R curve', min: 0, max: 3, labels: KSC_CURVES },
  { offset: 0x0e, key: 'lfoAmd', label: 'LFO AMD', min: 0, max: 127 },
  { offset: 0x0f, key: 'lfoPmd', label: 'LFO PMD', min: 0, max: 1, labels: OFF_ON },
  { offset: 0x10, key: 'peg', label: 'Pitch EG', min: 0, max: 1, labels: OFF_ON },
  { offset: 0x11, key: 'velocity', label: 'Velocity sens', min: 0, max: 127 },
  { offset: 0x12, key: 'level', label: 'Output level', min: 0, max: 127 },
  { offset: 0x13, key: 'feedback', label: 'Feedback level', min: 0, max: 127 },
  { offset: 0x14, key: 'feedbackType', label: 'Feedback type', min: 0, max: 1, labels: ['saw', 'square'] },
  { offset: 0x15, key: 'freqMode', label: 'Freq mode', min: 0, max: 1, labels: ['ratio', 'fixed'] },
  { offset: 0x16, key: 'coarse', label: 'Coarse', min: 0, max: 31 },
  { offset: 0x17, key: 'fine', label: 'Fine', min: 0, max: 99 },
  { offset: 0x18, key: 'detune', label: 'Detune', min: 0, max: 127, center: 64 },
]

export const operatorParam = (key: string) => OPERATOR_PARAMS.find((p) => p.key === key)!

/** Keyboard scaling as the DX's screen shows one side (Reference Manual p. 4): a Depth −127…+127 and a curve
 *  LIN or EXP. The data keeps the depth as 0–127 and the sign in the curve byte (−LIN, −EXP, +EXP, +LIN). */
export interface KscSide {
  depth: number
  exp: boolean
}

export function kscSide(depth: number, curve: number): KscSide {
  const negative = curve <= 1
  return { depth: negative ? -depth : depth, exp: curve === 1 || curve === 2 }
}

/** [depth byte, curve byte] for a side. Depth 0 keeps the sign the curve had, so turning through zero and back
 *  doesn't flip it. */
export function kscBytes(side: KscSide, previousCurve: number): [number, number] {
  const negative = side.depth < 0 || (side.depth === 0 && previousCurve <= 1)
  return [Math.abs(side.depth), negative ? (side.exp ? 1 : 0) : side.exp ? 2 : 3]
}
