// The volca fm generator's instruments on the reface (tools/dx7Convert.ts does the work).
// npx vite-node tools/fromDx7.ts [ids, comma-separated]   (VOLCA=path: where the volca fm generator is checked out)
// Each instrument goes to local/fromDx7/ (so several can run at once), then src/wheel/instrumentVoices.ts is written
// from all there are, and local/fromDx7/table.md: the losses (docs/SOUND.md). `--assemble` only writes. Excluded from tsc: it needs
// the volca fm generator beside this repository.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VC, type Voice as DxVoice } from '../src/dx7/voice'
import { renderDx7Note as dxRender } from '../src/dx7/synth'
import { INSTRUMENT_IDS, INSTRUMENTS, type InstrumentId } from '../../volca-fm-generator/src/generator/instruments'
import { renderNote } from '../src/engine/render'
import { setVoiceName } from '../src/sysex/codec'
import { DEFAULT_CHOICES } from '../../volca-fm-generator/src/generator/choices'
import { generate } from '../../volca-fm-generator/src/generator/generate'
import { rng as dxRng } from '../../volca-fm-generator/src/generator/random'
import { convert, HOLD, keyHz, SR, traits } from '../src/dx7/convert'

const volcaAt = process.env.VOLCA ?? join(process.cwd(), '../volca-fm-generator')


const assembleOnly = process.argv[2] === '--assemble'
const only = assembleOnly ? [] : (process.argv[2]?.split(',') as InstrumentId[] | undefined)
const dir = join(process.cwd(), 'local/fromDx7')
mkdirSync(dir, { recursive: true })

// ---------- the sources: the volca's instruments ----------

/** The volca's comments name each original ("after STEINWAY (Original Yamaha/TX7/TX18 #18)"), the recipe's first,
 *  then its variants', in order. */
function sourceNames(): Record<string, string[]> {
  const text = readFileSync(join(volcaAt, 'src/generator/instruments.ts'), 'utf8')
  const out: Record<string, string[]> = {}
  let id: string | null = null
  let pending: string | null = null
  for (const line of text.split('\n')) {
    const after = line.match(/^\s*\/\/ after (.*)$/)
    if (after) { pending = after[1]; continue }
    const key = line.match(/^  (\w+): \{/)
    if (key) { id = key[1]; out[id] = [pending ?? 'our own']; pending = null; continue }
    if (id && /^\s{6}\{\s*$/.test(line)) { out[id].push(pending ?? 'our own'); pending = null; continue }
    if (!/^\s*\/\//.test(line)) pending = null
  }
  return out
}

/** Each variant of an instrument as the volca plays it at Wild none: the seed whose first draw picks it. */
function variantsOf(id: InstrumentId): DxVoice[] {
  const n = 1 + (INSTRUMENTS[id].variants?.length ?? 0)
  return Array.from({ length: n }, (_, k) => {
    let seed = 1
    while (n > 1 && dxRng(seed).int(0, n - 1) !== k) seed++
    return generate({ ...DEFAULT_CHOICES, instrument: id }, { seed, wild: 0 }).voice
  })
}

// ---------- main ----------

const names = sourceNames()
const ids = (only ?? INSTRUMENT_IDS) as InstrumentId[]
const outPath = join(process.cwd(), 'src/wheel/instrumentVoices.ts')
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')
for (const id of ids) {
  const rows: string[] = []
  const variants = variantsOf(id)
  const lines: string[] = []
  variants.forEach((dx, k) => {
    const t0 = Date.now()
    const c = convert(dx)
    setVoiceName(c.voice, INSTRUMENTS[id].label)
    const tr = (note: number) => {
      const hzDx = keyHz(note, dx[VC.transpose] - 24)
      return [
        traits(dxRender(dx, { note, holdSeconds: HOLD, sampleRate: SR }), hzDx),
        traits(renderNote(c.voice, { note, holdSeconds: HOLD, sampleRate: SR }), hzDx),
      ]
    }
    const [[s3, r3], [s5, r5]] = [tr(48), tr(72)]
    const f = (x: number) => (x === Infinity ? '∞' : x.toFixed(2))
    const source = names[id]?.[k] ?? 'our own'
    rows.push(`| ${INSTRUMENTS[id].label} | ${source.replace(/\|/g, '/')} | ${a1(dx)} → ${c.voice.common[0x10] + 1} | ${c.describe} | ${c.score.toFixed(1)} | ${f(s3.early)}→${f(r3.early)} | ${f(s3.body)}→${f(r3.body)} | ${f(s3.decay)}→${f(r3.decay)} | ${f(s5.early)}→${f(r5.early)} | ${f(s5.decay)}→${f(r5.decay)} |`)
    console.error(`${id} ${k}: ${c.describe}, ${c.score.toFixed(1)} dB (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    lines.push(`    { source: ${JSON.stringify(source)}, reduced: ${JSON.stringify(c.describe)}, distance: ${c.score.toFixed(1)},\n      common: '${hex(c.voice.common)}',\n      ops: [${c.voice.ops.map((o) => `'${hex(o)}'`).join(', ')}] },`)
  })
  const { label, name, group, family, hint } = INSTRUMENTS[id]
  const meta = { label, ...(name ? { name } : {}), group, family, hint }
  if (process.env.DRY) continue
  writeFileSync(join(dir, `${id}.rows`), rows.join('\n'))
  writeFileSync(join(dir, `${id}.entry`), `  ${id}: {\n    ${Object.entries(meta).map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join(', ')},\n    variants: [\n${lines.map((l) => `  ${l.replace(/\n/g, '\n  ')}`).join('\n')}\n    ],\n  },`)
}
function a1(dx: DxVoice) { return dx[VC.algorithm] + 1 }

if (process.env.DRY) process.exit(0)
const have = INSTRUMENT_IDS.filter((id) => existsSync(join(dir, `${id}.entry`)))
const entries = have.map((id) => readFileSync(join(dir, `${id}.entry`), 'utf8'))
const rows = have.map((id) => readFileSync(join(dir, `${id}.rows`), 'utf8'))

writeFileSync(outPath, `// Generated by tools/fromDx7.ts from the volca fm generator's instruments: each original (a classic DX7 voice) on the
// reface's four operators, as close as the probe engine finds it (docs/SOUND.md "Instruments from the DX7").
// distance: dB, the converted voice against the original (loudness over time and the spectrum in bands, C2–C4).
// Don't edit by hand: run the tool again.
import type { Tonality } from './choices'
import type { InstrumentGroup } from './instruments'

export interface InstrumentVoice {
  /** the original */
  source: string
  /** how six operators became four */
  reduced: string
  distance: number
  /** the Voice's bytes, hex */
  common: string
  ops: [string, string, string, string]
}

export interface InstrumentData {
  /** its name, in 10 characters (it names the voice) */
  label: string
  /** its full name, where the label is shortened */
  name?: string
  group: InstrumentGroup
  /** the tonality it is closest to: its colour on the wheel */
  family: Tonality
  hint: string
  /** the originals it holds, one picked per seed */
  variants: InstrumentVoice[]
}

export const INSTRUMENT_DATA = {
${entries.join('\n')}
} satisfies Record<string, InstrumentData>
`)
writeFileSync(join(dir, 'table.md'), ['| Instrument | Original | Algorithm | Reduced | Distance dB | Bright early C2 | Body C2 | Decay C2 s | Early C4 | Decay C4 s |', '|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n') + '\n')
console.error(`${have.length} instruments written`)
