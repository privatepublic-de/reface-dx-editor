// A Voice is 7 bulk blocks: header, Common (38 bytes), Operator 1–4 (28 each), footer (reface Data List p. 8).
import { COMMON_PARAMS, NAME_LENGTH } from '../params/common'
import { describeFrequency } from '../params/display'
import { OPERATOR_PARAMS } from '../params/operator'
import { formatValue } from '../params/param'
import { ADDRESS, bulkBlock, parseSysex, sameAddress, SIZE, splitSysex, type Address, type DxSysex } from './messages'

export interface Voice {
  common: Uint8Array
  ops: [Uint8Array, Uint8Array, Uint8Array, Uint8Array]
}

/** 13 + 51 + 4 × 41 + 13: one Voice as the DX sends it. */
export const VOICE_BYTES = 241

export const cloneVoice = (v: Voice): Voice => ({ common: v.common.slice(), ops: v.ops.map((o) => o.slice()) as Voice['ops'] })

export function voiceToMessages(device: number, v: Voice): Uint8Array[] {
  return [
    bulkBlock(device, ADDRESS.bulkHeader, []),
    bulkBlock(device, ADDRESS.common, v.common),
    ...v.ops.map((op, i) => bulkBlock(device, ADDRESS.operator(i), op)),
    bulkBlock(device, ADDRESS.bulkFooter, []),
  ]
}

export function voiceToBytes(device: number, v: Voice): Uint8Array {
  const parts = voiceToMessages(device, v)
  const out = new Uint8Array(parts.reduce((n, m) => n + m.length, 0))
  parts.reduce((o, m) => (out.set(m, o), o + m.length), 0)
  return out
}

type Bulk = Extract<DxSysex, { kind: 'bulk' }>

/** Collects bulk blocks into Voices: a Voice is complete at the footer, if the Common and all 4 operators came
 *  after the header with good checksums. `problems` lists what was dropped. */
export class VoiceAssembler {
  private common: Uint8Array | null = null
  private ops: (Uint8Array | null)[] = [null, null, null, null]
  private open = false
  readonly problems: string[] = []

  /** Feeds one parsed bulk block; returns a Voice when its footer completes it. */
  add(b: Bulk): Voice | null {
    if (!b.checksumOk) this.problems.push(`checksum error in block ${b.address.join(' ')}`)
    if (sameAddress(b.address, ADDRESS.bulkHeader)) {
      if (this.open) this.problems.push('header before the previous footer')
      this.common = null
      this.ops = [null, null, null, null]
      this.open = true
      return null
    }
    if (sameAddress(b.address, ADDRESS.bulkFooter)) {
      const wasOpen = this.open
      this.open = false
      if (!wasOpen) {
        this.problems.push('footer without a header')
        return null
      }
      const missing = [this.common ? null : 'Common', ...this.ops.map((o, i) => (o ? null : `OP${i + 1}`))].filter(Boolean)
      if (missing.length) {
        this.problems.push(`voice without ${missing.join(', ')}`)
        return null
      }
      return { common: this.common!, ops: this.ops as Voice['ops'] }
    }
    if (!b.checksumOk) return null
    if (sameAddress(b.address, ADDRESS.common) && b.data.length === SIZE.common) this.common = b.data
    else if (b.address[0] === 0x31 && b.address[1] < 4 && b.address[2] === 0 && b.data.length === SIZE.operator) this.ops[b.address[1]] = b.data
    else if (!sameAddress(b.address, ADDRESS.system)) this.problems.push(`unexpected block ${b.address.join(' ')} (${b.data.length} B)`)
    return null
  }
}

/** All Voices in a byte stream (a .syx file: one Voice, or any number back to back). */
export function voicesFromBytes(bytes: ArrayLike<number>): { voices: Voice[]; problems: string[] } {
  const asm = new VoiceAssembler()
  const voices: Voice[] = []
  for (const m of splitSysex(bytes)) {
    const s = parseSysex(m)
    if (s?.kind !== 'bulk') continue
    const v = asm.add(s)
    if (v) voices.push(v)
  }
  return { voices, problems: asm.problems }
}

export const voiceName = (v: Voice) => String.fromCharCode(...v.common.subarray(0, NAME_LENGTH)).trimEnd()

export function setVoiceName(v: Voice, name: string) {
  const text = name.padEnd(NAME_LENGTH).slice(0, NAME_LENGTH)
  for (let i = 0; i < NAME_LENGTH; i++) {
    const c = text.charCodeAt(i)
    v.common[i] = c >= 0x20 && c <= 0x7e ? c : 0x20
  }
}

