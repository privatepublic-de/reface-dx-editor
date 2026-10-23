// How different the style options sound from each other, and what the options styleProbe leaves out do (PLAN §7.2).
// Every take becomes a fingerprint: loudness in 7 time windows and the spectrum in 1/3-octave bands early (20–220 ms)
// and late (0.8–1.2 s), in dB. Two takes' distance is the mean dB difference, for the envelope and the spectrum
// separately (floor 60 dB below the louder). The yardstick is the family itself with another seed (what Another does).
// Also: evolving (spectral movement during a 4 s hold), expressive (velocity 40 against 120), treble (C1, C3, C5).
// Usage: npx vite-node tools/styleCompare.ts [families characters brightness shapes evolving expressive treble]
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { NO_STYLE, SHAPES, type Character, type Family, type StyleChoices } from '../src/style/choices'
import { styleInit } from '../src/style/style'
import { db, envelope, noteHz, spectrum } from './dxAudio'
import { openDx, RATE } from './dxTake'

const DIR = 'local/takes/compare'
const LOG = 'local/takes/compare.jsonl'
mkdirSync(DIR, { recursive: true })

const style = (c: Partial<StyleChoices>): StyleChoices => ({ ...NO_STYLE, ...c })
const what = process.argv.slice(2).filter((a) => a !== '--')
const want = (k: string) => !what.length || what.includes(k)

// 1/3-octave bands, 50 Hz … 12.8 kHz
const BANDS = Array.from({ length: 25 }, (_, i) => 50 * 2 ** (i / 3))
const WINDOWS: [number, number][] = [[0, 0.05], [0.05, 0.15], [0.15, 0.4], [0.4, 1.0], [1.0, 1.45], [1.55, 1.85], [1.85, 2.35]]
const HOLD = 1.5

const onsetS = (x: Float64Array) => {
  const env = envelope(x, 0.002)
  const pk = Math.max(...env)
  return env.findIndex((e) => e > pk * 0.03) * 0.002
}
const rmsDb = (x: Float64Array, from: number, to: number) => {
  const a = Math.max(0, Math.round(from * RATE))
  const b = Math.min(x.length, Math.round(to * RATE))
  let s = 0
  for (let i = a; i < b; i++) s += x[i] ** 2
  return db(Math.sqrt(s / Math.max(1, b - a)))
}
function bandsDb(w: Float64Array, size = 8192): number[] {
  if (w.length < size) return BANDS.map(() => -120)
  const { hz, amp } = spectrum(w, size)
  return BANDS.map((lo) => {
    const hi = lo * 2 ** (1 / 3)
    let p = 0
    hz.forEach((f, k) => f >= lo && f < hi && (p += amp[k] ** 2))
    return 10 * Math.log10(p + 1e-24)
  })
}
const slice = (x: Float64Array, from: number, to: number) => x.subarray(Math.max(0, Math.round(from * RATE)), Math.min(x.length, Math.round(to * RATE)))

interface Print { env: number[]; early: number[]; late: number[] }
function fingerprint(x: Float64Array): Print {
  const t0 = onsetS(x)
  return {
    env: WINDOWS.map(([a, b]) => rmsDb(x, t0 + a, t0 + b)),
    early: bandsDb(slice(x, t0 + 0.02, t0 + 0.22)),
    late: bandsDb(slice(x, t0 + 0.8, t0 + 1.2)),
  }
}
function dist(a: number[], b: number[]) {
  const floor = Math.max(...a, ...b) - 60
  return a.reduce((s, v, i) => s + Math.abs(Math.max(v, floor) - Math.max(b[i], floor)), 0) / a.length
}
const distance = (a: Print, b: Print) => ({ env: dist(a.env, b.env), spec: (dist(a.early, b.early) + dist(a.late, b.late)) / 2 })
/** The spectral centroid in harmonics of `f0`, over `w`. */
function centroidH(w: Float64Array, f0: number) {
  const { hz, amp } = spectrum(w, 8192)
  let num = 0
  let den = 0
  hz.forEach((f, k) => {
    if (f < 20 || f > 16000) return
    num += f * amp[k] ** 2
    den += amp[k] ** 2
  })
  return num / den / f0
}

const dx = await openDx()
writeFileSync(LOG, '')
const prints = new Map<string, Print>()
const log = (o: object) => appendFileSync(LOG, JSON.stringify(o) + '\n')
async function take(label: string, c: Partial<StyleChoices>, note = 48, o: { seed?: number; hold?: number; velocity?: number } = {}) {
  const x = await dx.take(`${DIR}/${label.replace(/\s+/g, '-')}.wav`, styleInit(style({ space: 'dry', ...c }), o.seed ?? 1), note, o.hold ?? HOLD, { tailS: 1.0, velocity: o.velocity })
  return x
}
async function print(label: string, c: Partial<StyleChoices>, note = 48, seed = 1) {
  const p = fingerprint(await take(label, c, note, { seed }))
  prints.set(label, p)
  log({ label, choices: c, note, seed, print: p })
  return p
}
const fmt = (d: { env: number; spec: number }) => `env ${d.env.toFixed(1).padStart(5)}  spec ${d.spec.toFixed(1).padStart(5)} dB`
function matrix(title: string, labels: string[]) {
  console.log(`\n${title} (spectrum distance, dB; env in brackets)`)
  console.log(''.padEnd(12) + labels.map((l) => l.slice(0, 9).padStart(10)).join(''))
  for (const a of labels) {
    console.log(a.slice(0, 11).padEnd(12) + labels.map((b) => {
      if (a === b) return '–'.padStart(10)
      const d = distance(prints.get(a)!, prints.get(b)!)
      return `${d.spec.toFixed(1)}(${d.env.toFixed(0)})`.padStart(10)
    }).join(''))
  }
}

