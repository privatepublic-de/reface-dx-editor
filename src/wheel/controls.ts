// What the controls next to the wheel do to a voice (PLAN §8.3). In place, by role: a carrier's level is loudness,
// a modulator's brightness. Brightness, treble and length are the style editor's, tuned on the DX (docs/SOUND.md);
// complexity, motion, register and play are the volca fm generator's, on the reface's four operators and its own
// modulation: an LFO with an amplitude depth per operator, pitch modulation and the pitch EG switched per operator,
// velocity 0–127 per operator, the part mode and portamento in the voice.
import { ALGORITHMS } from '../params/algorithms'
import { MODE_BYTE, type Colour, type Mode, type Space } from '../style/choices'
import type { Rng } from '../style/random'
import type { Voice } from '../sysex/codec'
import { applyBrightness as styleBrightness, applyEvolving, applyTreble as styleTreble, COLOUR_FX, SPACE_FX, type Roles } from '../style/transforms'
import type { Register, Tonality } from './choices'
import { byImportance } from './layout'
import { clamp, isNoiseOp, level, pitchBlipBy, ratio, roles, setLevel, setRatio, sounding } from './transforms'

/** The sounding carriers and modulators, noise operators left out of both (they only work as they are). */
const tonal = (v: Voice): Roles => {
  const r = roles(v)
  return { carriers: r.carriers.filter((op) => !isNoiseOp(v, op)), modulators: r.modulators }
}

/** Mellow (−1) … bright (+1): the style editor's, measured (style/transforms.ts). */
export const applyBrightness = (v: Voice, b: number) => styleBrightness(v, tonal(v), b)
/** Tamer (−1) … brighter (+1) up the keyboard: the style editor's. */
export const applyTreble = (v: Voice, t: number) => styleTreble(v, tonal(v), t)

/** How many operators sound for complexity 0 … ½: two, then three, then the tonalities' own. */
export const targetOperators = (complexity: number) => (complexity < 0.5 ? 2 + Math.floor(complexity * 4) : 4)

/** Pure (0) … dense (1). Below ½ operators fall silent, the least important first, but each pin keeps its most
 *  important pair (`owned`: per tonality, its operators). Above, silent operators come in where the algorithm has a
 *  place for them (a gentle modulator at a whole ratio, or a carrier an octave up), and the modulation deepens,
 *  up to 12 levels. In place. */
export function applyComplexity(v: Voice, complexity: number, rng: Rng, owned: readonly (readonly number[])[]) {
  const x = Math.max(0, Math.min(1, complexity))
  if (x < 0.5) {
    const keep = new Set(owned.flatMap((ops) => byImportance(v).filter((op) => ops.includes(op)).slice(0, 2)))
    const order = byImportance(v)
    for (const op of [...order].reverse()) {
      if (order.filter((o) => sounding(v, o)).length <= targetOperators(x)) break
      if (!keep.has(op)) setLevel(v, op, 0)
    }
    return
  }
  const d = (x - 0.5) * 2
  if (!d) return
  const a = ALGORITHMS[v.common[0x10]]
  for (let op = 0; op < 4; op++) {
    if (sounding(v, op) || !rng.chance(d)) continue
    const into = a.modulations.filter(([from]) => from === op).map(([, to]) => to).find((to) => sounding(v, to))
    const o = v.ops[op]
    if (into !== undefined) {
      // a gentle modulator at a whole ratio to what it modulates, with its envelope
      setRatio(v, op, (ratio(v, into) ?? 1) * rng.pick([1, 2, 3]))
      o.set(v.ops[into].subarray(0x01, 0x09), 0x01)
      setLevel(v, op, 40 + 30 * d)
    } else if (a.carriers.includes(op) && !a.modulations.some(([, to]) => to === op && sounding(v, to))) {
      // a carrier alone an octave above the main one, quieter, with its envelope
      const main = byImportance(v)[0]
      if (main === undefined) continue
      setRatio(v, op, (ratio(v, main) ?? 1) * 2)
      o.set(v.ops[main].subarray(0x01, 0x09), 0x01)
      setLevel(v, op, level(v, main) - 20)
    } else continue
    o[0x00] = 1
    o[0x13] = 0
    o[0x10] = 0
  }
  for (const op of tonal(v).modulators) setLevel(v, op, level(v, op) + 12 * d)
}

