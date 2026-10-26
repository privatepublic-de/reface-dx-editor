import { describe, expect, it } from 'vitest'
import { convert, dxPrints, score } from '../src/dx7/convert'
import { importDx7Voice } from '../src/dx7/import'
import { checksum, readDx7Syx, VMEM_SIZE, VMEM_VOICE_SIZE } from '../src/dx7/sysex'
import { initVoice as dx7Init, OP, opBase, setVoiceName, VC, type Voice as DxVoice } from '../src/dx7/voice'
import { exportSyx } from '../src/library/library'
import { initVoice } from '../src/params/init'
import { voiceName, voiceProblems } from '../src/sysex/codec'
import { loudness, TARGET_DB } from '../src/wheel/loudness'

/** A DX7 e-piano in the classic way: a bright tine pair (14 : 1) beside a 1 : 1 body pair, algorithm 5. */
function epiano(): DxVoice {
  const v = dx7Init()
  v[VC.algorithm] = 4
  const set = (n: number, values: Partial<Record<keyof typeof OP, number>>) => {
    for (const [k, x] of Object.entries(values)) v[opBase(n) + OP[k as keyof typeof OP]] = x
  }
  set(1, { outputLevel: 99, rate1: 96, rate2: 25, rate3: 25, rate4: 67, level3: 0, level4: 0 })
  set(2, { outputLevel: 58, coarse: 14, rate1: 95, rate2: 50, rate3: 35, rate4: 78, level3: 0, level4: 0 })
  set(3, { outputLevel: 99, rate1: 95, rate2: 20, rate3: 20, rate4: 50, level3: 0, level4: 0 })
  set(4, { outputLevel: 85, rate1: 95, rate2: 29, rate3: 20, rate4: 50, level3: 0, level4: 0 })
  setVoiceName(v, 'TEST EP')
  return v
}

describe('DX7 .syx files', () => {
  it('reads a 1-voice message', () => {
    const v = epiano()
    const bytes = Uint8Array.from([0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b, ...v, checksum(v), 0xf7])
    const { voices, notes } = readDx7Syx(bytes)
    expect(notes).toEqual([])
    expect(voices.map((x) => [...x.voice])).toEqual([[...v]])
  })

  it('reads a 32-voice bank: names, and a checksum that differs is noted', () => {
    const data = new Uint8Array(VMEM_SIZE)
    for (let i = 0; i < 32; i++) {
      const name = `VOICE ${i + 1}`.padEnd(10)
      for (let k = 0; k < 10; k++) data[i * VMEM_VOICE_SIZE + 118 + k] = name.charCodeAt(k)
    }
    const bank = Uint8Array.from([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00, ...data, checksum(data), 0xf7])
    const read = readDx7Syx(bank)
    expect(read.voices).toHaveLength(32)
    expect(read.voices[11].source).toBe('bank 1 / 12')
    expect(read.notes).toEqual([])
    bank[bank.length - 2] ^= 1
    expect(readDx7Syx(bank).notes).toEqual(['bank 1: checksum differs'])
  })

  it('a reface DX file holds no DX7 voices', () => {
    expect(readDx7Syx(exportSyx([initVoice(), initVoice()])).voices).toEqual([])
  })
})

describe('importing a DX7 voice', () => {
  it('converts it the quick way: valid, named as on the DX7, levelled like the wheel’s, close to the full conversion', () => {
    const dx = epiano()
    const r = importDx7Voice(dx)
    expect(voiceProblems(r.voice)).toEqual([])
    expect(voiceName(r.voice)).toBe('TEST EP')
    expect(Math.abs(loudness(r.voice) - TARGET_DB)).toBeLessThan(1.5)
    // both pairs fit four operators: nothing has to go
    expect(r.reduced).toBe('all')
    const full = convert(dx)
    expect(score(dxPrints(dx), r.voice)).toBeLessThan(full.score + 1.5)
  }, 120_000)
})
