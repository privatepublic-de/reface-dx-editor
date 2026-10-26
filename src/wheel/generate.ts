// The wheel's generator (PLAN §8.4 steps 2–3): (choices, seed) → voice, pure and deterministic. The heaviest pin
// builds the skeleton and its distance from the centre deepens or softens it; then the envelope shape. Every other
// pin comes in by its share of the heaviest one's weight: light, it colours the base (a transform); from a quarter, a
// voice of its own (a pair, or one operator whose feedback carries it) or, up to 60 % for the tonalities that have
// one, a modulator grafted into the base's carrier: a hybrid rather than a layer. Last, the voice is made audible
// and as loud as every other, measured with the probe engine (loudness.ts).
import { ALGORITHMS, isCarrier } from '../params/algorithms'
import { ratioOf } from '../params/display'
import { setVoiceName, type Voice } from '../sysex/codec'
import { MODE_BYTE } from '../style/choices'
import { rng as makeRng, type Rng } from '../style/random'
import { applyShape, applyTransients, type Envelope } from '../style/shapes'
import { applyLength, rolesOf } from '../style/transforms'
import { mixOf, TONALITIES, type MixPart, type Tonality, type WheelChoices } from './choices'
import { applyBrightness, applyComplexity, applyEffects, applyMotion, applyPitchAccent, applyRegister, applyTreble, applyVelocity, TONALITY_SPACE } from './controls'
import { applyLayout, byImportance, findLayout, type Layout, type Need } from './layout'
import { ensureAudible, levelLoudness, rescue, SILENT_DB } from './loudness'
import { applyOpSpec, buildSkeleton, fastOps, TONALITY_DEFS, type OpSpec } from './tonalities'
import { clamp, isNoiseOp, level, ratio, roles as rolesNow, setLevel, setRatio, sounding, transientBy, TRANSFORMS } from './transforms'

export { isNoiseOp }

export interface WheelOptions {
  seed: number
  /** 0 typical (near the skeleton's middle) … 1 wild (anywhere in its ranges) */
  wild?: number
}

export type PinRole = 'skeleton' | 'branch' | 'solo' | 'graft' | 'transform'

export interface WheelVoice {
  voice: Voice
  /** the tonalities as read from the pins, heaviest first */
  mix: MixPart[]
  /** how each tonality came in, in the mix's order */
  roles: { tonality: Tonality; as: PinRole }[]
  /** the tonality each operator (0–3) belongs to, null for a silent one: for drawing */
  opTonality: (Tonality | null)[]
  /** the loudest 20 ms of a held C4 in the probe engine, dB (loudness.ts TARGET_DB when levelled) */
  loudness: number
}

/** How far a voice strays from its skeleton at wild 0 and 1. */
const spreadOf = (wild: number) => 0.3 + 0.7 * Math.max(0, Math.min(1, wild))
/** A secondary pin needs this share of the heaviest one's weight to get operators of its own. */
export const BRANCH_SHARE = 0.25
/** Up to this share a tonality that can be grafted goes into the base's tone instead. */
export const GRAFT_UNTIL = 0.6
/** dB per level step (docs/SOUND.md, fitted on the modulator depth): to balance a branch against the base. */
const LEVEL_STEP_DB = 0.39

