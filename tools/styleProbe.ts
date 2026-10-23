// Plays the styles on the reface DX and measures what they claim (PLAN §7.2): brightness (spectral centroid, in
// harmonics of the fundamental), metallic/noisy (how periodic the sound is), hollow (even against odd harmonics),
// the envelope (attack, level at 0.5 s and at note-off, release). Prints a table, checks the directions each style
// promises, and writes local/takes/styles.jsonl (+ the WAVs). Usage: npx vite-node tools/styleProbe.ts [group…]
// Groups: families brightness characters shapes length (all when none is given).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { ratioOf } from '../src/params/display'
import { ALGORITHMS } from '../src/params/algorithms'
import { NO_STYLE, SHAPES, type Character, type Family, type StyleChoices } from '../src/style/choices'
import { styleInit } from '../src/style/style'
import type { Voice } from '../src/sysex/codec'
import { averageCycle, db, envelope, harmonics, noteHz, peak, period, spectrum } from './dxAudio'
import { openDx, RATE } from './dxTake'

const DIR = 'local/takes/styles'
const LOG = 'local/takes/styles.jsonl'
mkdirSync(DIR, { recursive: true })

interface Take {
  group: string
  label: string
  choices: Partial<StyleChoices>
  note: number
  holdS: number
}

const style = (c: Partial<StyleChoices>): StyleChoices => ({ ...NO_STYLE, ...c })
const FAMILY_NOTE: Partial<Record<Family, number>> = { bass: 36, perc: 48, bell: 72 }
const noteFor = (f: Family | null) => (f && FAMILY_NOTE[f]) || 60

const TAKES: Take[] = [
  ...(['bass', 'organ', 'strings', 'pluck', 'bell', 'epiano', 'brass', 'lead', 'perc', 'noise'] as Family[]).map((family) => ({
    group: 'families', label: family, choices: { family }, note: noteFor(family), holdS: ['strings', 'brass'].includes(family) ? 1.5 : 1.0,
  })),
  ...(['bass', 'epiano'] as Family[]).flatMap((family) =>
    [-1, 0, 1].map((brightness) => ({ group: 'brightness', label: `${family} b${brightness}`, choices: { family, brightness, space: 'dry' as const }, note: noteFor(family), holdS: 1.0 })),
  ),
  { group: 'characters', label: 'bass plain', choices: { family: 'bass', space: 'dry' }, note: 48, holdS: 1.0 },
  ...(['analogue', 'hollow', 'metallic', 'noisy'] as Character[]).map((k) => ({
    group: 'characters', label: `bass ${k}`, choices: { family: 'bass' as const, characters: { [k]: 1 }, space: 'dry' as const }, note: 48, holdS: 1.0,
  })),
  // on brass: one carrier, no detune, so no beating that would look like an envelope
  ...SHAPES.map((shape) => ({ group: 'shapes', label: `brass ${shape}`, choices: { family: 'brass' as const, shape, space: 'dry' as const }, note: 60, holdS: 1.5 })),
  ...[-1, 1].map((length) => ({ group: 'length', label: `pluck len${length}`, choices: { family: 'pluck' as const, length, space: 'dry' as const }, note: 60, holdS: 1.5 })),
]

const BLOCK_S = 0.005

/** The fundamental the voice should have: the note, transposed, times the common divisor of the ratios sounding. */
function fundamental(v: Voice, note: number): { hz: number; inharmonic: boolean } {
  const base = noteHz(note) * 2 ** ((v.common[0x0c] - 64) / 12)
  const ratios = v.ops.filter((o) => o[0x00] === 1 && o[0x15] === 0 && o[0x12] > 0).map((o) => Math.round(ratioOf(o[0x16], o[0x17]) * 100))
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const g = ratios.reduce(gcd, ratios[0] ?? 100) / 100
  const carrier = ratioOf(v.ops[ALGORITHMS[v.common[0x10]].carriers[0]][0x16], v.ops[ALGORITHMS[v.common[0x10]].carriers[0]][0x17])
  return g >= carrier / 4 ? { hz: base * g, inharmonic: false } : { hz: base * carrier, inharmonic: true }
}

