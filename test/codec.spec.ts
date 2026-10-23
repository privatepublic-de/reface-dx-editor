import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cloneVoice, diffVoices, locationName, setVoiceName, VOICE_BYTES, voiceName, voicesFromBytes, voiceToBytes, voiceToMessages, type Voice } from '../src/sysex/codec'
import { parseSysex } from '../src/sysex/messages'

/** Roughly the DX's VOICE INIT: OP1 a sine carrier, the others silent. */
function initVoice(): Voice {
  const common = new Uint8Array(38)
  setVoiceName({ common, ops: [] as unknown as Voice['ops'] }, 'Init Voice')
  common.set([0x40, 0, 0, 0x42, 0], 0x0c)
  common.set([0x40, 0x40, 0x40, 0x40], 0x19)
  const op = (level: number) => Uint8Array.from([1, 127, 127, 127, 127, 127, 127, 127, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, level, 0, 0, 0, 1, 0, 64, 0, 0, 0])
  return { common, ops: [op(127), op(0), op(0), op(0)] }
}

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
