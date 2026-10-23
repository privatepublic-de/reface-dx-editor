// The algorithm drawn as the reface DX's chart draws it (FINDINGS Q13): carriers as squares on the left,
// modulators as circles to their right, lines from each modulator to what it modulates. Each operator's own
// feedback shows as a small loop with saw or square, and an operator switched off is dimmed.
import { ALGORITHMS } from '../params/algorithms'
import type { Voice } from '../sysex/codec'

/** Grid positions [column, row] of OP1–OP4 per algorithm, as on the DX's chart. */
const LAYOUT: [number, number][][] = [
  /* 1 */ [[0, 1], [1, 1], [2, 1], [3, 1]],
  /* 2 */ [[0, 1], [1, 1], [2, 2], [2, 0]],
  /* 3 */ [[0, 1], [1, 0], [2, 0], [1, 2]],
  /* 4 */ [[0, 1], [1, 0], [1, 2], [2, 1]],
  /* 5 */ [[0, 1], [1, 0], [1, 1], [1, 2]],
  /* 6 */ [[0, 0], [0, 2], [1, 2], [2, 2]],
  /* 7 */ [[0, 0], [0, 2], [1, 1], [2, 1]],
  /* 8 */ [[0, 0], [1, 0], [0, 2], [1, 2]],
  /* 9 */ [[0, 0], [0, 1], [0, 2], [1, 1]],
  /* 10 */ [[0, 0], [0, 1], [0, 2], [1, 1.5]],
  /* 11 */ [[0, 0], [0, 1], [0, 2], [1, 2]],
  /* 12 */ [[0, 0], [0, 1], [0, 2], [0, 3]],
]

const COL = 46
const ROW = 30
const R = 10
const PAD = 14
/** CSS pixels per drawing unit: every algorithm drawn at the same size */
const SCALE = 1.3

export interface AlgorithmViewProps {
  algorithm: number
  voice?: Voice
  /** the operator the panel focuses, drawn highlighted */
  focus?: number
  /** a thumbnail: no numbers' feedback marks, just the shape */
  small?: boolean
  onOperator?(op: number): void
}

export function AlgorithmView({ algorithm, voice, focus, small, onOperator }: AlgorithmViewProps) {
  const a = ALGORITHMS[algorithm]
  const pos = LAYOUT[algorithm]
  const xy = (op: number): [number, number] => [PAD + R + pos[op][0] * COL, PAD + R + pos[op][1] * ROW]
  // The drawing takes the room its algorithm needs; thumbnails all share the full grid, so they line up.
  const cols = small ? 3 : Math.max(...pos.map((p) => p[0]))
  const rows = small ? 3 : Math.max(...pos.map((p) => p[1]))
  const width = PAD * 2 + R * 2 + cols * COL + (small ? 0 : 24)
  const height = PAD * 2 + R * 2 + rows * ROW
  return (
    <svg className={`algo${small ? ' algo--small' : ''}`} viewBox={`0 0 ${width} ${height}`} style={small ? undefined : { width: width * SCALE, height: height * SCALE }} role={small ? undefined : 'group'} aria-label={small ? undefined : `Algorithm ${algorithm + 1}`}>
      {a.modulations.map(([from, to]) => {
        const [x1, y1] = xy(from)
        const [x2, y2] = xy(to)
        // From the modulator's left edge to the carrier's right edge; an elbow halfway when the rows differ.
        const sx = x1 - R
        const ex = x2 + R
        const mid = y1 === y2 ? null : x2 + R + (x1 - R - (x2 + R)) / 2
        const d = mid === null ? `M${sx} ${y1}H${ex}` : `M${sx} ${y1}H${mid}V${y2}H${ex}`
        return <path key={`${from}-${to}`} d={d} className="algo__line" />
      })}
      {[0, 1, 2, 3].map((op) => {
        const [x, y] = xy(op)
        const carrier = a.carriers.includes(op)
        const on = !voice || voice.ops[op][0x00] === 1
        const fb = voice?.ops[op][0x13] ?? 0
        const square = voice?.ops[op][0x14] === 1
        const cls = `algo__op${carrier ? ' algo__op--carrier' : ''}${focus === op ? ' algo__op--focus' : ''}${on ? '' : ' algo__op--off'}`
        return (
          <g key={op} className={cls} onClick={onOperator && (() => onOperator(op))} role={onOperator ? 'button' : undefined}
            aria-label={onOperator ? `OP${op + 1}, ${carrier ? 'carrier' : 'modulator'}${on ? '' : ', off'}` : undefined}>
            {carrier ? <rect x={x - R} y={y - R} width={R * 2} height={R * 2} rx={2} /> : <circle cx={x} cy={y} r={R} />}
            {!small && <text x={x} y={y + 4}>{op + 1}</text>}
            {!small && fb > 0 && (
              <g className="algo__fb">
                <title>{`Feedback ${fb}, ${square ? 'square' : 'saw'}`}</title>
                <path d={`M${x + R * 0.6} ${y - R * 0.8}A6 6 0 1 0 ${x - R * 0.2} ${y - R}`} />
                <text x={x + R + 3} y={y - R + 1}>{square ? '⊓' : '◿'}</text>
              </g>
            )}
          </g>
        )
      })}
      {!small && <text x={width - 6} y={height - 6} className="algo__number">{algorithm + 1}</text>}
    </svg>
  )
}

/** The 12 algorithms as thumbnails to pick from. */
export function AlgorithmPicker({ value, onChange }: { value: number; onChange(algorithm: number): void }) {
  return (
    <div className="algo-picker" role="radiogroup" aria-label="Algorithm">
      {ALGORITHMS.map((_, i) => (
        <button key={i} type="button" role="radio" aria-checked={i === value} className={`algo-picker__item${i === value ? ' on' : ''}`}
          onClick={() => i !== value && onChange(i)} title={`Algorithm ${i + 1}`}>
          <AlgorithmView algorithm={i} small />
          <span>{i + 1}</span>
        </button>
      ))}
    </div>
  )
}
