// What the Style sheet's Mix and Wild do to a voice (PLAN §8.4): blend towards the new voice, mutate on top. Left from
// the family/character style editor (PLAN §7.2), which is gone. All pure: (voice, …, seed) → voice.
import { COMMON_PARAMS } from '../params/common'
import { OPERATOR_PARAMS } from '../params/operator'
import { cloneVoice, type Voice } from '../sysex/codec'
import { rng as makeRng, type Rng } from './random'
import { ensureAudible, rolesOf } from './transforms'

/** How far Wild mutates at the top: half of everything is already chaos. */
const WILD_MUTATE = 50

/** Wild as the variation within the style and the mutation on top. */
export const wildParts = (wild: number) => ({ variation: Math.min(1, wild * 2), mutate: Math.round(Math.max(0, wild * 2 - 1) * WILD_MUTATE) })

/** The bytes blend and mutate never move by halves: a halfway value is another sound. Coarse and fine go together. */
const COMMON_DISCRETE = new Set([0x0d, 0x10, 0x11, 0x1d, 0x20])
const OP_DISCRETE = new Set([0x00, 0x0c, 0x0d, 0x0f, 0x10, 0x14, 0x15])
const FREQ = [0x16, 0x17]

/** Moves `v` towards `target` by `amount` (0–1): continuous values by the amount (at least one step), discrete
 *  ones switch with that probability, so blending again converges. */
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