export function generateWheel(c: WheelChoices, { seed, wild = 0 }: WheelOptions): WheelVoice {
  const rng = makeRng(seed)
  const spread = spreadOf(wild)
  const mix = mixOf(c.pins)
  // no pins: a tonality picked by the seed, as it comes
  if (!mix.length) mix.push({ tonality: rng.pick(TONALITIES), weight: 1, intensity: 0.5 })
  const [dominant, ...rest] = mix
  const { skeleton } = TONALITY_DEFS[dominant.tonality]

  const v = buildSkeleton(skeleton, rng, spread)
  const shape = c.shape ?? skeleton.shape
  applyShape(v, shape, rng, spread)
  applyTransients(v, fastOps(skeleton))
  if (skeleton.pitchBlip && shape !== 'swell') applyPitchBlip(v, skeleton.pitchBlip)
  // a chosen length takes the place of the tonality's own
  applyLength(v, c.length || (skeleton.length ?? 0))
  applyIntensity(v, dominant.intensity)

  const roles: WheelVoice['roles'] = [{ tonality: dominant.tonality, as: 'skeleton' }]
  let opTonality: (Tonality | null)[] = v.ops.map((_, op) => (sounding(v, op) ? dominant.tonality : null))
  // the skeleton's free branches give way cheaply; once used or renumbered, they're followed by their numbers
  let spare = (skeleton.branches ?? []).flat()
  for (const part of rest) {
    const share = Math.min(1, part.weight / dominant.weight)
    const placed = share >= BRANCH_SHARE ? place(v, part, share, opTonality, spare, c.shape, rng, spread) : null
    if (placed) {
      const { layout, as } = placed
      opTonality = remap(opTonality, layout)
      for (const op of layout.ops) opTonality[op] = part.tonality
      spare = spare.filter((op) => !layout.ops.includes(layout.perm[op]) && !layout.given.includes(op)).map((op) => layout.perm[op])
      roles.push({ tonality: part.tonality, as })
    } else {
      TRANSFORMS[part.tonality](v, colourAmount(part, share), rng)
      roles.push({ tonality: part.tonality, as: 'transform' })
    }
  }
  // the controls; complexity keeps each pin's most important pair
  const owned = [...new Set(opTonality.filter((t): t is Tonality => t !== null))].map((t) => [0, 1, 2, 3].filter((op) => opTonality[op] === t))
  applyBrightness(v, c.brightness)
  applyComplexity(v, c.complexity, rng, owned)
  applyMotion(v, c.motion, rng)
  applyRegister(v, c.register, c.mode)
  if (c.mode) v.common[0x0d] = MODE_BYTE[c.mode]
  applyVelocity(v, c.velocity)
  if (c.pitchAccent) applyPitchAccent(v)
  applyTreble(v, c.treble)
  applyEffects(v, c.colour, c.space ?? TONALITY_SPACE[dominant.tonality])

  // heard, and as loud as the others
  ensureAudible(v)
  let loudness = levelLoudness(v)
  if (loudness < SILENT_DB) {
    rescue(v, ALGORITHMS[v.common[0x10]].carriers[0])
    loudness = levelLoudness(v)
  }
  for (let op = 0; op < 4; op++) opTonality[op] = sounding(v, op) ? (opTonality[op] ?? dominant.tonality) : null

  setVoiceName(v, wheelName(mix))
  return { voice: v, mix, roles, opTonality, loudness }
}

/** The tonalities as the layout renumbers the operators. */
function remap(opTonality: (Tonality | null)[], l: Layout): (Tonality | null)[] {
  const out: (Tonality | null)[] = [null, null, null, null]
  opTonality.forEach((t, x) => { if (!l.given.includes(x)) out[l.perm[x]] = t })
  return out
}

/** A secondary pin into operators of its own, or null when it only colours. In order of preference: a graft while
 *  it is lighter than GRAFT_UNTIL (if its tonality has one); a pair in operators the base can spare; one operator
 *  alone; a pair at the cost of the base's least important operators; a graft after all. The base keeps its main
 *  carrier with its deepest modulator, and earlier pins keep theirs. In place. */
function place(v: Voice, part: MixPart, share: number, opTonality: readonly (Tonality | null)[], spare: number[], shape: Envelope | null, rng: Rng, spread: number) {
  const def = TONALITY_DEFS[part.tonality]
  const base = opTonality[byImportance(v)[0]] ?? null
  const main = byImportance(v).filter((op) => opTonality[op] === base)
  const protect = [...main.slice(0, 2), ...[0, 1, 2, 3].filter((op) => opTonality[op] && opTonality[op] !== base)]
  const target = main.find((op) => isCarrier(v.common[0x10], op))
  const graftNeed: Need | null = def.graft && target !== undefined ? { kind: 'graft', into: target } : null
  const cheap = (l: Layout | null) => (l && l.given.every((op) => spare.includes(op)) ? l : null)
  const tries: [PinRole, () => Layout | null][] = [
    ...(graftNeed && share < GRAFT_UNTIL ? [['graft', () => findLayout(v, graftNeed, protect, spare)] as [PinRole, () => Layout | null]] : []),
    ['branch', () => cheap(findLayout(v, { kind: 'pair' }, protect, spare))],
    ['solo', () => findLayout(v, { kind: 'solo' }, protect, spare)],
    ['branch', () => findLayout(v, { kind: 'pair' }, protect, spare)],
    ...(graftNeed ? [['graft', () => findLayout(v, graftNeed, protect, spare)] as [PinRole, () => Layout | null]] : []),
  ]
  for (const [as, find] of tries) {
    const layout = find()
    if (!layout) continue
    const into = as === 'graft' && target !== undefined ? layout.perm[target] : -1
    applyLayout(v, layout)
    if (as === 'graft') graft(v, part, share, layout.ops[0], into, rng)
    else fillBranch(v, part, share, layout.ops, shape, rng, spread)
    return { layout, as }
  }
  return null
}

/** A secondary tonality as a voice of its own: a pair (carrier and modulator) or one carrier alone (`solo`, its
 *  feedback carrying the tonality), as loud against the base's carriers together as its share (power share², so
 *  at equal weights the two are equal), its own envelope unless a shape is chosen. In place. */
