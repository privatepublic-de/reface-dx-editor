import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initVoice } from '../src/params/init'
import {
  cloneVoice, diffVoices, locationName, setVoiceName, setVoiceValues, VOICE_BYTES, voiceName, voiceProblems, voicesFromBytes, voiceToBytes, voiceToMessages,
  voiceValueAt,
} from '../src/sysex/codec'
import { parseSysex } from '../src/sysex/messages'

describe('voice codec', () => {
  it('sends a voice as 7 blocks, 241 bytes', () => {
    const msgs = voiceToMessages(0, initVoice())
    expect(msgs.map((m) => m.length)).toEqual([13, 51, 41, 41, 41, 41, 13])
    expect(voiceToBytes(0, initVoice()).length).toBe(VOICE_BYTES)
    expect(msgs.every((m) => parseSysex(m)?.kind === 'bulk')).toBe(true)
  })

  it('reads back what it wrote, several voices in a row', () => {
    const a = initVoice()
    const b = cloneVoice(a)
    setVoiceName(b, 'Second')
    b.ops[2][0x12] = 99
    const bytes = new Uint8Array([...voiceToBytes(0, a), ...voiceToBytes(0, b)])
    const { voices, problems } = voicesFromBytes(bytes)
    expect(problems).toEqual([])
    expect(voices).toEqual([a, b])
    expect(voiceName(voices[1])).toBe('Second')
  })

  it('drops a voice with a bad block and says why', () => {
    const bytes = voiceToBytes(0, initVoice())
    bytes[13 + 51 + 20] ^= 1 // a data byte of OP1
    const { voices, problems } = voicesFromBytes(bytes)
    expect(voices).toEqual([])
    expect(problems).toEqual(['checksum error in block 49 0 0', 'voice without OP1'])
  })

  it('lists differences by parameter name', () => {
    const a = initVoice()
    const b = cloneVoice(a)
    b.common[0x0c] = 0x42
    b.ops[1][0x18] = 60
    setVoiceName(b, 'Changed')
    expect(diffVoices(a, b)).toEqual(['Name: "Init Voice" → "Changed"', 'Transpose: 0 → +2', 'OP2 Detune: 0 → -4'])
  })

  it('names Program Changes as the DX does', () => {
    expect([0, 7, 8, 31].map(locationName)).toEqual(['1-1', '1-8', '2-1', '4-8'])
  })
})

// .syx files in local/ (gitignored: the RDX emulator's dump has no license, and captures of a user's DX are
// theirs): each must parse without problems, stay in range, and be written back byte for byte.
const LOCAL = new URL('../local/', import.meta.url)
const LOCAL_FILES = existsSync(LOCAL) ? readdirSync(LOCAL).filter((f) => f.endsWith('.syx')) : []
describe.skipIf(!LOCAL_FILES.length)('local .syx files', () => {
  it.each(LOCAL_FILES)('%s round-trips', (file) => {
    const bytes = readFileSync(new URL(file, LOCAL))
    const { voices, problems } = voicesFromBytes(bytes)
    expect(problems).toEqual([])
    expect(voices.length * VOICE_BYTES).toBe(bytes.length)
    expect(voices.flatMap(voiceProblems)).toEqual([])
    expect(new Uint8Array(voices.flatMap((v) => [...voiceToBytes(0, v)]))).toEqual(new Uint8Array(bytes))
  })

  it('reserved bytes: all 0? (printed, not asserted)', () => {
    const odd = LOCAL_FILES.flatMap((file) =>
      voicesFromBytes(readFileSync(new URL(file, LOCAL))).voices.flatMap((v, i) => [
        ...[0x0a, 0x0b, 0x23, 0x24, 0x25].filter((o) => v.common[o]).map((o) => `${file} ${i + 1} Common 0x${o.toString(16)} = ${v.common[o]}`),
        ...v.ops.flatMap((op, n) => [0x19, 0x1a, 0x1b].filter((o) => op[o]).map((o) => `${file} ${i + 1} OP${n + 1} 0x${o.toString(16)} = ${op[o]}`)),
      ]),
    )
    console.log(odd.length ? `non-zero reserved bytes:\n${odd.join('\n')}` : `reserved bytes all 0 in ${LOCAL_FILES.join(', ')}`)
  })
})

describe('single parameters and validation', () => {
  it('reads and writes by Parameter Change address, the name as several bytes', () => {
    const v = initVoice()
    expect(setVoiceValues(v, [0x31, 2, 0x12], [77])).toBe(true)
    expect(voiceValueAt(v, [0x31, 2, 0x12])).toBe(77)
    expect(setVoiceValues(v, [0x30, 0, 0], Array.from('Hello', (c) => c.charCodeAt(0)))).toBe(true)
    expect(voiceName(v)).toBe('HelloVoice')
    expect(setVoiceValues(v, [0x31, 4, 0], [1])).toBe(false)
    expect(setVoiceValues(v, [0x31, 0, 27], [1, 2])).toBe(false)
    expect(voiceValueAt(v, [0x00, 0x00, 0x0e])).toBeUndefined()
  })

  it('flags out-of-range values and odd name characters', () => {
    const v = initVoice()
    expect(voiceProblems(v)).toEqual([])
    v.common[0x10] = 12
    v.common[3] = 0x7f
    v.ops[1][0x17] = 100
    expect(voiceProblems(v)).toEqual(['Name char 4: 127', 'Algorithm: 12', 'OP2 Fine: 100'])
  })
})
