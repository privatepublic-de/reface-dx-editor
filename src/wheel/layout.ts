// Where a secondary pin goes in the base's voice (PLAN §8.2): a pair of its own (a carrier and its modulator), a
// carrier alone, or a modulator grafted into the base's main carrier. Four operators and 12 algorithms are few, so
// every algorithm and every renumbering of the base's operators is tried: the base's sounding operators keep their
// roles towards each other, the newcomer gets the shape it needs, and the fewest and least important of the base's
// operators give way (silent ones first, then the ones its skeleton marks as free).
import { ALGORITHMS } from '../params/algorithms'
import { RESET_OPERATOR } from '../params/init'
import type { Voice } from '../sysex/codec'
import { level, sounding } from './transforms'

export type Need =
  | { kind: 'pair' }
  | { kind: 'solo' }
  /** into: the carrier (in the voice's numbering now) the modulator goes into */
  | { kind: 'graft'; into: number }

export interface Layout {
  /** 0–11 */
  algorithm: number
  /** old operator → new place */
  perm: number[]
  /** the newcomer's places, numbered as after: [carrier, modulator], [carrier] or [modulator] */
  ops: number[]
  /** the base's sounding operators that gave way (old numbering) */
  given: number[]
}

const PERMS: number[][] = (() => {
  const out: number[][] = []
  const go = (p: number[]) => {
    if (p.length === 4) return void out.push(p)
    for (let i = 0; i < 4; i++) if (!p.includes(i)) go([...p, i])
  }
  go([])
  return out
})()

const into = (a: number, op: number) => ALGORITHMS[a].modulations.filter(([, to]) => to === op).map(([from]) => from)
const from = (a: number, op: number) => ALGORITHMS[a].modulations.filter(([f]) => f === op).map(([, to]) => to)
const isCarrier = (a: number, op: number) => ALGORITHMS[a].carriers.includes(op)
const modulates = (a: number, x: number, y: number) => ALGORITHMS[a].modulations.some(([f, t]) => f === x && t === y)

/** The sounding operators, the most important first: the loudest carrier, then what modulates it (the deepest
 *  first, down its stack), then the next carrier and its stack. */
export function byImportance(v: Voice): number[] {
  const a = v.common[0x10]
  const out: number[] = []
  const visit = (op: number) => {
    if (out.includes(op) || !sounding(v, op)) return
    out.push(op)
    for (const m of into(a, op).sort((x, y) => level(v, y) - level(v, x))) visit(m)
  }
  for (const c of ALGORITHMS[a].carriers.filter((c) => sounding(v, c)).sort((x, y) => level(v, y) - level(v, x))) visit(c)
  return out
}

/** Whether `slots` (in algorithm `a`) have the shape `need` asks for; `target` is the graft's carrier, as after. */
function fits(a: number, need: Need, slots: number[], target: number): boolean {
  if (need.kind === 'solo') return isCarrier(a, slots[0]) && !into(a, slots[0]).length
  if (need.kind === 'graft') {
    const m = slots[0]
    return !isCarrier(a, m) && from(a, m).join() === String(target) && !into(a, m).length
  }
  const [c, m] = slots
  return isCarrier(a, c) && into(a, c).join() === String(m) && from(a, m).join() === String(c) && !into(a, m).length
}

/** The best place for `need`, or null. `protect`: never give way (the base's main pair, earlier pins'
 *  operators); `spare`: give way cheaply (the skeleton's free branches). Numbering as the voice is now. */
export function findLayout(v: Voice, need: Need, protect: readonly number[], spare: readonly number[] = []): Layout | null {
  const now = v.common[0x10]
  const k = need.kind === 'pair' ? 2 : 1
  const order = byImportance(v)
  const live = [0, 1, 2, 3].filter((op) => sounding(v, op))
  const cost = (op: number) => (!live.includes(op) ? 0 : spare.includes(op) ? 1 : 10 + (4 - order.indexOf(op)))
  const sets: number[][] = k === 1 ? [0, 1, 2, 3].map((x) => [x]) : [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].filter((y) => y !== x).map((y) => [x, y]))
  let best: (Layout & { score: number }) | null = null
  for (const set of sets) {
    if (set.some((op) => protect.includes(op))) continue
    if (need.kind === 'graft' && set.includes(need.into)) continue
    const kept = live.filter((op) => !set.includes(op))
    const given = set.filter((op) => live.includes(op))
    const base = given.reduce((s, op) => s + cost(op), 0)
    for (let a = 0; a < 12; a++) for (const perm of PERMS) {
      // the base keeps its roles: carriers stay carriers, and who modulates whom among the kept
      if (kept.some((x) => isCarrier(a, perm[x]) !== isCarrier(now, x))) continue
      if (kept.some((x) => kept.some((y) => modulates(a, perm[x], perm[y]) !== modulates(now, x, y)))) continue
      const slots = set.map((op) => perm[op])
      if (!fits(a, need, slots, need.kind === 'graft' ? perm[need.into] : -1)) continue
      // and nothing of the newcomer's reaches a kept operator it shouldn't (fits covers the newcomer's own links)
      const moved = kept.filter((x) => perm[x] !== x).length
      const score = base + 0.1 * moved + (a === now ? 0 : 0.5)
      if (!best || score < best.score) best = { algorithm: a, perm, ops: slots, given, score }
    }
  }
  return best && { algorithm: best.algorithm, perm: best.perm, ops: best.ops, given: best.given }
}

/** The voice renumbered and in the layout's algorithm, the newcomer's places reset (silent until filled). In place. */
export function applyLayout(v: Voice, l: Layout) {
  const old = v.ops.map((o) => o.slice())
  old.forEach((o, x) => v.ops[l.perm[x]].set(o))
  v.common[0x10] = l.algorithm
  for (const op of l.ops) {
    v.ops[op].set(RESET_OPERATOR)
    v.ops[op][0x12] = 0
  }
}
