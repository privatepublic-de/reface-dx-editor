// Keyboard scaling as the DX's screen draws it (Reference Manual p. 4): the break point (fixed at C3) in the
// middle, the low side to the left, the high side to the right, each a line (LIN) or a curve that stays near zero
// by the break point and bends away towards the end (EXP). Up raises the operator's level there, down lowers it.
// A faint full-scale outline shows each side's shape even at depth 0, as the screen does.
import type { KscSide } from '../params/operator'

const W = 240
const H = 46
const PAD = 3
const STEPS = 24

/** 0 at the break point, 1 at the end of the side. */
const shape = (t: number, exp: boolean) => (exp ? Math.expm1(3 * t) / Math.expm1(3) : t)

export function KscGraph({ left, right, label }: { left: KscSide; right: KscSide; label: string }) {
  const mid = W / 2
  const y = (v: number) => H / 2 - (v / 127) * (H / 2 - PAD)
  const side = (s: KscSide, dir: -1 | 1, depth = s.depth) =>
    Array.from({ length: STEPS + 1 }, (_, i) => {
      const t = i / STEPS
      return `${i ? 'L' : 'M'}${(mid + dir * t * (mid - PAD)).toFixed(1)} ${y(depth * shape(t, s.exp)).toFixed(1)}`
    }).join('')
  const outline = (s: KscSide) => (s.depth < 0 ? -127 : 127)
  return (
    <svg className="ksc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{`${label}: L ${left.depth} ${left.exp ? 'EXP' : 'LIN'}, R ${right.depth} ${right.exp ? 'EXP' : 'LIN'}, break point C3`}</title>
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="ksc__zero" />
      <line x1={mid} y1={PAD} x2={mid} y2={H - PAD} className="ksc__break" />
      <path d={side(left, -1, outline(left))} className="ksc__outline" />
      <path d={side(right, 1, outline(right))} className="ksc__outline" />
      <path d={side(left, -1)} className="ksc__line" />
      <path d={side(right, 1)} className="ksc__line" />
    </svg>
  )
}