function analyse(x: Float64Array, v: Voice, note: number, holdS: number) {
  const env = envelope(x, BLOCK_S)
  const pk = Math.max(...env)
  const on = env.findIndex((e) => e > pk * 0.05)
  const top = env.findIndex((e) => e >= pk * 0.9)
  const peakAt = env.indexOf(pk)
  const off = on + Math.round(holdS / BLOCK_S)
  const after = env.slice(off).findIndex((e) => e < pk * 0.01)
  const rel = (i: number) => db((env[Math.min(i, env.length - 1)] ?? 0) / pk)
  // The sound just after its onset (20–220 ms), where a pluck's brightness is: spectrum, periodicity, harmonics.
  void peakAt
  const from = Math.max(0, Math.round((on * BLOCK_S + 0.02) * RATE))
  const w = x.subarray(from, Math.min(x.length, from + 0.2 * RATE))
  const { hz, amp } = spectrum(w, 8192)
  let num = 0
  let den = 0
  hz.forEach((f, k) => {
    if (f < 20 || f > 16000) return
    num += f * amp[k] ** 2
    den += amp[k] ** 2
  })
  const f0 = fundamental(v, note)
  const lag = (RATE / f0.hz) * Math.max(1, Math.round(0.01 * f0.hz)) // a few cycles, for low notes too
  const L = Math.round(lag)
  let xy = 0
  let xx = 0
  let yy = 0
  for (let i = 0; i + L < w.length; i++) {
    xy += w[i] * w[i + L]
    xx += w[i] ** 2
    yy += w[i + L] ** 2
  }
  let evenOdd = NaN
  if (!f0.inharmonic && w.length > (RATE / f0.hz) * 8) {
    const h = harmonics(averageCycle(w, period(w, RATE / f0.hz)), 21).amp
    const even = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20].reduce((s, k) => s + h[k - 1] ** 2, 0)
    const odd = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21].reduce((s, k) => s + h[k - 1] ** 2, 0)
    evenOdd = 10 * Math.log10((even + 1e-18) / (odd + 1e-18))
  }
  return {
    peakDb: +db(peak(x)).toFixed(1),
    attackMs: (top - on) * BLOCK_S * 1000,
    at500Db: +rel(on + 100).toFixed(1),
    atOffDb: +rel(off - 20).toFixed(1), // 100 ms before note-off: the take's hold runs a little short of holdS
    releaseMs: after < 0 ? null : after * BLOCK_S * 1000,
    centroidH: +(num / den / f0.hz).toFixed(2),
    periodicity: +(xy / Math.sqrt(xx * yy + 1e-18)).toFixed(3),
    evenOddDb: Number.isNaN(evenOdd) ? null : +evenOdd.toFixed(1),
    f0: +f0.hz.toFixed(1),
  }
}

type Result = Take & { m: ReturnType<typeof analyse> }

const groups = process.argv.slice(2).filter((a) => a !== '--')
const run = TAKES.filter((t) => !groups.length || groups.includes(t.group))
const dx = await openDx()
const results: Result[] = []
writeFileSync(LOG, '')
try {
  for (const t of run) {
    const v = styleInit(style(t.choices), 1)
    const file = `${DIR}/${t.label.replace(/\s+/g, '-')}.wav`
    const x = await dx.take(file, v, t.note, t.holdS, { tailS: 1.2 })
    const m = analyse(x, v, t.note, t.holdS)
    results.push({ ...t, m })
    appendFileSync(LOG, JSON.stringify({ ...t, name: String.fromCharCode(...v.common.subarray(0, 10)).trim(), m }) + '\n')
    console.log(
      `${t.label.padEnd(18)} peak ${String(m.peakDb).padStart(6)} dBFS  attack ${String(Math.round(m.attackMs)).padStart(4)} ms  @0.5s ${String(m.at500Db).padStart(6)} dB  @off ${String(m.atOffDb).padStart(6)} dB  release ${String(m.releaseMs ?? '–').padStart(5)} ms  centroid ${String(m.centroidH).padStart(5)} H  periodic ${m.periodicity}  even/odd ${m.evenOddDb ?? '–'} dB`,
    )
  }
} finally {
  dx.close()
}

