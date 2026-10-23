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

/** The 4 Master Tune nybbles for −102.4…+102.3 cents (0.1-cent steps). */
export function masterTuneBytes(cents: number): number[] {
  const v = Math.max(0, Math.min(2047, Math.round(cents * 10) + 1024))
  return [(v >> 12) & 0x0f, (v >> 8) & 0x0f, (v >> 4) & 0x0f, v & 0x0f]
}

/** The 2 Tempo bytes for 30–300 BPM. */
export function tempoBytes(bpm: number): number[] {
  const v = Math.max(30, Math.min(300, Math.round(bpm)))
  return [(v >> 7) & 0x7f, v & 0x7f]
}

/** A SYSTEM block as the test DX had it (FINDINGS setup, 2026-10-23), with TR/RV CH set. */
export function defaultSystem(txChannel = 15, rxChannel = 15): Uint8Array {
  const s = new Uint8Array(32)
  s[0x00] = txChannel
  s[0x01] = rxChannel
  s.set(masterTuneBytes(0), 0x02)
  s[0x06] = 1
  s[0x07] = 0x40
  s.set(tempoBytes(120), 0x08)
  s[0x0a] = 37
  s[0x0b] = 1
  s[0x0e] = 1
  return s
}
