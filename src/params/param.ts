/** One byte of a block (reface Data List pp. 8–9). `min`/`max` are raw byte values. */
export interface Param {
  offset: number
  key: string
  label: string
  min: number
  max: number
  /** Raw value shown as 0 (offset-binary values: transpose, pitch EG levels, detune). */
  center?: number
  /** Names of the raw values min…max. */
  labels?: readonly string[]
  /** How the DX shows it, when neither `center` nor `labels` says. */
  format?: (raw: number) => string
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export function formatValue(p: Param, raw: number): string {
  if (p.format) return p.format(raw)
  if (p.labels) return p.labels[raw - p.min] ?? `? (${raw})`
  if (p.center !== undefined) return signed(raw - p.center)
  return String(raw)
}

export const OFF_ON = ['off', 'on'] as const