/** Still (0) … alive (1): carriers detuned apart (a shimmer), the modulators' later stages drifting and a slow
 *  triangle LFO on their level (the style editor's Evolving). A voice with its own vibrato keeps its LFO: then the
 *  drift and the shimmer only. In place. */
export function applyMotion(v: Voice, m: number, rng: Rng) {
  const x = Math.max(0, Math.min(1, m))
  if (!x) return
  const r = tonal(v)
  r.carriers.forEach((op, i) => {
    const apart = (i % 2 ? 1 : -1) * Math.round(3 + 12 * x)
    if (Math.abs(apart) > Math.abs(v.ops[op][0x18] - 64)) v.ops[op][0x18] = clamp(64 + apart)
  })
  // a voice with vibrato keeps its LFO: the drift works on the operators, the LFO settings go to a copy
  const lfo = v.common[0x14] > 0 ? { common: v.common.slice(), ops: v.ops } : v
  applyEvolving(lfo, r, x, rng)
}

/** Transpose per register: an octave or two down or up; lead as mid. */
const TRANSPOSE: Record<Register, number> = { sub: -24, bass: -12, mid: 0, lead: 0, high: 12 }

/** Where on the keyboard the voice sits (transpose, ±24 at most); lead plays one note at a time and glides (unless a
 *  mode is chosen), with a delayed vibrato if it has none. In place. */
export function applyRegister(v: Voice, r: Register | null, mode: Mode | null) {
  if (!r) return
  v.common[0x0c] = clamp(0x40 + TRANSPOSE[r], 0x28, 0x58)
  if (r !== 'lead') return
  if (!mode) {
    v.common[0x0d] = MODE_BYTE.legato
    v.common[0x0e] = Math.max(v.common[0x0e], 25)
  }
  if (!v.common[0x14]) {
    v.common.set([0, 85, 70, 8], 0x11)
    for (const op of roles(v).carriers) v.ops[op][0x0f] = 1
  }
}

/** How much a voice answers to velocity, 0 … 1: its sounding operators' sensitivity, the modulators' (brightness)
 *  against 110 and the carriers' (loudness) against 45. Measured, a sensitivity of 127 takes 0.375 dB a velocity
 *  step (docs/SOUND.md), so 45 on a carrier is ~10 dB between velocity 40 and 127. */
export function touchOf(v: Voice): number {
  const { carriers, modulators } = tonal(v)
  const parts = [...modulators.map((op) => v.ops[op][0x11] / 110), ...carriers.map((op) => v.ops[op][0x11] / 45)]
  return parts.length ? Math.min(1, parts.reduce((a, b) => a + b, 0) / parts.length) : 0
}

/** Velocity to `x` (null: as the voice is): every sounding operator's sensitivity moves by the same share of its
 *  range, the carriers less (loudness) than the modulators (brightness), so a piano's balance between its hammer and
 *  its body stays; 0 turns it off. In place. */
export function applyVelocity(v: Voice, x: number | null) {
  if (x === null) return
  const { carriers, modulators } = tonal(v)
  // none is none: every note alike
  if (x <= 0) {
    for (const op of [...carriers, ...modulators]) v.ops[op][0x11] = 0
    return
  }
  const step = Math.min(1, x) - touchOf(v)
  for (const op of modulators) v.ops[op][0x11] = clamp(v.ops[op][0x11] + 110 * step)
  for (const op of carriers) v.ops[op][0x11] = clamp(v.ops[op][0x11] + 45 * step)
}

/** A short pitch fall into each note on the carriers: two semitones, at once back. In place. */
export const applyPitchAccent = (v: Voice) => pitchBlipBy(v, 'above', 1)

/** Each tonality's own space, as the style families have theirs. */
export const TONALITY_SPACE: Record<Tonality, Space> = {
  noise: 'room', metallic: 'hall', bell: 'hall', glass: 'hall', tine: 'room', wooden: 'room',
  organ: 'room', warm: 'room', reed: 'room', brass: 'room', string: 'hall', breath: 'room',
}

/** The DX's two effect slots: slot 1 the colour (clean when none), slot 2 the space. In place. */
export function applyEffects(v: Voice, colour: Colour | null, space: Space) {
  v.common.set(COLOUR_FX[colour ?? 'clean'], 0x1d)
  v.common.set(SPACE_FX[space], 0x20)
}