// ---- what each style promises, checked on the recordings ----
const by = (label: string) => results.find((r) => r.label === label)?.m
const checks: [string, boolean | undefined][] = []
const check = (what: string, ok: boolean | undefined) => checks.push([what, ok])
for (const r of results) check(`${r.label}: audible and not clipping (−50 … −1 dBFS)`, r.m.peakDb > -50 && r.m.peakDb < -1)
for (const f of ['bass', 'epiano']) {
  const [lo, mid, hi] = [-1, 0, 1].map((b) => by(`${f} b${b}`))
  if (lo && mid && hi) check(`${f}: brightness raises the centroid (${lo.centroidH} < ${mid.centroidH} < ${hi.centroidH})`, lo.centroidH < mid.centroidH && mid.centroidH < hi.centroidH)
}
const plain = by('bass plain')
if (plain) {
  const c = (k: string) => by(`bass ${k}`)
  if (c('metallic')) check(`metallic: less periodic than plain (${c('metallic')!.periodicity} < ${plain.periodicity})`, c('metallic')!.periodicity < plain.periodicity)
  if (c('noisy')) check(`noisy: less periodic than plain (${c('noisy')!.periodicity} < ${plain.periodicity})`, c('noisy')!.periodicity < plain.periodicity)
  if (c('hollow') && plain.evenOddDb !== null && c('hollow')!.evenOddDb !== null)
    check(`hollow: fewer even harmonics than plain (${c('hollow')!.evenOddDb} < ${plain.evenOddDb} dB)`, c('hollow')!.evenOddDb! < plain.evenOddDb)
  for (const k of ['analogue']) if (c(k)) check(`${k}: brighter than plain (${c(k)!.centroidH} > ${plain.centroidH})`, c(k)!.centroidH > plain.centroidH)
}
const s = (k: string) => by(`brass ${k}`)
if (s('pluck') && s('pad')) check(`pluck decays, pad holds (@off ${s('pluck')!.atOffDb} < ${s('pad')!.atOffDb} dB)`, s('pluck')!.atOffDb < s('pad')!.atOffDb - 10)
if (s('pad') && s('gate')) check(`pad starts slower than gate (${s('pad')!.attackMs} > ${s('gate')!.attackMs} ms)`, s('pad')!.attackMs > s('gate')!.attackMs + 50)
if (s('gate')) check(`gate holds full level to note-off (${s('gate')!.atOffDb} dB > −3)`, s('gate')!.atOffDb > -3)
if (s('reverse')) check(`reverse swells (attack ${s('reverse')!.attackMs} ms > 150) and stops (@off ${s('reverse')!.atOffDb} dB < −30)`, s('reverse')!.attackMs > 150 && s('reverse')!.atOffDb < -30)
if (s('struck')) check(`keyboard decays while held (@off ${s('struck')!.atOffDb} dB < −6)`, s('struck')!.atOffDb < -6)
const [short, long] = [by('pluck len-1'), by('pluck len1')]
if (short && long) check(`length: long decays slower (@0.5s ${long.at500Db} > ${short.at500Db} dB)`, long.at500Db > short.at500Db)

console.log('\nChecks:')
for (const [what, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${what}`)
console.log(`\n${checks.filter(([, ok]) => ok).length}/${checks.length} as intended. WAVs in ${DIR}/, measurements in ${LOG}.`)
