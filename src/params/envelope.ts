// Operator envelopes edited together (PLAN §7.1): one change to a stage carries over to the same stage of the
// other operators with the same role, carriers with carriers (loudness), modulators with modulators (timbre).
// Rates move by the same delta (a DX rate already maps to time on a curve, so +10 is "all a bit faster");
// levels scale by the same ratio, so the balance between operators stays. Everything is computed from `start`,
// the voice when the drag began: an operator that hits 0 or 127 clamps on its own, and dragging back restores it.
import type { Voice } from '../sysex/codec'
import type { Address } from '../sysex/messages'
import { isCarrier } from './algorithms'

export type EgKind = 'rate' | 'level'

/** Byte offset of R1–R4 (stage 0–3) or L1–L4 in an operator block. */
export const egOffset = (kind: EgKind, stage: number) => (kind === 'rate' ? 0x01 : 0x05) + stage

/** The operators that follow `op`: the others with its role in `algorithm`. */
export const sameRole = (algorithm: number, op: number) => [0, 1, 2, 3].filter((o) => o !== op && isCarrier(algorithm, o) === isCarrier(algorithm, op))

const clamp = (v: number) => Math.max(0, Math.min(127, Math.round(v)))

/** What the other same-role operators become when `op`'s stage goes from its value in `start` to `value`. */
export function linkedEgChanges(start: Voice, op: number, kind: EgKind, stage: number, value: number): [Address, number[]][] {
  const at = egOffset(kind, stage)
  const from = start.ops[op][at]
  const follow = (other: number) => {
    const was = start.ops[other][at]
    // A level dragged up from 0 has no ratio: the others then follow by the delta, as rates do.
    return kind === 'level' && from > 0 ? clamp((was * value) / from) : clamp(was + value - from)
  }
  return sameRole(start.common[0x10], op).map((o) => [[0x31, o, at], [follow(o)]])
}

/** An envelope as four rates and four levels. */
export interface Eg {
  rates: readonly number[]
  levels: readonly number[]
}

export function setEg(voice: Voice, op: number, eg: Eg) {
  eg.rates.forEach((r, i) => (voice.ops[op][egOffset('rate', i)] = clamp(r)))
  eg.levels.forEach((l, i) => (voice.ops[op][egOffset('level', i)] = clamp(l)))
}

/** Longer (`by` < 0) or shorter (`by` > 0) envelopes for `ops`: every rate moves by `by`, but an instant
 *  attack (R1 = 127) stays instant. In place. */
export function shiftRates(voice: Voice, ops: readonly number[], by: number) {
  for (const op of ops) {
    for (let i = 0; i < 4; i++) {
      const at = egOffset('rate', i)
      if (i === 0 && voice.ops[op][at] === 127) continue
      voice.ops[op][at] = clamp(voice.ops[op][at] + by)
    }
  }
}
