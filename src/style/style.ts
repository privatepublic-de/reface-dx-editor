// What the Style sheet's Mix does to a voice (PLAN §8.4): your voice blended towards the wheel's. Left from the
// family/character style editor (PLAN §7.2), which is gone. Pure: (voice, target, amount, rng) → voice.
import { COMMON_PARAMS } from '../params/common'
import { OPERATOR_PARAMS } from '../params/operator'
import { cloneVoice, type Voice } from '../sysex/codec'
import type { Rng } from './random'

/** The bytes blend never moves by halves: a halfway value is another sound. Coarse and fine go together. */
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
