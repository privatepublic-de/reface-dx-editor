// The wheel's generator (PLAN §8.4 step 2): (choices, seed) → voice, pure and deterministic. The heaviest pin builds
// the skeleton, its distance from the centre deepens or softens it, then the envelope shape and a name. The other
// pins (branches, grafts, transforms) come in step 3; loudness and audibility once the DX's level and feedback
// curves are recorded (docs/SOUND.md), so nothing here renders the voice yet.
import { isCarrier } from '../params/algorithms'
import { ratioOf } from '../params/display'
import { setVoiceName, type Voice } from '../sysex/codec'
import { rng as makeRng } from '../style/random'
import { applyShape, applyTransients } from '../style/shapes'
import { applyLength, rolesOf } from '../style/transforms'
import { mixOf, TONALITIES, type MixPart, type Tonality, type WheelChoices } from './choices'
import { buildSkeleton, fastOps, TONALITY_DEFS } from './tonalities'

export interface WheelOptions {
  seed: number
  /** 0 typical (near the skeleton's middle) … 1 wild (anywhere in its ranges) */
  wild?: number
}

export interface WheelVoice {
  voice: Voice
  /** the tonalities as read from the pins, heaviest first */
  mix: MixPart[]
  /** the tonality each operator belongs to (0–3), for drawing */
  opTonality: Tonality[]
}

/** How far a voice strays from its skeleton at wild 0 and 1. */
const spreadOf = (wild: number) => 0.3 + 0.7 * Math.max(0, Math.min(1, wild))

const clamp = (x: number) => Math.max(0, Math.min(127, Math.round(x)))

/** A noise operator: square feedback near the top. Intensity and brightness leave it alone: it only works there. */
export const isNoiseOp = (v: Voice, op: number) => v.ops[op][0x14] === 1 && v.ops[op][0x13] >= 112

export function generateWheel(c: WheelChoices, { seed, wild = 0 }: WheelOptions): WheelVoice {
  const rng = makeRng(seed)
  const spread = spreadOf(wild)
  const mix = mixOf(c.pins)
  // no pins: a tonality picked by the seed, as it comes
  if (!mix.length) mix.push({ tonality: rng.pick(TONALITIES), weight: 1, intensity: 0.5 })
  const dominant = mix[0]
  const { skeleton } = TONALITY_DEFS[dominant.tonality]

  const v = buildSkeleton(skeleton, rng, spread)
  applyShape(v, c.shape ?? skeleton.shape, rng, spread)
  applyTransients(v, fastOps(skeleton))
  if (skeleton.pitchBlip && (c.shape ?? skeleton.shape) !== 'swell') applyPitchBlip(v, skeleton.pitchBlip)
  applyLength(v, skeleton.length ?? 0)
  applyIntensity(v, dominant.intensity)

  setVoiceName(v, wheelName(mix))
  return { voice: v, mix, opTonality: v.ops.map(() => dominant.tonality) }
}

/** A pin's distance from the centre, 0 … 1 (½ the tonality as it comes): the depth of its modulation, mild to
 *  extreme. Every sounding modulator ±24 levels (about ±9 dB, docs/SOUND.md), the feedback ±20; noise operators
 *  stay. Without modulators (the organ) the drawbars above the loudest move instead, the higher the further. */
export function applyIntensity(v: Voice, intensity: number) {
  const x = (Math.max(0, Math.min(1, intensity)) - 0.5) * 2
  if (!x) return
  const { carriers, modulators } = rolesOf(v)
  const mods = modulators.filter((op) => v.ops[op][0x12] > 0 && !isNoiseOp(v, op))
  for (const op of mods) v.ops[op][0x12] = clamp(v.ops[op][0x12] + 24 * x)
  if (!mods.length) {
    const ratios = carriers.map((op) => (v.ops[op][0x15] ? 1 : ratioOf(v.ops[op][0x16], v.ops[op][0x17])))
    const loudest = carriers.reduce((m, op, i) => (v.ops[op][0x12] > v.ops[carriers[m]][0x12] ? i : m), 0)
    carriers.forEach((op, i) => {
      const up = Math.log2(ratios[i] / ratios[loudest])
      if (up > 0 && v.ops[op][0x12] > 0) v.ops[op][0x12] = clamp(v.ops[op][0x12] + 14 * up * x)
    })
  }
  for (let op = 0; op < 4; op++) {
    const o = v.ops[op]
    if (o[0x13] && !isNoiseOp(v, op) && o[0x12] > 0) o[0x13] = Math.min(110, clamp(o[0x13] + 20 * x))
  }
}

/** A short pitch fall (from above) or scoop (from below) into the note on the carriers: two semitones, at once
 *  back. In place. */
export function applyPitchBlip(v: Voice, from: 'above' | 'below') {
  v.common.set([100, 127, 127, 127, 64, 64, 64, from === 'above' ? 66 : 62], 0x15)
  for (let op = 0; op < 4; op++) v.ops[op][0x10] = isCarrier(v.common[0x10], op) ? 1 : 0
}

/** The name, within the DX's 10 characters: the dominant tonality's noun, with the next one's adjective in front
 *  when it fits ("Airy Bell", "Reedy Sine"). */
export function wheelName(mix: readonly MixPart[]): string {
  const noun = TONALITY_DEFS[mix[0].tonality].noun
  const next = mix.find((p) => p.tonality !== mix[0].tonality && TONALITY_DEFS[p.tonality].adjective !== noun)
  const name = next ? `${TONALITY_DEFS[next.tonality].adjective} ${noun}` : noun
  return name.length <= 10 ? name : noun
}
