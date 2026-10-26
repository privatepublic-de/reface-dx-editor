// Whole voices on the DX against the probe engine (PLAN §8, the calibration gate's second half): modulators with
// shaped waves (feedback), every tonality from one pin, and noise grafted at several levels. Each is played on the
// DX and rendered by the engine and measured the same way: loudness, brightness (spectral centroid in harmonics of
// the note), noisiness (flatness) and the envelope. Usage: npx vite-node tools/voiceProbe.ts [--engine] [group…]
// Groups: shaped tonalities noise noisegap controls mixes instruments. --engine renders only (no DX); --compare renders the voices the DX played (the
// .syx beside each take) against its logged measures, without the DX. Appends the DX's to local/takes/voices.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { renderNote } from '../src/engine/render'
import { voicesFromBytes } from '../src/sysex/codec'
import { RATE } from './dxAudio'
import { measure, probes } from './voices'

const DIR = 'local/takes/voices'
const LOG = 'local/takes/voices.jsonl'
mkdirSync(DIR, { recursive: true })
const args = process.argv.slice(2).filter((a) => a !== '--')
const engineOnly = args.includes('--engine')
const compare = args.includes('--compare')
const groups = args.filter((a) => !a.startsWith('--'))

const r1 = (x: number) => Math.round(x * 10) / 10
const fmt = (m: ReturnType<typeof measure>) =>
  `${r1(m.db).toString().padStart(6)} dB  peak ${r1(m.peakDb).toString().padStart(6)}  sway ${r1(m.sway).toString().padStart(4)}  ${m.centroidH.toFixed(2).padStart(6)} H  flat ${m.flatness.toFixed(3)}  env ${m.env.map((e) => r1(e).toString().padStart(5)).join(' ')}`

const dx = engineOnly || compare ? null : await (await import('./dxTake')).openDx()
// the engine at the DX's recording level: by the first take's loudness against its render
let offset: number | null = null
try {
  for (const p of probes(groups)) {
    const e = measure(Float64Array.from(renderNote(p.voice, { note: p.note, velocity: p.velocity ?? 100, holdSeconds: p.holdS, releaseSeconds: 0.3, sampleRate: RATE })), p.note)
    const file = `${DIR}/${p.label.replace(/[\s+]+/g, '-')}`
    if (compare) {
      const logged = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).reverse().find((r) => r.label === p.label) : null
      if (!logged || !existsSync(`${file}.syx`)) continue
      const played = voicesFromBytes(readFileSync(`${file}.syx`)).voices[0]
      const r = measure(Float64Array.from(renderNote(played, { note: p.note, velocity: p.velocity ?? 100, holdSeconds: p.holdS, releaseSeconds: 0.3, sampleRate: RATE })), p.note)
      offset ??= logged.dx.db - r.db
      r.db += offset
      r.peakDb += offset
      console.log(`${p.label.padEnd(26)} DX     ${fmt(logged.dx)}\n${''.padEnd(26)} engine ${fmt(r)}`)
      continue
    }
    if (!dx) {
      console.log(`${p.label.padEnd(26)} engine ${fmt(e)}`)
      continue
    }
    const x = await dx.take(`${file}.wav`, p.voice, p.note, p.holdS, { tailS: 0.3, velocity: p.velocity })
    const m = measure(x, p.note)
    offset ??= m.db - e.db
    e.db += offset
    e.peakDb += offset
    console.log(`${p.label.padEnd(26)} DX     ${fmt(m)}\n${''.padEnd(26)} engine ${fmt(e)}`)
    appendFileSync(LOG, JSON.stringify({ group: p.group, label: p.label, note: p.note, dx: m, engine: e }) + '\n')
  }
} finally {
  dx?.close()
}
