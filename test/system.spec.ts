import { describe, expect, it } from 'vitest'
import { defaultSystem, masterTuneBytes, masterTuneCents, tempoBpm, tempoBytes } from '../src/params/system'

describe('SYSTEM values', () => {
  it('round-trips Master Tune and Tempo', () => {
    const s = defaultSystem()
    for (const cents of [-102.4, -0.1, 0, 12.5, 102.3]) {
      s.set(masterTuneBytes(cents), 2)
      expect(masterTuneCents(s)).toBeCloseTo(cents)
    }
    for (const bpm of [30, 120, 127, 128, 300]) {
      s.set(tempoBytes(bpm), 8)
      expect(tempoBpm(s)).toBe(bpm)
    }
  })

  it('matches the Data List byte layout of the test DX’s SYSTEM read', () => {
    const s = defaultSystem(15, 15)
    expect([s[0], s[1], s[6], s[7], s[0x0e]]).toEqual([15, 15, 1, 0x40, 1])
    expect(masterTuneBytes(0)).toEqual([0, 4, 0, 0])
  })
})
