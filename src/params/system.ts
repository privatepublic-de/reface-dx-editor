// SYSTEM, address 00 00 xx, 32 bytes (reface Data List p. 8). Bytes 02–05 and 08–09 are multi-byte values.
import { formatValue, OFF_ON, type Param } from './param'

export const SYSTEM_PARAMS: readonly Param[] = [
  { offset: 0x00, key: 'txChannel', label: 'TR CH', min: 0, max: 0x7f, format: (v) => (v === 0x7f ? 'off' : String(v + 1)) },
  { offset: 0x01, key: 'rxChannel', label: 'RV CH', min: 0, max: 0x10, format: (v) => (v === 0x10 ? 'all' : String(v + 1)) },
  { offset: 0x06, key: 'local', label: 'Local control', min: 0, max: 1, labels: OFF_ON },
  { offset: 0x07, key: 'masterTranspose', label: 'Master transpose', min: 0x34, max: 0x4c, center: 0x40 },
  { offset: 0x0a, key: 'contrast', label: 'LCD contrast', min: 0, max: 63 },
  { offset: 0x0b, key: 'sustain', label: 'Sustain pedal', min: 0, max: 1, labels: ['FC3', 'FC4/5'] },
  { offset: 0x0c, key: 'autoPowerOff', label: 'Auto power-off', min: 0, max: 1, labels: OFF_ON },
  { offset: 0x0d, key: 'speaker', label: 'Speaker', min: 0, max: 1, labels: OFF_ON },
  { offset: 0x0e, key: 'midiControl', label: 'MIDI control', min: 0, max: 1, labels: OFF_ON },
]

export const systemParam = (key: string) => SYSTEM_PARAMS.find((p) => p.key === key)!

/** Master Tune: 4 nybbles (bits 15–12 … 3–0), 0.1 cent steps; 1024 = 0 cents (−102.4…+102.3). */
export const masterTuneCents = (data: ArrayLike<number>) =>
  ((((data[2] & 0x0f) << 12) | ((data[3] & 0x0f) << 8) | ((data[4] & 0x0f) << 4) | (data[5] & 0x0f)) - 1024) / 10

/** Tempo: two 7-bit bytes, 30–300 BPM. */
export const tempoBpm = (data: ArrayLike<number>) => ((data[8] & 0x7f) << 7) | (data[9] & 0x7f)

export function formatSystem(data: ArrayLike<number>): string {
  const parts = SYSTEM_PARAMS.map((p) => `${p.label} ${formatValue(p, data[p.offset])}`)
  parts.splice(2, 0, `Master tune ${masterTuneCents(data).toFixed(1)} cents`)
  parts.push(`Tempo ${tempoBpm(data)} BPM`)
  return parts.join(' · ')
}
