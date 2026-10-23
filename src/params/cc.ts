// Control Changes of the FM section, sent and received only with MIDI Control on (reface Data List p. 8).

export interface FmCc {
  cc: number
  /** 0–3 for OP1–OP4; undefined for the algorithm. */
  op?: number
  key: 'algorithm' | 'level' | 'feedback' | 'feedbackType' | 'freqMode' | 'coarse' | 'fine'
  label: string
}

const OP_FIRST_CC = [85, 102, 108, 114]
const OP_KEYS = [
  ['level', 'level'],
  ['feedback', 'feedback level'],
  ['feedbackType', 'feedback type'],
  ['freqMode', 'freq mode'],
  ['coarse', 'coarse'],
  ['fine', 'fine'],
] as const

export const FM_CCS: readonly FmCc[] = [
  { cc: 80, key: 'algorithm', label: 'Algorithm' },
  ...OP_FIRST_CC.flatMap((first, op) => OP_KEYS.map(([key, name], i) => ({ cc: first + i, op, key, label: `OP${op + 1} ${name}` }))),
]

/** Values the DX sends for algorithms 1–12; it receives each as a range (0–11 → 1, 12–21 → 2, …). */
export const ALGORITHM_CC_VALUES = [0, 12, 23, 35, 46, 58, 69, 81, 92, 104, 115, 127] as const
const ALGORITHM_CC_LOWEST = [0, 12, 22, 33, 43, 54, 65, 75, 86, 96, 107, 117] as const

/** Algorithm 0–11 for a received CC 80 value. */
export const algorithmFromCc = (v: number) => ALGORITHM_CC_LOWEST.filter((low) => v >= low).length - 1

const OTHER_CCS: Record<number, string> = { 1: 'mod wheel', 7: 'volume', 11: 'expression', 64: 'sustain', 120: 'all sound off', 121: 'reset all controllers', 123: 'all notes off' }

export function ccLabel(cc: number, value: number): string {
  const fm = FM_CCS.find((c) => c.cc === cc)
  if (!fm) return OTHER_CCS[cc] ?? ''
  if (fm.key === 'algorithm') return `${fm.label} → ${algorithmFromCc(value) + 1}`
  if (fm.key === 'feedbackType') return `${fm.label} → ${value < 64 ? 'saw' : 'square'}`
  if (fm.key === 'freqMode') return `${fm.label} → ${value < 64 ? 'ratio' : 'fixed'}`
  return fm.label
}

/** Operator byte offsets of the FM-section keys. */
const OP_OFFSET = { level: 0x12, feedback: 0x13, feedbackType: 0x14, freqMode: 0x15, coarse: 0x16, fine: 0x17 } as const

/** The Parameter Change address an FM-section control edits. */
export const fmAddress = (key: FmCc['key'], op?: number): [number, number, number] =>
  key === 'algorithm' ? [0x30, 0x00, 0x10] : [0x31, op!, OP_OFFSET[key]]

const OP_MAX = { level: 127, feedback: 127, feedbackType: 1, freqMode: 1, coarse: 31, fine: 99 } as const

/** What a received FM CC changes, as the Data List's "recognized" column reads (documented, not probed:
 *  Q5 only checked what the DX sends). Address as for a Parameter Change. */
export function ccToParameter(cc: number, value: number): { address: [number, number, number]; value: number } | null {
  const fm = FM_CCS.find((c) => c.cc === cc)
  if (!fm) return null
  if (fm.key === 'algorithm') return { address: fmAddress('algorithm'), value: algorithmFromCc(value) }
  const raw = fm.key === 'feedbackType' || fm.key === 'freqMode' ? (value < 64 ? 0 : 1) : Math.min(value, OP_MAX[fm.key])
  return { address: fmAddress(fm.key, fm.op), value: raw }
}

/** The CC value the DX sends for a raw parameter value (FINDINGS Q5: algorithms as ALGORITHM_CC_VALUES, switches 0/127). */
export function ccValueFor(key: FmCc['key'], raw: number): number {
  if (key === 'algorithm') return ALGORITHM_CC_VALUES[raw]
  if (key === 'feedbackType' || key === 'freqMode') return raw ? 127 : 0
  return raw
}

export const ccFor = (key: FmCc['key'], op?: number) => FM_CCS.find((c) => c.key === key && c.op === op)!.cc
