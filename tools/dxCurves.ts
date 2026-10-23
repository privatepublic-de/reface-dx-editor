// Measures the reface DX's envelope rates and the modulation depth of operator levels, from its audio (after
// nord-lead-2-editor's probeSound). Usage: npx vite-node tools/dxCurves.ts [attack decay level]
// attack: R1 → time to 90 % (OP1 alone, a sine); decay: R2 → time to −20 and −40 dB (L1 127 → L2 0);
// level: modulator level → H2 and H3 against H1 (OP2 → OP1 at 1 : 1, algorithm 1, OP3/4 off).
import { appendFileSync, mkdirSync } from 'node:fs'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { averageCycle, db, envelope, harmonics, noteHz, period } from './dxAudio'
import { openDx, RATE } from './dxTake'

const DIR = 'local/takes/curves'
mkdirSync(DIR, { recursive: true })
const BLOCK_S = 0.002
const what = process.argv.slice(2).filter((a) => a !== '--')
const want = (k: string) => !what.length || what.includes(k)

/** VOICE INIT with OP1 alone (a sine), envelope set. */
function sine(rates: number[], levels: number[]): Voice {
  const v = cloneVoice(initVoice())
  v.ops[0].set(rates, 0x01)
  v.ops[0].set(levels, 0x05)
  v.ops[0][0x12] = 127
  return v
}

const dx = await openDx()
try {
  if (want('attack')) {
    console.log('R1 → attack (to 90 %):')
    for (const r of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) {
      const hold = r < 40 ? 6 : r < 60 ? 3 : 1.2
      const x = await dx.take(`${DIR}/attack-${r}.wav`, sine([r, 127, 127, 127], [127, 127, 127, 0]), 60, hold, { tailS: 0.2 })
      const env = envelope(x, BLOCK_S)
      const pk = Math.max(...env)
      const on = env.findIndex((e) => e > pk * 0.01)
      const t90 = env.findIndex((e) => e >= pk * 0.9)
      const ms = (t90 - on) * BLOCK_S * 1000
      console.log(`  R1 ${String(r).padStart(3)}: ${ms.toFixed(0)} ms`)
      appendFileSync(`${DIR}/curves.jsonl`, JSON.stringify({ curve: 'attack', rate: r, ms }) + '\n')
    }
  }
  if (want('decay')) {
    console.log('R2 → decay from L1 127 to L2 0 (time to −20 dB, −40 dB):')
    for (const r of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) {
      const hold = r < 40 ? 8 : r < 60 ? 4 : 1.5
      const x = await dx.take(`${DIR}/decay-${r}.wav`, sine([127, r, 127, 127], [127, 0, 0, 0]), 60, hold, { tailS: 0.1 })
      const env = envelope(x, BLOCK_S)
      const pk = Math.max(...env)
      const at = env.indexOf(pk)
      const t = (dB: number) => {
        const i = env.slice(at).findIndex((e) => e < pk * 10 ** (dB / 20))
        return i < 0 ? null : i * BLOCK_S * 1000
      }
      console.log(`  R2 ${String(r).padStart(3)}: −20 dB ${t(-20)?.toFixed(0) ?? '>'} ms, −40 dB ${t(-40)?.toFixed(0) ?? '>'} ms`)
      appendFileSync(`${DIR}/curves.jsonl`, JSON.stringify({ curve: 'decay', rate: r, ms20: t(-20), ms40: t(-40) }) + '\n')
    }
  }
  if (want('level')) {
    console.log('Modulator level → H2, H3 re H1 (OP2 → OP1 at 1 : 1):')
    for (const l of [40, 60, 70, 80, 90, 100, 110, 120, 127]) {
      const v = sine([127, 127, 127, 127], [127, 127, 127, 0])
      v.common[0x10] = 0
      v.ops[1].set([127, 127, 127, 127], 0x01)
      v.ops[1].set([127, 127, 127, 0], 0x05)
      v.ops[1][0x12] = l
      v.ops[2][0x12] = 0
      v.ops[3][0x12] = 0
      const x = await dx.take(`${DIR}/level-${l}.wav`, v, 48, 0.8, { tailS: 0.1 })
      const env = envelope(x, 0.005)
      const at = env.indexOf(Math.max(...env)) * 0.005 * RATE
      const w = x.subarray(at + 0.05 * RATE, at + 0.45 * RATE)
      const h = harmonics(averageCycle(w, period(w, RATE / noteHz(48))), 8).amp
      const rel = (k: number) => db(h[k - 1] / h[0])
      console.log(`  level ${String(l).padStart(3)}: H2 ${rel(2).toFixed(1)} dB, H3 ${rel(3).toFixed(1)} dB, H4 ${rel(4).toFixed(1)} dB, H5 ${rel(5).toFixed(1)} dB`)
      appendFileSync(`${DIR}/curves.jsonl`, JSON.stringify({ curve: 'level', level: l, h: h.map((a) => db(a / h[0])) }) + '\n')
    }
  }
} finally {
  dx.close()
}
