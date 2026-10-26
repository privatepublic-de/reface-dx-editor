// The whole-voice probes (PLAN §8, the calibration gate's second half): which voices tools/voiceProbe.ts plays on
// the DX and renders in the engine, and what it measures, shared with the tests and experiments.
import { fixedBytes } from '../src/params/display'
import { initVoice } from '../src/params/init'
import { cloneVoice, type Voice } from '../src/sysex/codec'
import { angleOf, TONALITIES, type Tonality } from '../src/wheel/choices'
import { generateWheel } from '../src/wheel/generate'
import { db, envelope, noteHz, RATE, rms, spectrum } from './dxAudio'

export interface Probe {
  group: string
  label: string
  voice: Voice
  note: number
  holdS: number
}

/** OP2 → OP1 at 1 : 1 (algorithm 1, OP3/4 off), OP2 with a shaped wave. */
function shaped(level: number, square: boolean): Voice {
  const v = cloneVoice(initVoice())
  v.common[0x10] = 0
  v.ops[0].set([127, 127, 127, 127, 127, 127, 127, 0], 0x01)
  v.ops[0][0x12] = 127
  v.ops[1].set([127, 127, 127, 127, 127, 127, 127, 0], 0x01)
  v.ops[1][0x12] = level
  v.ops[1][0x13] = 127
  v.ops[1][0x14] = square ? 1 : 0
  v.ops[2][0x12] = 0
  v.ops[3][0x12] = 0
  return v
}

const wheel = (pins: [Tonality, number][], shape: 'gate' | null = null) =>
  generateWheel({ pins: pins.map(([t, weight]) => ({ angle: angleOf(t), radius: 0.5, weight })), shape }, { seed: 1 })

/** The probes of `groups` (all when empty): shaped, tonalities, noise. */
export function probes(groups: readonly string[] = []): Probe[] {
  const want = (g: string) => !groups.length || groups.includes(g)
  const out: Probe[] = []
  if (want('shaped')) for (const square of [false, true]) for (const level of [50, 70, 90, 110]) {
    out.push({ group: 'shaped', label: `${square ? 'square' : 'saw'} mod ${level}`, voice: shaped(level, square), note: 48, holdS: 0.8 })
  }
  if (want('tonalities')) for (const t of TONALITIES) {
    out.push({ group: 'tonalities', label: t, voice: wheel([[t, 1]]).voice, note: 60, holdS: 1.2 })
  }
  if (want('noise')) {
    const g = wheel([['metallic', 1], ['noise', 0.4]], 'gate')
    const op = g.opTonality.indexOf('noise')
    for (const level of [0, 80, 100, 112, 124]) {
      const v = cloneVoice(g.voice)
      v.ops[op][0x12] = level
      out.push({ group: 'noise', label: `metal + noise graft ${level}`, voice: v, note: 48, holdS: 0.8 })
    }
    out.push({ group: 'noise', label: 'noise alone', voice: wheel([['noise', 1]], 'gate').voice, note: 48, holdS: 0.8 })
  }
  if (want('noisegap')) {
    // the FM noise voice taken apart: a carrier with or without square feedback, modulated by a sine or by a square
    // (feedback 127) at a fixed or a 1 : 1 frequency, at a moderate and a deep level
    for (const carrierFb of [0, 127]) for (const modFb of [0, 127]) for (const [fixed, level] of [[0, 100], [1, 100], [1, 124]] as const) {
      const v = cloneVoice(initVoice())
      v.common[0x10] = 4 // algorithm 5: OP2–4 each into OP1
      v.ops.forEach((o) => o.set([127, 127, 127, 127, 127, 127, 127, 0], 0x01))
      v.ops[0][0x12] = 118
      v.ops[0].set([carrierFb, 1], 0x13)
      v.ops[1][0x12] = level
      v.ops[1].set([modFb, 1], 0x13)
      if (fixed) v.ops[1].set([1, ...fixedBytes(3000)], 0x15)
      v.ops[2][0x12] = 0
      v.ops[3][0x12] = 0
      out.push({ group: 'noisegap', label: `c${carrierFb} m${modFb} ${fixed ? '3k' : '1to1'} ${level}`, voice: v, note: 48, holdS: 0.8 })
    }
  }
  if (want('mixes')) for (const [a, b, w] of [['bell', 'warm', 0.5], ['tine', 'reed', 0.8], ['organ', 'breath', 0.5], ['metallic', 'noise', 0.4], ['string', 'glass', 0.4], ['wooden', 'bell', 0.4]] as [Tonality, Tonality, number][]) {
    out.push({ group: 'mixes', label: `${a} + ${b} ${w}`, voice: wheel([[a, 1], [b, w]]).voice, note: 60, holdS: 1.2 })
  }
  return out
}

/** Measured from the onset: loudness, brightness and noisiness 50–450 ms in, the envelope at four times, and the
 *  loudest 20 ms (`peakDb`, what the wheel's levelling aims at). */
export function measure(x: Float64Array, note: number) {
  const env = envelope(x, 0.005)
  const top = Math.max(...env)
  const on = env.findIndex((e) => e > top * 0.05) * 0.005 * RATE
  const w = x.subarray(on + 0.05 * RATE, on + 0.45 * RATE)
  const { hz, amp } = spectrum(w, 8192)
  let sum = 0
  let weighted = 0
  let logSum = 0
  let flatSum = 0
  let n = 0
  hz.forEach((f, k) => {
    if (f < 20 || f > 16000) return
    sum += amp[k]
    weighted += amp[k] * f
    if (f < 200 || f > 12000) return
    const p = amp[k] ** 2 + 1e-20
    logSum += Math.log(p)
    flatSum += p
    n++
  })
  const at = (s: number) => db(rms(x, on + s * RATE, on + (s + 0.05) * RATE) / (top + 1e-12))
  const blocks = envelope(x, 0.02)
  return {
    db: db(rms(w)),
    peakDb: db(Math.max(...blocks)),
    centroidH: weighted / sum / noteHz(note),
    flatness: Math.exp(logSum / n) / (flatSum / n),
    env: [0.05, 0.3, 0.6, 0.9].map(at),
  }
}