function fillBranch(v: Voice, part: MixPart, share: number, ops: number[], shape: Envelope | null, rng: Rng, spread: number) {
  const { branch, skeleton } = TONALITY_DEFS[part.tonality]
  const [carrier, modulator] = ops
  const specs: OpSpec[] = modulator === undefined ? [branch.solo] : [branch.carrier, branch.modulator]
  specs.forEach((s, i) => applyOpSpec(v, ops[i], s, rng, spread))
  for (const op of ops) {
    v.ops[op][0x10] = 0
    v.ops[op][0x0f] = skeleton.vibrato && v.common[0x14] ? 1 : 0
  }
  balance(v, carrier, share)
  // its radius: ±24 on its modulator, or ±20 on a lone carrier's feedback
  const x = (Math.max(0, Math.min(1, part.intensity)) - 0.5) * 2
  if (modulator !== undefined) setLevel(v, modulator, level(v, modulator) + 24 * x)
  else if (!isNoiseOp(v, carrier) && v.ops[carrier][0x13]) v.ops[carrier][0x13] = Math.min(110, clamp(v.ops[carrier][0x13] + 20 * x))
  // the branch's envelopes: its tonality's own shape, by role in this algorithm
  const tmp = { common: v.common.slice(), ops: v.ops.map((o) => o.slice()) as Voice['ops'] }
  applyShape(tmp, shape ?? skeleton.shape, rng, spread)
  for (const op of ops) v.ops[op].set(tmp.ops[op].subarray(0x01, 0x09), 0x01)
  specs.forEach((s, i) => { if (s.fast) transientBy(v, ops[i], 1) })
}

/** The branch carrier against the base's other sounding carriers: its power to theirs as share². The branch moves
 *  first (up to 127); what it can't go up, the base comes down. In place. */
function balance(v: Voice, carrier: number, share: number) {
  const power = (op: number) => 10 ** (((level(v, op) - 127) * LEVEL_STEP_DB) / 10)
  const others = rolesNow(v).carriers.filter((op) => op !== carrier)
  if (!others.length) return
  const db = 20 * Math.log10(share) + 10 * Math.log10(others.reduce((s, op) => s + power(op), 0)) - 10 * Math.log10(power(carrier))
  const up = Math.min(db / LEVEL_STEP_DB, 127 - level(v, carrier))
  setLevel(v, carrier, level(v, carrier) + up)
  const left = db / LEVEL_STEP_DB - up
  if (left > 0) for (const op of others) setLevel(v, op, level(v, op) - left)
}

/** A tonality grafted into the base: its modulator (`op`) in the base's main carrier (`into`) at its ratio to it,
 *  as deep as the share over BRANCH_SHARE … GRAFT_UNTIL and ±24 by radius, with the carrier's envelope; for noise
 *  a square wave roughens the carrier. In place. */
function graft(v: Voice, part: MixPart, share: number, op: number, into: number, rng: Rng) {
  const spec = TONALITY_DEFS[part.tonality].graft!
  const o = v.ops[op]
  o[0x00] = 1
  setRatio(v, op, (ratio(v, into) ?? 1) * rng.pick(spec.ratio))
  const t = Math.max(0, Math.min(1, (share - BRANCH_SHARE) / (GRAFT_UNTIL - BRANCH_SHARE)))
  const x = (Math.max(0, Math.min(1, part.intensity)) - 0.5) * 2
  setLevel(v, op, spec.level[0] + (spec.level[1] - spec.level[0]) * t + 24 * x)
  o.set(v.ops[into].subarray(0x01, 0x09), 0x01)
  o[0x0f] = v.ops[into][0x0f]
  o[0x10] = 0
  o[0x11] = spec.velocity ?? 0
  if (spec.fast) transientBy(v, op, 1)
  if (spec.noise) {
    o[0x13] = 127
    o[0x14] = 1
  }
}

/** How far a light pin colours the voice, 0 … 1: its share by the square root (a light pin is heard) times its
 *  radius around the middle (a quarter at the centre, 1¾ at the rim). Noise has its own, gentler curve. As the
 *  volca generator has it, to check by ear on the DX. */
function colourAmount(part: MixPart, share: number): number {
  if (part.tonality === 'noise') return Math.min(1, share * (0.4 + 0.6 * part.intensity))
  return Math.min(1, Math.sqrt(share) * (0.25 + 1.5 * part.intensity))
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
  // the reface starts each note at L1 (measured): from there back to the note at R2 (42: ~30 ms)
  v.common.set([127, 42, 127, 127, from === 'above' ? 66 : 62, 64, 64, 64], 0x15)
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