export function formatVoice(v: Voice): string {
  const common = COMMON_PARAMS.map((p) => `${p.label} ${formatValue(p, v.common[p.offset])}`).join(' · ')
  const ops = v.ops.map((op, i) => {
    const values = OPERATOR_PARAMS.map((p) => `${p.label} ${formatValue(p, op[p.offset])}`).join(' · ')
    return `   OP${i + 1}: ${op[0x15] ? 'fixed' : 'ratio'} ${describeFrequency(op[0x15], op[0x16], op[0x17])}\n      ${values}`
  })
  return [`   "${voiceName(v)}"  ${common}`, ...ops].join('\n')
}

/** One line per value that differs, "Common Transpose: 0 → +2". Reserved bytes are compared too. */
export function diffVoices(a: Voice, b: Voice): string[] {
  const out: string[] = []
  const nameA = voiceName(a)
  const nameB = voiceName(b)
  if (nameA !== nameB) out.push(`Name: "${nameA}" → "${nameB}"`)
  for (let i = NAME_LENGTH; i < SIZE.common; i++) {
    if (a.common[i] === b.common[i]) continue
    const p = COMMON_PARAMS.find((q) => q.offset === i)
    out.push(p ? `${p.label}: ${formatValue(p, a.common[i])} → ${formatValue(p, b.common[i])}` : `Common byte 0x${i.toString(16)}: ${a.common[i]} → ${b.common[i]}`)
  }
  a.ops.forEach((op, n) => {
    for (let i = 0; i < SIZE.operator; i++) {
      if (op[i] === b.ops[n][i]) continue
      const p = OPERATOR_PARAMS.find((q) => q.offset === i)
      out.push(`OP${n + 1} ${p ? `${p.label}: ${formatValue(p, op[i])} → ${formatValue(p, b.ops[n][i])}` : `byte 0x${i.toString(16)}: ${op[i]} → ${b.ops[n][i]}`}`)
    }
  })
  return out
}

/** Program Change number 0–31 as the DX shows it: Bank 1-1 … 4-8. */
export const locationName = (program: number) => `${Math.floor(program / 8) + 1}-${(program % 8) + 1}`

// ---- single parameters (what a Parameter Change or Parameter Request addresses) ----

/** The block an address points into (Common or an operator), or null for SYSTEM and anything else. */
function blockAt(v: Voice, a: Address): Uint8Array | null {
  if (a[0] === 0x30 && a[1] === 0x00) return v.common
  if (a[0] === 0x31 && a[1] < 4) return v.ops[a[1]]
  return null
}

export const voiceValueAt = (v: Voice, a: Address): number | undefined => {
  const block = blockAt(v, a)
  return block && a[2] < block.length ? block[a[2]] : undefined
}

/** Writes `data` from the address on (several bytes for the name); false if the address isn't in a voice. */
export function setVoiceValues(v: Voice, a: Address, data: ArrayLike<number>): boolean {
  const block = blockAt(v, a)
  if (!block || a[2] + data.length > block.length) return false
  for (let i = 0; i < data.length; i++) block[a[2] + i] = data[i] & 0x7f
  return true
}

/** Values outside their documented range, and name characters outside ASCII 32–126: what an import flags. */
export function voiceProblems(v: Voice): string[] {
  const out: string[] = []
  for (let i = 0; i < NAME_LENGTH; i++) {
    if (v.common[i] < 0x20 || v.common[i] > 0x7e) out.push(`Name char ${i + 1}: ${v.common[i]}`)
  }
  for (const p of COMMON_PARAMS) if (v.common[p.offset] < p.min || v.common[p.offset] > p.max) out.push(`${p.label}: ${v.common[p.offset]}`)
  v.ops.forEach((op, n) => {
    for (const p of OPERATOR_PARAMS) if (op[p.offset] < p.min || op[p.offset] > p.max) out.push(`OP${n + 1} ${p.label}: ${op[p.offset]}`)
  })
  return out
}

/** What turns voice `from` into `to`, as Parameter Change addresses and data: the name as one 10-byte change,
 *  everything else byte by byte. For undo/redo and anything else live: never a bulk (FINDINGS Q7). */
export function voiceChanges(from: Voice, to: Voice): [Address, number[]][] {
  const out: [Address, number[]][] = []
  if (from.common.subarray(0, NAME_LENGTH).some((b, i) => b !== to.common[i])) out.push([[0x30, 0x00, 0x00], Array.from(to.common.subarray(0, NAME_LENGTH))])
  for (let i = NAME_LENGTH; i < SIZE.common; i++) if (from.common[i] !== to.common[i]) out.push([[0x30, 0x00, i], [to.common[i]]])
  from.ops.forEach((op, n) => {
    for (let i = 0; i < SIZE.operator; i++) if (op[i] !== to.ops[n][i]) out.push([[0x31, n, i], [to.ops[n][i]]])
  })
  return out
}
