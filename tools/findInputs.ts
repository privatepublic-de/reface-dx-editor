// Which X18 inputs the reface DX is on: plays VOICE INIT (a sine) and records all 18 inputs, printing each one's peak.
// Usage: npx vite-node tools/findInputs.ts
import { mkdirSync } from 'node:fs'
import { initVoice } from '../src/params/init'
import { openDx, readWavChannels } from './dxTake'

mkdirSync('local/takes', { recursive: true })
const file = 'local/takes/inputs.wav'
const dx = await openDx()
try {
  console.log(`DX: receive channel ${dx.session.playChannel + 1}, speaker ${dx.system[0x0d] ? 'on' : 'off'}`)
  await dx.take(file, initVoice(), 60, 0.8, { tailS: 0.2 })
  // take() keeps only DX_INPUTS; record all 18 again for the overview
  const { record, sleep } = await import('./dxTake')
  const all = 'local/takes/inputs-all.wav'
  const done = record(all, 1.4, Array.from({ length: 18 }, (_, i) => i + 1))
  await sleep(300)
  dx.send([0x90 | dx.session.playChannel, 60, 100])
  await sleep(800)
  dx.send([0x80 | dx.session.playChannel, 60, 0])
  await done
  readWavChannels(all).forEach((c, i) => {
    let peak = 0
    for (const v of c) peak = Math.max(peak, Math.abs(v))
    console.log(`input ${String(i + 1).padStart(2)}: peak ${(20 * Math.log10(peak + 1e-12)).toFixed(1)} dBFS`)
  })
} finally {
  dx.close()
}
