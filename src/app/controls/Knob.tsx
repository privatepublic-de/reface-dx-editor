// A knob, after hydrasynth-editor's (by way of an earlier editor of ours), with the
// gestures every sibling editor shares: drag up/down (~200 px =
// full range, Shift = ten times finer), wheel, arrow keys / PageUp / PageDown / Home / End, double-click or Delete
// = the default, click the value (or Enter) to type. A bipolar value's zero holds a drag for a few pixels.
import { useEffect, useRef, useState } from 'react'
import { formatValue, parseValue, type Param } from '../../params/param'
import { onOwnWheel } from './wheel'

const SWEEP = 270
const START = -135
/** Pixels of drag that a bipolar knob's zero holds on to. */
const SNAP_PX = 8

const pol = (r: number, deg: number): [number, number] => [24 + r * Math.sin((deg * Math.PI) / 180), 24 - r * Math.cos((deg * Math.PI) / 180)]

function arcPath(r: number, a: number, b: number) {
  if (b - a < 0.5) return ''
  const [x0, y0] = pol(r, a)
  const [x1, y1] = pol(r, b)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export interface KnobProps {
  param: Param
  /** the visible label (the param's own label is long where the box already names the section) */
  title?: string
  /** what the box says, for the tooltip and the accessible name: "OP2", "Pitch EG", "Effect 1" */
  context?: string
  value: number
  /** what double-click and Delete set */
  defaultValue: number
  /** the value as read from the DX: a tick marks it once the value differs */
  baseline?: number | null
  /** the readout instead of the param's own (Coarse shows the frequency) */
  display?: (value: number) => string
  /** small glyphs (SVG paths in a 6 × 4 box) drawn at the arc's two ends: what the minimum and maximum mean */
  ends?: [min: string, max: string]
  /** the DX's panel just changed it */
  flash?: boolean
  disabled?: boolean
  small?: boolean
  onChange(value: number): void
  onGesture(active: boolean): void
}

export function Knob({ param: p, title, context, value, defaultValue, baseline = null, display, ends, flash, disabled, small, onChange, onGesture }: KnobProps) {
  const ref = useRef<SVGSVGElement>(null)
  const drag = useRef<{ y: number; start: number } | null>(null)
  const [typing, setTyping] = useState(false)
  const range = p.max - p.min
  const clamp = (v: number) => Math.max(p.min, Math.min(p.max, Math.round(v)))
  const angle = (v: number) => START + (SWEEP * (Math.max(p.min, Math.min(p.max, v)) - p.min)) / range
  const center = p.center
  const at = angle(value)
  const from = angle(center ?? p.min)
  const change = (v: number) => {
    if (!disabled && clamp(v) !== value) onChange(clamp(v))
  }
  const latest = useRef({ value, change, disabled })
  latest.current = { value, change, disabled }

  useEffect(() => {
    const node = ref.current
    if (!node) return
    // Only a wheel gesture that started on the knob turns it: a page scroll passing over goes on scrolling.
    return onOwnWheel(node, (e) => {
      const l = latest.current
      if (l.disabled) return
      e.preventDefault()
      l.change(l.value + (e.deltaY < 0 ? 1 : -1))
    })
  }, [p.min, p.max])

  const end = () => {
    if (!drag.current) return
    drag.current = null
    onGesture(false)
  }

  const shown = display ? display(value) : formatValue(p, value)
  // the label as shown, with the box it's in: the tooltip and screen readers name the knob you see
  const name = `${context ? `${context} ` : ''}${title ?? p.label}`
  const moved = baseline !== null && baseline !== value

  return (
    <div className={`control knob${small ? ' knob--small' : ''}${flash ? ' control--touched' : ''}`}>
      <span className="control__label">{title ?? p.label}</span>
      {/* the value sits in the ring's opening at the bottom, so a knob is label + dial, no row of its own */}
      <div className="knob__dial">
      <svg
        ref={ref}
        viewBox="0 0 48 48"
        className="knob__svg"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={name}
        aria-valuemin={p.min}
        aria-valuemax={p.max}
        aria-valuenow={value}
        aria-valuetext={shown}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          onGesture(true)
          drag.current = { y: e.clientY, start: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const px = drag.current.y - e.clientY
          const perPx = (range / 200) * (e.shiftKey ? 0.1 : 1)
          let next = drag.current.start + px * perPx
          if (center !== undefined) {
            // Zero holds the drag for a few pixels; past it, values count from the end of the catch.
            const fromZero = px - (center - drag.current.start) / perPx
            if (Math.abs(fromZero) <= SNAP_PX) next = center
            else if (Math.sign(fromZero) !== Math.sign(drag.current.start - center)) next = center + (fromZero - Math.sign(fromZero) * SNAP_PX) * perPx
          }
          change(next)
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => !disabled && change(defaultValue)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') change(value + 1)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') change(value - 1)
          else if (e.key === 'PageUp') change(value + 10)
          else if (e.key === 'PageDown') change(value - 10)
          else if (e.key === 'Home') change(p.min)
          else if (e.key === 'End') change(p.max)
          else if (e.key === 'Delete' || e.key === 'Backspace') change(defaultValue)
          else if (e.key === 'Enter' && !disabled) setTyping(true)
          else return
          e.preventDefault()
        }}
      >
        <title>{`${name}: ${shown}${moved ? ` (was ${display ? display(baseline!) : formatValue(p, baseline!)})` : ''}`}</title>
        <path d={arcPath(19, START, START + SWEEP)} className="knob__track" />
        <path d={arcPath(19, Math.min(from, at), Math.max(from, at))} className="knob__fill" />
        {moved && <KnobTick deg={angle(baseline!)} />}
        {ends && (
          <>
            <path d={ends[0]} transform="translate(-4 41) scale(1.8)" className={`knob__end${value < (center ?? p.min) ? ' knob__end--on' : ''}`} />
            <path d={ends[1]} transform="translate(41.2 41) scale(1.8)" className={`knob__end${value > (center ?? p.max) ? ' knob__end--on' : ''}`} />
          </>
        )}
        <circle cx="24" cy="24" r="13" className="knob__cap" />
        <line x1="24" y1="24" x2={pol(11, at)[0]} y2={pol(11, at)[1]} className="knob__pointer" />
      </svg>
      {typing ? (
        <ValueInput
          param={p}
          name={name}
          value={value}
          onDone={(v) => {
            setTyping(false)
            if (v !== null) change(v)
            ref.current?.focus()
          }}
        />
      ) : (
        <button type="button" className="control__value" disabled={disabled} onClick={() => setTyping(true)} title="Click to type a value" tabIndex={-1}>
          {shown}
        </button>
      )}
      </div>
    </div>
  )
}

/** The value as read from the DX, as a tick across the arc. */
const KnobTick = ({ deg }: { deg: number }) => {
  const [x1, y1] = pol(16, deg)
  const [x2, y2] = pol(21, deg)
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="knob__was" />
}

/** Types a value in the units the knob's param shows. */
function ValueInput({ param, name, value, onDone }: { param: Param; name: string; value: number; onDone(v: number | null): void }) {
  const [text, setText] = useState(formatValue(param, value))
  const done = useRef(false)
  const finish = (v: number | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      className="control__input"
      autoFocus
      inputMode="numeric"
      aria-label={`${name} value`}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(parseValue(param, text, value))
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(parseValue(param, text, value))}
    />
  )
}