const FAMILIES: Family[] = ['bass', 'organ', 'strings', 'pluck', 'bell', 'epiano', 'brass', 'lead', 'perc', 'noise']
try {
  if (want('families')) {
    for (const f of FAMILIES) {
      await print(f, { family: f })
      await print(`${f}#2`, { family: f }, 48, 2)
    }
    console.log('\nAnother (seed 2 against seed 1), the yardstick:')
    for (const f of FAMILIES) console.log(`  ${f.padEnd(8)} ${fmt(distance(prints.get(f)!, prints.get(`${f}#2`)!))}`)
    matrix('Families at C3', FAMILIES)
  }
  if (want('characters')) {
    const KS: Character[] = ['analogue', 'hollow', 'metallic', 'noisy']
    for (const f of ['bass', 'brass', 'epiano'] as Family[]) {
      await print(`${f} plain`, { family: f })
      for (const k of KS) await print(`${f} ${k}`, { family: f, characters: { [k]: 1 } })
      await print(`${f} drive`, { family: f, drive: 1 })
      console.log(`\nCharacters on ${f}, against plain:`)
      for (const k of [...KS, 'drive']) console.log(`  ${k.padEnd(10)} ${fmt(distance(prints.get(`${f} plain`)!, prints.get(`${f} ${k}`)!))}`)
      matrix(`Characters on ${f}`, KS.map((k) => `${f} ${k}`))
    }
  }
  if (want('brightness')) {
    console.log('\nBrightness −1 and +1 against 0:')
    for (const f of ['bass', 'pluck', 'epiano', 'brass', 'organ', 'strings', 'noise'] as Family[]) {
      for (const b of [-1, 0, 1]) await print(`${f} b${b}`, { family: f, brightness: b })
      const z = prints.get(`${f} b0`)!
      console.log(`  ${f.padEnd(8)} −1: ${fmt(distance(z, prints.get(`${f} b-1`)!))}   +1: ${fmt(distance(z, prints.get(`${f} b1`)!))}`)
    }
  }
  if (want('shapes')) {
    for (const f of ['brass', 'epiano'] as Family[]) {
      for (const s of SHAPES) await print(`${f} ${s}`, { family: f, shape: s })
      matrix(`Shapes on ${f}`, SHAPES.map((s) => `${f} ${s}`))
    }
  }
  if (want('evolving')) {
    console.log('\nEvolving: how much the spectrum moves during a 4 s hold (mean change per 100 ms band frame, dB):')
    for (const f of ['brass', 'strings', 'organ'] as Family[]) {
      const row: string[] = []
      for (const e of [0, 1]) {
        const x = await take(`${f} evolve${e}`, { family: f, evolving: e }, 48, { hold: 4 })
        const t0 = onsetS(x)
        const frames = Array.from({ length: 30 }, (_, i) => bandsDb(slice(x, t0 + 0.8 + i * 0.1, t0 + 0.8 + i * 0.1 + 4096 / RATE), 4096))
        let flux = 0
        for (let i = 1; i < frames.length; i++) flux += dist(frames[i], frames[i - 1])
        const level = Array.from({ length: 30 }, (_, i) => rmsDb(x, t0 + 0.8 + i * 0.1, t0 + 0.9 + i * 0.1))
        const swing = Math.max(...level) - Math.min(...level)
        row.push(`e${e}: flux ${(flux / (frames.length - 1)).toFixed(2)} dB, level swing ${swing.toFixed(1)} dB`)
        log({ label: `${f} evolve${e}`, flux: flux / (frames.length - 1), swing })
      }
      console.log(`  ${f.padEnd(8)} ${row.join('   ')}`)
    }
  }
  if (want('expressive')) {
    console.log('\nExpressive: velocity 120 against 40 (level, and brightness as the centroid in harmonics):')
    for (const f of ['epiano', 'brass', 'pluck'] as Family[]) {
      const row: string[] = []
      for (const xp of [0, 1]) {
        const m = []
        for (const v of [40, 120]) {
          const x = await take(`${f} expr${xp} v${v}`, { family: f, expressive: xp }, 60, { velocity: v, hold: 1 })
          const t0 = onsetS(x)
          m.push({ level: rmsDb(x, t0, t0 + 0.3), centroid: centroidH(slice(x, t0 + 0.02, t0 + 0.22), noteHz(60)) })
        }
        row.push(`x${xp}: level +${(m[1].level - m[0].level).toFixed(1)} dB, centroid ${m[0].centroid.toFixed(2)} → ${m[1].centroid.toFixed(2)}`)
        log({ label: `${f} expressive${xp}`, m })
      }
      console.log(`  ${f.padEnd(8)} ${row.join('   ')}`)
    }
  }
  if (want('treble')) {
    console.log('\nTreble: the centroid in harmonics at C1, C3, C5:')
    for (const f of ['epiano', 'brass'] as Family[]) {
      for (const t of [-1, 0, 1]) {
        const cs = []
        for (const n of [36, 60, 84]) {
          const x = await take(`${f} treble${t} n${n}`, { family: f, treble: t }, n, { hold: 0.8 })
          const t0 = onsetS(x)
          cs.push(centroidH(slice(x, t0 + 0.02, t0 + 0.22), noteHz(n)))
        }
        console.log(`  ${f.padEnd(8)} t${String(t).padStart(2)}: ${cs.map((c) => c.toFixed(2)).join('  ')}`)
        log({ label: `${f} treble${t}`, centroids: cs })
      }
    }
  }
} finally {
  dx.close()
}
console.log(`\nWAVs in ${DIR}/, fingerprints in ${LOG}.`)
