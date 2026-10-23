import { describe, expect, it } from 'vitest'
import { describeFrequency, formatDetune } from '../src/params/display'

// What the DX's screen showed for OP1, 2026-10-23 (FINDINGS Q10): [mode, coarse, fine, shown].
const READINGS: [number, number, number, string][] = [
  [0, 0, 0, '0.500'], [0, 0, 50, '0.750'], [0, 0, 99, '0.995'],
  [0, 1, 0, '1.00'], [0, 1, 50, '1.50'], [0, 1, 99, '1.99'],
  [0, 4, 0, '4.00'], [0, 4, 50, '4.50'], [0, 4, 99, '4.99'],
  [0, 7, 0, '7.00'], [0, 7, 50, '7.50'], [0, 7, 99, '7.99'],
  [0, 8, 0, '8.00'], [0, 8, 50, '8.50'], [0, 8, 99, '8.99'],
  [0, 15, 0, '15.00'], [0, 15, 50, '15.50'], [0, 15, 99, '15.99'],
  [0, 16, 0, '16.00'], [0, 16, 50, '16.50'], [0, 16, 99, '16.99'],
  [0, 31, 0, '31.00'], [0, 31, 50, '31.50'], [0, 31, 99, '31.99'],
  [1, 0, 0, '1.000 Hz'], [1, 0, 50, '3.162 Hz'], [1, 0, 99, '9.772 Hz'],
  [1, 1, 0, '1.000 Hz'], [1, 1, 50, '3.162 Hz'], [1, 1, 99, '9.772 Hz'],
  [1, 4, 0, '1.000 Hz'], [1, 4, 50, '3.162 Hz'], [1, 4, 99, '9.772 Hz'],
  [1, 7, 0, '1.000 Hz'], [1, 7, 50, '3.162 Hz'], [1, 7, 99, '9.772 Hz'],
  [1, 8, 0, '10.00 Hz'], [1, 8, 50, '31.62 Hz'], [1, 8, 99, '97.72 Hz'],
  [1, 15, 0, '10.00 Hz'], [1, 15, 50, '31.62 Hz'], [1, 15, 99, '97.72 Hz'],
  [1, 16, 0, '100.0 Hz'], [1, 16, 50, '316.2 Hz'], [1, 16, 99, '977.2 Hz'],
  [1, 31, 0, '1000 Hz'], [1, 31, 50, '3162 Hz'], [1, 31, 99, '9772 Hz'],
]

describe('frequency display (checked on the DX, Q10)', () => {
  it.each(READINGS)('mode %i coarse %i fine %i shows %s', (mode, coarse, fine, shown) => {
    expect(describeFrequency(mode, coarse, fine)).toBe(shown)
  })

  it('shows detune as the raw value − 64', () => {
    expect([32, 63, 64, 65, 96, 127].map(formatDetune)).toEqual(['-32', '-1', '0', '+1', '+32', '+63'])
  })
})
