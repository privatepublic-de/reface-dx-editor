// Measures the reface DX's curves from its audio: envelope rates, modulator
// depth, carrier and EG level, feedback (saw and square), velocity. The points and measures are tools/curves.ts,
// shared with tools/engineCurves.ts. Usage: npx vite-node tools/dxCurves.ts [attack decay level carrier eglevel
// feedback velocity] (all when none is given). Appends to local/takes/curves/curves.jsonl.
import { appendFileSync, mkdirSync } from 'node:fs'
import { CURVES, pointName, points, type Curve } from './curves'
import { openDx } from './dxTake'

const DIR = 'local/takes/curves'
mkdirSync(DIR, { recursive: true })
const what = process.argv.slice(2).filter((a) => a !== '--') as Curve[]
const curves = what.length ? what : CURVES

const dx = await openDx()
try {
  for (const curve of curves) {
    console.log(`${curve}:`)
    for (const p of points(curve)) {
      const x = await dx.take(`${DIR}/${pointName(p)}.wav`, p.voice, p.note, p.holdS, { tailS: p.tailS, velocity: p.velocity })
      const m = p.measure(x)
      console.log(`  ${JSON.stringify(p.at)} ${JSON.stringify(m, (_, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))}`)
      appendFileSync(`${DIR}/curves.jsonl`, JSON.stringify({ curve, ...p.at, ...m }) + '\n')
    }
  }
} finally {
  dx.close()
}
