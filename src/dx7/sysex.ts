// DX7 voices in .syx files, for Import .syx… (PLAN §8.6): the 1-voice message (VCED, 155 bytes) and the 32-voice
// bank (VMEM, 128 packed bytes a voice). Read only. Copied from the volca fm generator (src/dx7/sysex.ts, same
// author, MIT).
import { splitSysex } from '../sysex/messages'
import { OP_SIZE, sanitizeVoice, VC, VOICE_SIZE, type Voice } from './voice'

export const VMEM_VOICE_SIZE = 128
export const VMEM_SIZE = 32 * VMEM_VOICE_SIZE

/** The DX7 checksum: data + checksum ≡ 0 mod 128. */
export function checksum(data: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  return (128 - (sum & 0x7f)) & 0x7f
}

export function unpackVoice(p: ArrayLike<number>): Voice {
  const v = new Uint8Array(VOICE_SIZE)
  for (let i = 0; i < 6; i++) {
    const s = i * OP_SIZE
    const d = i * 17
    for (let k = 0; k < 11; k++) v[s + k] = p[d + k]
    v[s + 11] = p[d + 11] & 0x03
    v[s + 12] = (p[d + 11] >> 2) & 0x03
    v[s + 13] = p[d + 12] & 0x07
    v[s + 20] = (p[d + 12] >> 3) & 0x0f
    v[s + 14] = p[d + 13] & 0x03
    v[s + 15] = (p[d + 13] >> 2) & 0x07
    v[s + 16] = p[d + 14]
    v[s + 17] = p[d + 15] & 0x01
    v[s + 18] = (p[d + 15] >> 1) & 0x1f
    v[s + 19] = p[d + 16]
  }
  for (let k = 0; k < 9; k++) v[VC.pitchRate1 + k] = p[102 + k]
  v[VC.feedback] = p[111] & 0x07
  v[VC.oscKeySync] = (p[111] >> 3) & 0x01
  for (let k = 0; k < 4; k++) v[VC.lfoSpeed + k] = p[112 + k]
  v[VC.lfoSync] = p[116] & 0x01
  v[VC.lfoWave] = (p[116] >> 1) & 0x07
  v[VC.pitchModSens] = (p[116] >> 4) & 0x07
  v[VC.transpose] = p[117]
  for (let k = 0; k < 10; k++) v[VC.name + k] = p[118 + k]
  return sanitizeVoice(v)
}

export interface SyxVoice {
  voice: Voice
  /** where it came from: "voice 1", "bank 1 / 12" */
  source: string
}

export interface SyxContents {
  voices: SyxVoice[]
  /** what the reader noticed: checksums, operator bits, skipped messages */
  notes: string[]
}

/** The voices in a .syx file: 1-voice messages (with a checksum or the volca's operator bits) and 32-voice banks. */
export function readDx7Syx(bytes: ArrayLike<number>): SyxContents {
  const voices: SyxVoice[] = []
  const notes: string[] = []
  let single = 0
  let bank = 0
  for (const m of splitSysex(bytes)) {
    // not a DX7 bulk dump (a reface DX's blocks among them: those are read elsewhere)
    if (m[1] !== 0x43 || (m[2] & 0xf0) !== 0 || (m[3] !== 0x00 && m[3] !== 0x09)) continue
    const format = m[3]
    const data = m.subarray(6, m.length - 1)
    if (format === 0x00 && data.length >= VOICE_SIZE) {
      single++
      const voice = sanitizeVoice(data.subarray(0, VOICE_SIZE))
      const tail = data[VOICE_SIZE]
      if (tail === undefined) notes.push(`voice ${single}: no byte after the voice data`)
      else if (tail !== checksum(data.subarray(0, VOICE_SIZE)))
        notes.push(`voice ${single}: byte 155 is ${tail.toString(16).padStart(2, '0')}, not the checksum (volca operator bits?)`)
      voices.push({ voice, source: `voice ${single}` })
    } else if (format === 0x09 && data.length >= VMEM_SIZE) {
      bank++
      if (data[VMEM_SIZE] !== checksum(data.subarray(0, VMEM_SIZE))) notes.push(`bank ${bank}: checksum differs`)
      for (let i = 0; i < 32; i++) {
        voices.push({ voice: unpackVoice(data.subarray(i * VMEM_VOICE_SIZE, (i + 1) * VMEM_VOICE_SIZE)), source: `bank ${bank} / ${i + 1}` })
      }
    }
  }
  return { voices, notes }
}
