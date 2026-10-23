// Init, Adjust, Randomize and Mutate with a style (PLAN §7.2). All pure: (voice, choices, seed) → voice.
// The pipeline: family template → envelope shape → the template's transients → characters (in their fixed
// order) → brightness → treble → length, evolving, expressive → effects → something audible → name.
import { COMMON_PARAMS } from '../params/common'
import { initVoice } from '../params/init'
import { OPERATOR_PARAMS } from '../params/operator'
import { cloneVoice, setVoiceName, type Voice } from '../sysex/codec'
import { CHARACTERS, FAMILIES, isEmpty, type Character, type Family, type Space, type StyleChoices } from './choices'
import { rng as makeRng, type Rng } from './random'
import { applyShape, applyTransients } from './shapes'
import { buildTemplate, TEMPLATES, transients } from './templates'
import {
  applyBrightness, applyDrive, applyEffects, applyEvolving, applyExpressive, applyLength, applyTreble, CHARACTER_TRANSFORMS, ensureAudible, rolesOf,
} from './transforms'

/** How far a new voice strays from a template's middle: at variation 0 (typical) and 1 (wild). */
export const INIT_SPREAD = 0.3
export const RANDOM_SPREAD = 1
const spreadOf = (variation: number) => INIT_SPREAD + (RANDOM_SPREAD - INIT_SPREAD) * Math.max(0, Math.min(1, variation))

/** 'any' picks a family with the seed, before anything else is drawn. */
const familyOf = (c: StyleChoices, rng: Rng): Family | null => (c.family === 'any' ? rng.pick(FAMILIES) : c.family)

/** Everything after the template and shape: what Adjust applies to a voice that keeps its algorithm and ratios. */
function transform(v: Voice, c: StyleChoices, rng: Rng, length: number, space: Space | null) {
  const roles = rolesOf(v)
  for (const k of CHARACTERS) if (c.characters[k]) CHARACTER_TRANSFORMS[k](v, roles, c.characters[k]!, rng)
  applyDrive(v, roles, c.drive, rng)
  applyBrightness(v, roles, c.brightness)
  applyTreble(v, roles, c.treble)
  applyLength(v, length)
  applyEvolving(v, roles, c.evolving, rng)
  applyExpressive(v, roles, c.expressive)
  if (space || c.drive || Object.values(c.characters).some((a) => a)) applyEffects(v, c, space)
  ensureAudible(v, rolesOf(v))
}

function build(c: StyleChoices, family: Family | null, rng: Rng, spread: number): Voice {
  const t = family ? TEMPLATES[family] : null
  const v = t ? buildTemplate(t, rng, spread) : cloneVoice(initVoice())
  const shape = c.shape ?? t?.shape ?? null
  if (shape) applyShape(v, shape, rng, spread)
  if (t) applyTransients(v, transients(t))
  // a family brings its own length and space
  const length = c.length + (c.length ? 0 : t?.length ?? 0)
  const space = c.space ?? t?.space ?? (Object.values(c.characters).some((a) => a) || c.drive ? 'dry' : null)
  transform(v, c, rng, length, space)
  setVoiceName(v, styleName(c, family))
  return v
}

/** With keepFx, the new voice gets the effects of the voice it replaces. */
function keepEffects(v: Voice, c: StyleChoices, current?: Voice) {
  if (c.keepFx && current) v.common.set(current.common.subarray(0x1d, 0x23), 0x1d)
  return v
}

/** A new voice in the style; with nothing chosen, the plain VOICE INIT. `variation` 0 keeps to the template's
 *  middle and its first options, 1 goes anywhere in its ranges. */
export function styleInit(c: StyleChoices, seed: number, current?: Voice, variation = 0): Voice {
  if (isEmpty(c)) return keepEffects(cloneVoice(initVoice()), c, current)
  const rng = makeRng(seed)
  return keepEffects(build(c, familyOf(c, rng), rng, spreadOf(variation)), c, current)
}

/** The bytes Adjust and Mutate never blend: a halfway value is another sound. Coarse and fine go together. */
const COMMON_DISCRETE = new Set([0x0d, 0x10, 0x11, 0x1d, 0x20])
const OP_DISCRETE = new Set([0x00, 0x0c, 0x0d, 0x0f, 0x10, 0x14, 0x15])
const FREQ = [0x16, 0x17]
const NAME = 10

/** Moves `v` towards `target` by `amount` (0–1): continuous values by the amount (at least one step), discrete
 *  ones switch with that probability, so clicking Adjust again converges. */
export function blend(v: Voice, target: Voice, amount: number, rng: Rng): Voice {
  const out = cloneVoice(v)
  if (amount <= 0) return out
  const step = (cur: number, tgt: number) => {
    if (cur === tgt) return cur
    const next = Math.round(cur + (tgt - cur) * amount)
    return next === cur ? cur + Math.sign(tgt - cur) : next
  }
  for (const p of COMMON_PARAMS) {
    const [cur, tgt] = [out.common[p.offset], target.common[p.offset]]
    out.common[p.offset] = COMMON_DISCRETE.has(p.offset) ? (cur !== tgt && rng.chance(amount) ? tgt : cur) : step(cur, tgt)
  }
  out.ops.forEach((op, i) => {
    const t = target.ops[i]
    for (const p of OPERATOR_PARAMS) {
      if (FREQ.includes(p.offset)) continue
      op[p.offset] = OP_DISCRETE.has(p.offset) ? (op[p.offset] !== t[p.offset] && rng.chance(amount) ? t[p.offset] : op[p.offset]) : step(op[p.offset], t[p.offset])
    }
    if ((op[0x16] !== t[0x16] || op[0x17] !== t[0x17]) && (op[0x15] === t[0x15]) && rng.chance(amount)) op.set(t.subarray(0x16, 0x18), 0x16)
  })
  return out
}

