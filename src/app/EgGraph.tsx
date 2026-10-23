// An envelope as the DX's chart draws it (FINDINGS Q13): from L4 at key-on, R1 → L1, R2 → L2, R3 → L3, held
// at L3 while the key is down, R4 → L4 after key-off. Rates run 0 (slow) to 127 (fast); a segment is drawn the
// longer the slower it is (a picture, not the DX's real timing). The points can be dragged: up and down sets
// the level, sideways the rate of the segment leading to it. Other operators' envelopes can show as ghosts.

const W = 240
const H = 72
const PAD = 6
/** drawn length of a segment at rate 127 and the most added at rate 0 */
const MIN_SEG = 4
const MAX_SEG = 46
const HOLD = 30
const SCALE = (W - PAD * 2) / (4 * (MIN_SEG + MAX_SEG) + HOLD)

export interface EgGraphProps {
  rates: readonly number[]
  levels: readonly number[]
  /** raw level range: 0–127, or 16–112 for the Pitch EG (centre 64 = no shift) */
  levelMin?: number
  levelMax?: number
  /** other envelopes, drawn faint */
  ghosts?: { rates: readonly number[]; levels: readonly number[] }[]
  label: string
  onChange?(kind: 'rate' | 'level', index: number, value: number): void
  onGesture?(active: boolean): void
}

const segLen = (rate: number) => (MIN_SEG + ((127 - rate) / 127) * MAX_SEG) * SCALE

/** x of L4 (start), L1, L2, L3, key-off, L4 (end). */
function xs(rates: readonly number[]) {
  const x = [PAD]
  for (let i = 0; i < 3; i++) x.push(x[i] + segLen(rates[i]))
  x.push(x[3] + HOLD * SCALE)
  x.push(x[4] + segLen(rates[3]))
  return x
}

export function EgGraph({ rates, levels, levelMin = 0, levelMax = 127, ghosts = [], label, onChange, onGesture }: EgGraphProps) {
  const y = (level: number) => PAD + (1 - (level - levelMin) / (levelMax - levelMin)) * (H - PAD * 2)
  const path = (r: readonly number[], l: readonly number[]) => {
    const x = xs(r)
    const ys = [l[3], l[0], l[1], l[2], l[2], l[3]].map(y)
    return x.map((xi, i) => `${i ? 'L' : 'M'}${xi.toFixed(1)} ${ys[i].toFixed(1)}`).join('')
  }
  const x = xs(rates)
  // Draggable points: L1, L2, L3 (after R1–R3) and the end (after R4, level L4).
  const handles = [
    { at: 1, level: 0, rate: 0, from: 0 },
    { at: 2, level: 1, rate: 1, from: 1 },
    { at: 3, level: 2, rate: 2, from: 2 },
    { at: 5, level: 3, rate: 3, from: 4 },
  ]
  const levelAt = (py: number) => Math.round(levelMin + (1 - (py - PAD) / (H - PAD * 2)) * (levelMax - levelMin))
  const rateAt = (len: number) => Math.round(127 - ((len / SCALE - MIN_SEG) / MAX_SEG) * 127)
  const clampL = (v: number) => Math.max(levelMin, Math.min(levelMax, v))
  const clampR = (v: number) => Math.max(0, Math.min(127, v))
  return (
    <svg className="eg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={x[4]} y1={PAD} x2={x[4]} y2={H - PAD} className="eg__keyoff" />
      {levelMin > 0 && <line x1={PAD} y1={y((levelMin + levelMax) / 2)} x2={W - PAD} y2={y((levelMin + levelMax) / 2)} className="eg__zero" />}
      {ghosts.map((g, i) => <path key={i} d={path(g.rates, g.levels)} className="eg__ghost" />)}
      <path d={path(rates, levels)} className="eg__line" />
      {onChange &&
        handles.map((h) => (
          <circle
            key={h.at}
            cx={x[h.at]}
            cy={y(levels[h.level])}
            r={4.5}
            className="eg__handle"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              onGesture?.(true)
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
              const svg = e.currentTarget.ownerSVGElement!
              const r = svg.getBoundingClientRect()
              const px = ((e.clientX - r.left) / r.width) * W
              const py = ((e.clientY - r.top) / r.height) * H
              const level = clampL(levelAt(py))
              const rate = clampR(rateAt(px - x[h.from]))
              if (level !== levels[h.level]) onChange('level', h.level, level)
              if (rate !== rates[h.rate]) onChange('rate', h.rate, rate)
            }}
            onPointerUp={() => onGesture?.(false)}
            onPointerCancel={() => onGesture?.(false)}
          >
            <title>{`L${h.level + 1} ${levels[h.level]}, R${h.rate + 1} ${rates[h.rate]}: drag`}</title>
          </circle>
        ))}
    </svg>
  )
}
