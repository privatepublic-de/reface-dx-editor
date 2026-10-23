// How noisy FM noise variants are on the DX: spectral flatness (geometric over arithmetic mean of the power
// spectrum, 200 Hz–12 kHz; 1 is white noise, near 0 a few clear partials) and periodicity, at C1, C3 and C5.
// Usage: npx vite-node tools/noiseProbe.ts
import { mkdirSync } from 'node:fs'
import { fixedBytes } from '../src/params/display'
import { NO_STYLE } from '../src/style/choices'
import { styleInit } from '../src/style/style'
import type { Voice } from '../src/sysex/codec'
import { envelope, noteHz, spectrum } from './dxAudio'
import { openDx, RATE } from './dxTake'

const DIR = 'local/takes/noise'
mkdirSync(DIR, { recursive: true })

const base = () => styleInit({ ...NO_STYLE, family: 'noise', shape: 'gate', space: 'dry' }, 1)
const op = (v: Voice, i: number, patch: Record<number, number>) => Object.entries(patch).forEach(([k, x]) => (v.ops[i][Number(k)] = x))
const fixed = (v: Voice, i: number, hz: number) => v.ops[i].set([1, ...fixedBytes(hz)], 0x15)

const VARIANTS: [string, (v: Voice) => void][] = [
  ['now', () => {}],
  ['carrier fb max', (v) => op(v, 0, { 0x13: 127, 0x14: 1 })],
  ['mods max', (v) => [1, 2, 3].forEach((i) => op(v, i, { 0x12: 127, 0x13: 127, 0x14: 1 }))],
  ['both max', (v) => [0, 1, 2, 3].forEach((i) => op(v, i, { 0x12: i ? 127 : 118, 0x13: 127, 0x14: 1 }))],
  ['both max, all fixed', (v) => {
    ;[0, 1, 2, 3].forEach((i) => op(v, i, { 0x12: i ? 127 : 118, 0x13: 127, 0x14: 1 }))
    fixed(v, 3, 3700)
  }],
  ['chain alg 1, max', (v) => {
    v.common[0x10] = 0
    ;[0, 1, 2, 3].forEach((i) => op(v, i, { 0x12: i ? 127 : 118, 0x13: 127, 0x14: 1 }))
  }],
]

function measure(x: Float64Array, note: number) {
  const env = envelope(x, 0.005)
  const pk = Math.max(...env)
  const on = env.findIndex((e) => e > pk * 0.05) * 0.005
  const w = x.subarray(Math.round((on + 0.1) * RATE), Math.round((on + 0.6) * RATE))
  const { hz, amp } = spectrum(w, 8192)
  let logSum = 0
  let sum = 0
  let n = 0
  hz.forEach((f, k) => {
    if (f < 200 || f > 12000) return
    const p = amp[k] ** 2 + 1e-20
    logSum += Math.log(p)
    sum += p
    n++
  })
  const flatness = Math.exp(logSum / n) / (sum / n)
  const L = Math.round(RATE / noteHz(note))
  let xy = 0
  let xx = 0
  let yy = 0
  for (let i = 0; i + L < w.length; i++) {
    xy += w[i] * w[i + L]
    xx += w[i] ** 2
    yy += w[i + L] ** 2
  }
  return { flatness, periodic: xy / Math.sqrt(xx * yy + 1e-18) }
}

const dx = await openDx()
try {
  for (const [label, change] of VARIANTS) {
    const v = base()
    change(v)
    const row = []
    for (const note of [36, 60, 84]) {
      const x = await dx.take(`${DIR}/${label.replace(/[\s,]+/g, '-')}-${note}.wav`, v, note, 0.8, { tailS: 0.2 })
      const m = measure(x, note)
      row.push(`${m.flatness.toFixed(3)}/${m.periodic.toFixed(2)}`)
    }
    console.log(`${label.padEnd(22)} flatness/periodic at C1 C3 C5: ${row.join('   ')}`)
  }
} finally {
  dx.close()
}