/** Moves the current voice towards the style by `amount`. With a family: towards the voice New would make (same
 *  seed, same variation); without: the
 *  voice keeps its algorithm and ratios and gets the characters, sliders and shape. The name stays.
 *  `targetSeed` fixes where it goes (the same until Roll again), `stepSeed` is new for every click, so the switches
 *  that didn't flip this time get another chance next time. */
export function styleAdjust(v: Voice, c: StyleChoices, amount: number, targetSeed: number, stepSeed: number, variation = 0): Voice {
  const rng = makeRng(targetSeed)
  const family = familyOf(c, rng)
  let target: Voice
  if (family) target = build(c, family, rng, spreadOf(variation))
  else {
    target = cloneVoice(v)
    if (c.shape) applyShape(target, c.shape, rng, INIT_SPREAD)
    transform(target, c, rng, c.length, c.space)
  }
  if (c.keepFx) target.common.set(v.common.subarray(0x1d, 0x23), 0x1d)
  const out = blend(v, target, amount, makeRng(stepSeed))
  out.common.set(v.common.subarray(0, NAME), 0)
  ensureAudible(out, rolesOf(out))
  return out
}

/** Small random changes by `percent` (0–100): continuous values jitter by up to that share of their range; switches
 *  and ratios change rarely; the algorithm only from 50 %. The name, and with keepFx the effects, stay. */
export function mutate(v: Voice, percent: number, seed: number, keepFx = false): Voice {
  const out = cloneVoice(v)
  const p = Math.max(0, Math.min(100, percent)) / 100
  if (!p) return out
  const rng = makeRng(seed)
  const jitter = (cur: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(cur + (rng.next() * 2 - 1) * p * (hi - lo))))
  for (const q of COMMON_PARAMS) {
    if (keepFx && q.offset >= 0x1d && q.offset <= 0x22) continue
    const cur = out.common[q.offset]
    if (q.offset === 0x10) {
      if (p >= 0.5 && rng.chance(p - 0.4)) out.common[q.offset] = rng.int(q.min, q.max)
    } else if (COMMON_DISCRETE.has(q.offset)) {
      if (rng.chance(p / 2)) out.common[q.offset] = rng.int(q.min, q.max)
    } else if (rng.chance(Math.min(1, p * 1.5))) out.common[q.offset] = jitter(cur, q.min, q.max)
  }
  out.ops.forEach((op) => {
    for (const q of OPERATOR_PARAMS) {
      if (q.offset === 0x16) {
        if (rng.chance(p / 3)) op[q.offset] = Math.max(q.min, Math.min(q.max, op[q.offset] + rng.pick([-1, 1])))
      } else if (q.offset === 0x00) {
        continue // operators are never switched off by chance
      } else if (OP_DISCRETE.has(q.offset)) {
        if (rng.chance(p / 4)) op[q.offset] = rng.int(q.min, q.max)
      } else if (rng.chance(Math.min(1, p * 1.5))) op[q.offset] = jitter(op[q.offset], q.min, q.max)
    }
  })
  ensureAudible(out, rolesOf(out))
  return out
}

// ---- names: "Mellow Bass", "Hollow Pad", within the DX's 10 characters ----

const FAMILY_WORD: Record<Family, string> = { bass: 'Bass', organ: 'Organ', strings: 'Strings', pluck: 'Pluck', bell: 'Bell', epiano: 'E.Piano', brass: 'Brass', lead: 'Lead', perc: 'Perc', noise: 'Noise' }
const CHARACTER_WORD: Record<Character, string> = { analogue: 'Analog', hollow: 'Hollow', metallic: 'Metal', noisy: 'Noisy' }
const SHAPE_WORD: Partial<Record<NonNullable<StyleChoices['shape']>, string>> = { pad: 'Pad', bowed: 'Bowed', reverse: 'Rev', pluck: 'Pluck' }

export function styleName(c: StyleChoices, family: Family | null): string {
  const noun = family ? FAMILY_WORD[family] : (c.shape && SHAPE_WORD[c.shape]) || 'Voice'
  const strongest = CHARACTERS.filter((k) => c.characters[k]).sort((x, y) => (c.characters[y] ?? 0) - (c.characters[x] ?? 0))
  const words = [
    ...strongest.map((k) => CHARACTER_WORD[k]),
    ...(c.drive >= 0.5 ? ['Driven', 'Drive'] : []),
    ...(c.brightness <= -0.3 ? ['Mellow', 'Soft'] : c.brightness >= 0.3 ? ['Bright'] : []),
    ...(family && c.shape && SHAPE_WORD[c.shape] ? [SHAPE_WORD[c.shape]!] : []),
  ]
  for (const w of words) if (`${w} ${noun}`.length <= 10) return `${w} ${noun}`
  return noun
}

