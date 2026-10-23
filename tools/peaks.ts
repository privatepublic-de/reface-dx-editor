// The strongest spectral peaks of style takes (local/takes/styles), around each take's level peak: what a voice's
// spectrum holds. Usage: npx vite-node tools/peaks.ts <label…>
import { readFileSync } from 'node:fs'
import { db, envelope, spectrum } from './dxAudio'
import { RATE, readWav } from './dxTake'

const takes = readFileSync('local/takes/styles.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l))
for (const label of process.argv.slice(2).filter((a) => a !== '--')) {
  const t = takes.find((x: { label: string }) => x.label === label)
  if (!t) continue
  const x = readWav(`local/takes/styles/${label.replace(/\s+/g, '-')}.wav`)
  let mean = 0
  for (const v of x) mean += v / x.length
  const env = envelope(x, 0.005)
  const at = env.indexOf(Math.max(...env)) * 0.005 * RATE
  const w = x.subarray(at, at + 0.25 * RATE)
  const { hz, amp } = spectrum(w, 8192)
  const band = (k: number) => hz[k] > 20 && hz[k] < 12000
  const top = Math.max(...amp.filter((_, k) => band(k)))
  const peaks: [number, number][] = []
  for (let k = 2; k < amp.length - 2; k++) if (band(k) && amp[k] >= amp[k - 1] && amp[k] >= amp[k + 1] && amp[k] > top * 10 ** (-50 / 20)) peaks.push([hz[k], db(amp[k] / top)])
  peaks.sort((a, b) => b[1] - a[1])
  console.log(`${label} (${t.name}, f0 ${t.m.f0} Hz, DC ${db(mean).toFixed(0)} dBFS, window ${w.length} samples at ${(at / RATE).toFixed(2)} s): ${peaks.slice(0, 10).map(([f, d]) => `${f.toFixed(0)} ${d.toFixed(0)}`).join(' · ')}`)
}
