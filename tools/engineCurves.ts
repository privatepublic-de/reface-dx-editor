// The probe engine against the DX (PLAN §8, the calibration gate): every curve point of tools/curves.ts rendered by
// the engine and measured the same way, beside the DX's latest take of it (local/takes/curves/curves.jsonl, from
// tools/dxCurves.ts). Usage: npx vite-node tools/engineCurves.ts [--fit] [curve…]
// --fit searches TUNING.maxCycles against the modulator-depth curve (the level step is measured). Loudness (db) is
// printed with the engine moved to the DX's recording level: by the difference at the carrier's level 127.
import { existsSync, readFileSync } from 'node:fs'
import { renderNote } from '../src/engine/render'
import { TUNING } from '../src/engine/tables'
import { CURVES, points, type Curve, type Point } from './curves'
import { RATE } from './dxAudio'

const LOG = 'local/takes/curves/curves.jsonl'
const args = process.argv.slice(2).filter((a) => a !== '--')
const fit = args.includes('--fit')
const asked = args.filter((a) => !a.startsWith('--')) as Curve[]

type Row = Record<string, unknown>
const measured: Row[] = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
/** What a log row measured rather than where it was taken. */
const MEASURES = ['curve', 'h', 'flatness', 'db', 'ms', 'ms20', 'ms40']
/** The DX's latest take of a point: the same position, nothing more (a level-100 take isn't a level-127 one). */
const dxOf = (p: Point) => [...measured].reverse().find((r) => r.curve === p.curve
  && Object.entries(p.at).every(([k, x]) => (r[k] ?? false) === x)
  && Object.keys(r).every((k) => MEASURES.includes(k) || k in p.at))

const render = (p: Point) => Float64Array.from(renderNote(p.voice, { note: p.note, velocity: p.velocity ?? 100, holdSeconds: p.holdS, releaseSeconds: p.tailS, sampleRate: RATE }))

const fmt = (x: unknown): string => (typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : Array.isArray(x) ? `[${x.slice(1, 5).map(fmt).join(' ')}]` : String(x))

/** Mean absolute dB difference of H2…H5 over the modulator-depth points the DX has. */
function levelError(): number {
  let sum = 0
  let n = 0
  for (const p of points('level')) {
    const dx = dxOf(p)?.h as number[] | undefined
    if (!dx) continue
    const h = p.measure(render(p)).h as number[]
    for (let k = 1; k < 5; k++) { sum += Math.abs(Math.max(-60, h[k]) - Math.max(-60, dx[k])); n++ }
  }
  return n ? sum / n : NaN
}

if (fit) {
  let best = { err: Infinity, cycles: 0 }
  for (let cycles = 1; cycles <= 4.001; cycles += 0.05) {
    TUNING.maxCycles = cycles
    const err = levelError()
    if (err < best.err) best = { err, cycles }
  }
  TUNING.maxCycles = best.cycles
  console.log(`fit: maxCycles ${best.cycles.toFixed(2)}: ${best.err.toFixed(1)} dB mean error on H2–H5`)
}

// the engine at the DX's recording level
const ref = points('carrier')[0]
const refDx = dxOf(ref)?.db as number | undefined
const offset = refDx === undefined ? 0 : refDx - (ref.measure(render(ref)).db as number)

for (const curve of asked.length ? asked : CURVES) {
  const rows = points(curve).map((p) => {
    const engine = p.measure(render(p))
    if (typeof engine.db === 'number') engine.db += offset
    return { p, dx: dxOf(p), engine }
  })
  if (!rows.some((r) => r.dx)) {
    console.log(`${curve}: no DX takes yet (npx vite-node tools/dxCurves.ts ${curve})`)
    continue
  }
  console.log(`${curve}: DX → engine`)
  for (const { p, dx, engine } of rows) {
    const keys = Object.keys(engine)
    console.log(`  ${JSON.stringify(p.at).padEnd(32)} ${keys.map((k) => `${k} ${fmt(dx?.[k] ?? '–')} → ${fmt(engine[k])}`).join('   ')}`)
  }
}
if (!fit) console.log(`level: ${levelError().toFixed(1)} dB mean error on H2–H5`)
