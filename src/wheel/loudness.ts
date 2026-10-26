// Every voice from the wheel about as loud as every other, and every one heard (PLAN §8.4): render a held note with
// the probe engine (measured on the DX, docs/SOUND.md), and move all carriers' output levels together. Built after
// the volca fm generator's loudness.ts, on the reface's numbers: 0.375 dB a level step down to 32, the output
// divided by the number of carriers (so a four-carrier organ has the least room), feedback that doesn't change
// with the level (so moving a carrier changes its loudness only).
import { envelope, toDb } from '../engine/measure'
import { renderNote } from '../engine/render'
import { TUNING } from '../engine/tables'
import { initVoice } from '../params/init'
import { cloneVoice, type Voice } from '../sysex/codec'
import { level, roles, setLevel } from './transforms'

/** Low enough to be quick (a few ms a voice), high enough for the level of most sounds. */
const SAMPLE_RATE = 16000
/** Output levels from here up are 0.375 dB a step (docs/SOUND.md): the levelling keeps carriers there. */
const LOWEST = 32

/** The loudest 20 ms of a note held at C4 at velocity 100, in dB. Measured on a copy whose slow rates (R1–R3) are
 *  made quick: the same levels, reached within a third of a second, so a slow pad measures what it grows to. */
export function loudness(v: Voice, note = 60): number {
  const quick = cloneVoice(v)
  for (const o of quick.ops) for (let i = 0x01; i <= 0x03; i++) o[i] = Math.max(o[i], 60)
  const samples = renderNote(quick, { note, sampleRate: SAMPLE_RATE, holdSeconds: 1 })
  let max = 0
  for (const x of envelope({ samples, sampleRate: SAMPLE_RATE }, 0.02)) max = Math.max(max, x)
  return toDb(max)
}

/** What voices aim at: VOICE INIT's sine at full level, 10 dB down. The wheel's voices come out between 0 and
 *  12 dB below it before levelling; the four-carrier organ can just reach it. */
export const TARGET_DB = (() => {
  const sine = cloneVoice(initVoice())
  sine.ops[0][0x12] = 127
  return loudness(sine) - 10
})()
/** Quieter than this is not heard. */
export const SILENT_DB = TARGET_DB - 30

/** Every sounding carrier moved by the same number of steps towards the target, between level 32 and 127. One
 *  render is enough unless a carrier hit an end: then measure again and correct once more. In place; returns the
 *  loudness reached. */
export function levelLoudness(v: Voice): number {
  let db = loudness(v)
  for (let pass = 0; pass < 2; pass++) {
    const steps = Math.round((TARGET_DB - db) / TUNING.levelStepDb)
    if (Math.abs(steps) < 2) break
    let exact = true
    for (const op of roles(v).carriers) {
      const wanted = level(v, op) + steps
      const clamped = Math.max(Math.min(LOWEST, level(v, op)), Math.min(127, wanted))
      if (clamped !== wanted) exact = false
      setLevel(v, op, clamped)
    }
    if (exact) return db + steps * TUNING.levelStepDb
    db = loudness(v)
  }
  return db
}

/** Some carrier is heard: on, a level that's heard (70: −21 dB) and an envelope that rises to at least 48 (−17 dB).
 *  The cheap check before rendering; in place. */
export function ensureAudible(v: Voice) {
  const { carriers } = roles(v)
  const heard = (op: number) => level(v, op) >= 70 && Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) >= 48
  if (carriers.some(heard)) return
  const op = carriers.reduce((a, x) => (level(v, x) > level(v, a) ? x : a), carriers[0] ?? 0)
  v.ops[op][0x00] = 1
  setLevel(v, op, Math.max(level(v, op), 100))
  if (Math.max(v.ops[op][0x05], v.ops[op][0x06], v.ops[op][0x07]) < 48) v.ops[op][0x05] = 127
}

/** When the engine still hears nothing: the first carrier on, at full level, with a plain envelope. In place. */
export function rescue(v: Voice, carrier: number) {
  const o = v.ops[carrier]
  o[0x00] = 1
  o[0x12] = 127
  o.set([127, 60, 40, 60, 127, 110, 100, 0], 0x01)
}
