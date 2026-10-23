import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initVoice } from '../src/params/init'
import {
  cloneVoice, diffVoices, locationName, setVoiceName, setVoiceValues, VOICE_BYTES, voiceName, voiceProblems, voicesFromBytes, voiceToBytes, voiceToMessages,
  voiceValueAt, type Voice,
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

// A 32-voice dump from the RDX emulator repo (no license, so not committed): put it at local/RefaceDX.syx
// to check the parser against bytes that came from a real DX at some point.
const LOCAL_DUMP = new URL('../local/RefaceDX.syx', import.meta.url)
describe.skipIf(!existsSync(LOCAL_DUMP))('local 32-voice dump', () => {
  it('parses into 32 voices and writes them back byte for byte', () => {
    const bytes = readFileSync(LOCAL_DUMP)
    expect(bytes.length).toBe(32 * VOICE_BYTES)
    const { voices, problems } = voicesFromBytes(bytes)
    expect(problems).toEqual([])
    expect(voices).toHaveLength(32)
    const again = new Uint8Array(voices.flatMap((v) => [...voiceToBytes(0, v)]))
    expect(again).toEqual(new Uint8Array(bytes))
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
