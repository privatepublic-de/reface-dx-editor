/** One byte of a block (reface Data List pp. 8–9). `min`/`max` are raw byte values. */
export interface Param {
  offset: number
  key: string
  label: string
  min: number
  max: number
  /** Raw value shown as 0 (offset-binary values: transpose, pitch EG levels, detune). */
  center?: number
  /** Shown as raw + base (the algorithm: raw 0–11 is ALGO 1–12). */
  base?: number
  /** Names of the raw values min…max. */
  labels?: readonly string[]
  /** How the DX shows it, when neither `center` nor `labels` says. */
  format?: (raw: number) => string
  /** Reads a typed value back, when `format` shows more (or less) than the number; gets the value before. */
  parse?: (text: string, current: number) => number | null
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export function formatValue(p: Param, raw: number): string {
  if (p.format) return p.format(raw)
  if (p.labels) return p.labels[raw - p.min] ?? `? (${raw})`
  if (p.center !== undefined) return signed(raw - p.center)
  return String(raw + (p.base ?? 0))
}

export const OFF_ON = ['off', 'on'] as const

/** A typed value back to the raw byte, in the units `formatValue` shows; null if it doesn't read. */
export function parseValue(p: Param, text: string, current = p.min): number | null {
  const t = text.trim().replace('−', '-')
  if (p.parse) {
    const v = p.parse(t, current)
    return v === null ? null : Math.max(p.min, Math.min(p.max, v))
  }
  if (p.labels) {
    const i = p.labels.findIndex((l) => l.toLowerCase() === t.toLowerCase())
    if (i >= 0) return p.min + i
  }
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n)) return null
  const raw = Math.round(n) + (p.center ?? 0) - (p.base ?? 0)
  return Math.max(p.min, Math.min(p.max, raw))
}
