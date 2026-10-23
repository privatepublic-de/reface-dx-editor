// VOICE Common, address 30 00 xx, 38 bytes (reface Data List p. 9).
import type { Param } from './param'

export const NAME_LENGTH = 10

export const LFO_WAVES = ['sine', 'triangle', 'saw up', 'saw down', 'square', 'S&H 8', 'S&H'] as const
export const EFFECT_TYPES = ['thru', 'distortion', 'touch wah', 'chorus', 'flanger', 'phaser', 'delay', 'reverb'] as const
/** Labels of Effect Parameter 1 and 2 per effect type (Owner's Manual p. 22). */
export const EFFECT_PARAM_LABELS: Record<number, readonly [string, string]> = {
  0: ['–', '–'],
  1: ['drive', 'tone'],
  2: ['sens', 'rez'],
  3: ['depth', 'rate'],
  4: ['depth', 'rate'],
  5: ['depth', 'rate'],
  6: ['depth', 'time'],
  7: ['depth', 'time'],
}

const egRate = (n: number): Param => ({ offset: 0x14 + n, key: `pegRate${n}`, label: `Pitch EG rate ${n}`, min: 0, max: 127 })
const egLevel = (n: number): Param => ({ offset: 0x18 + n, key: `pegLevel${n}`, label: `Pitch EG level ${n}`, min: 0x10, max: 0x70, center: 0x40 })

export const COMMON_PARAMS: readonly Param[] = [
  { offset: 0x0c, key: 'transpose', label: 'Transpose', min: 0x28, max: 0x58, center: 0x40 },
  { offset: 0x0d, key: 'partMode', label: 'Part mode', min: 0, max: 2, labels: ['poly', 'mono-full', 'mono-legato'] },
  { offset: 0x0e, key: 'portamento', label: 'Portamento', min: 0, max: 127 },
  { offset: 0x0f, key: 'pbRange', label: 'PB range', min: 0x28, max: 0x58, center: 0x40 },
  { offset: 0x10, key: 'algorithm', label: 'Algorithm', min: 0, max: 11, format: (v) => String(v + 1) },
  { offset: 0x11, key: 'lfoWave', label: 'LFO wave', min: 0, max: 6, labels: LFO_WAVES },
  { offset: 0x12, key: 'lfoSpeed', label: 'LFO speed', min: 0, max: 127 },
  { offset: 0x13, key: 'lfoDelay', label: 'LFO delay', min: 0, max: 127 },
  { offset: 0x14, key: 'lfoPmd', label: 'LFO PMD', min: 0, max: 127 },
  egRate(1), egRate(2), egRate(3), egRate(4),
  egLevel(1), egLevel(2), egLevel(3), egLevel(4),
  { offset: 0x1d, key: 'fx1Type', label: 'Effect 1 type', min: 0, max: 7, labels: EFFECT_TYPES },
  { offset: 0x1e, key: 'fx1Param1', label: 'Effect 1 param 1', min: 0, max: 127 },
  { offset: 0x1f, key: 'fx1Param2', label: 'Effect 1 param 2', min: 0, max: 127 },
  { offset: 0x20, key: 'fx2Type', label: 'Effect 2 type', min: 0, max: 7, labels: EFFECT_TYPES },
  { offset: 0x21, key: 'fx2Param1', label: 'Effect 2 param 1', min: 0, max: 127 },
  { offset: 0x22, key: 'fx2Param2', label: 'Effect 2 param 2', min: 0, max: 127 },
]

export const commonParam = (key: string) => COMMON_PARAMS.find((p) => p.key === key)!
