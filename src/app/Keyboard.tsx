// A three-octave keyboard and a mod wheel under the panel, after an earlier editor of ours:
// pressing a key sends Note On on the DX's receive channel, letting go sends Note Off. Keys held on the DX light
// up too. Where on the key you press sets the velocity: near the top soft, near the front edge hard (the
// operators' velocity sensitivity). One note at a time from the pointer; dragging across the keys glides.
import { useEffect, useRef, useState } from 'react'
import { isOnline, useEditor } from './store'

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const BLACK = new Set([1, 3, 6, 8, 10])
/** three octaves and the top C */
const KEYS = 37
const WHITE_KEYS = 22
const GAP = 2
const LOWEST = 24 // C1
const HIGHEST_START = 84 // C6
/** velocity at the very top of a key; the front edge is 127 */
const SOFTEST = 10
/** whether the keyboard is folded away, kept between visits */
const FOLDED_KEY = 'reface-dx-editor.keysFolded'

function loadFolded() {
  try {
    return localStorage.getItem(FOLDED_KEY) === '1'
  } catch {
    return false
  }
}

/** C4 = MIDI note 60 */
export const noteName = (n: number) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`

/** Velocity from where the pointer is on the key: top soft, bottom hard. */
function velocityAt(e: React.PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const t = Math.max(0, Math.min(1, (e.clientY - r.top) / (r.height || 1)))
  return Math.round(SOFTEST + t * (127 - SOFTEST))
}

export function Keyboard() {
  const online = useEditor((s) => isOnline(s.status) && s.voice !== null)
  const program = useEditor((s) => s.program)
  const synthNotes = useEditor((s) => s.synthNotes)
  const lastVelocity = useEditor((s) => s.lastVelocity)
  const { noteOn, noteOff, releaseNotes } = useEditor.getState()
  const [low, setLow] = useState(48) // C3
  const [folded, setFolded] = useState(loadFolded)
  const [down, setDown] = useState<Map<number, number>>(new Map())
  const mouse = useRef<number | null>(null)
  const dragging = useRef(false)
  const keys = useRef(new Set<number>())

  const press = (n: number, velocity: number) => {
    noteOn(n, velocity)
    setDown((d) => new Map(d).set(n, velocity))
  }
  const release = (n: number) => {
    noteOff(n)
    setDown((d) => {
      const next = new Map(d)
      next.delete(n)
      return next
    })
  }
  const pointerTo = (n: number | null, velocity = 100) => {
    if (mouse.current === n) return
    if (mouse.current !== null) release(mouse.current)
    mouse.current = n
    if (n !== null) press(n, velocity)
  }
  const releaseAll = () => {
    dragging.current = false
    mouse.current = null
    keys.current.clear()
    releaseNotes()
    setDown(new Map())
  }

  // A note must never hang: let go anywhere, leave the window, switch voices.
  useEffect(() => {
    const up = () => {
      dragging.current = false
      pointerTo(null)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [])
  useEffect(releaseAll, [program])

  if (!online) return null

  const shift = (by: number) => {
    releaseAll()
    setLow((l) => Math.max(LOWEST, Math.min(HIGHEST_START, l + by)))
  }

  const fold = (to: boolean) => {
    releaseAll()
    setFolded(to)
    try {
      localStorage.setItem(FOLDED_KEY, to ? '1' : '0')
    } catch {
      // private mode: it stays folded for this visit
    }
  }
  const foldButton = (
    <button className="keys__fold" onClick={() => fold(!folded)} aria-expanded={!folded} aria-controls="keys-main"
      title={folded ? 'Show the keyboard' : 'Fold the keyboard away'}>
      <span aria-hidden="true">{folded ? '▸' : '▾'}</span> Keyboard
    </button>
  )

  if (folded)
    return (
      <section className="keys keys--folded" aria-label="Keyboard">
        <div className="keys__bar">{foldButton}</div>
      </section>
    )

  let white = -1
  const placed = Array.from({ length: KEYS }, (_, i) => {
    const n = low + i
    const black = BLACK.has(n % 12)
    if (!black) white++
    return { n, black, white }
  })
  const w = 100 / WHITE_KEYS

  const keyProps = (n: number) => ({
    'aria-label': noteName(n),
    'aria-pressed': down.has(n),
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) // touch: let the finger glide too
      dragging.current = true
      pointerTo(n, velocityAt(e))
    },
    onPointerEnter: (e: React.PointerEvent) => dragging.current && e.buttons & 1 && pointerTo(n, velocityAt(e)),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !keys.current.has(n)) {
        e.preventDefault()
        keys.current.add(n)
        press(n, 100)
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && keys.current.delete(n)) release(n)
    },
    onBlur: () => keys.current.delete(n) && release(n),
  })
  const lit = (n: number) => (down.has(n) || synthNotes.has(n) ? ' key--down' : '')
  const playing = down.size + synthNotes.size > 0

  return (
    <section className="keys" aria-label="Keyboard">
      <ModWheel />
      <div className="keys__main" id="keys-main">
        <div className="keys__bar">
          {foldButton}
          <button onClick={() => shift(-12)} disabled={low <= LOWEST} aria-label="Octave down">−</button>
          <span className="dim">
            {noteName(low)}–{noteName(low + KEYS - 1)}
          </span>
          <button onClick={() => shift(12)} disabled={low >= HIGHEST_START} aria-label="Octave up">+</button>
          <span className="dim keys__hint">Press near the top of a key for soft, near the front for hard.</span>
          {playing && lastVelocity !== null && <span className="keys__vel">velocity {lastVelocity}</span>}
        </div>
        <div className="keys__bed">
          {placed
            .filter((k) => !k.black)
            .map(({ n, white: i }) => (
              <button key={n} className={`key key--white${lit(n)}`} {...keyProps(n)}
                style={{ left: `calc(${i * w}% + ${GAP / 2}px)`, width: `calc(${w}% - ${GAP}px)` }}>
                {n % 12 === 0 && <span className="key__name">{noteName(n)}</span>}
              </button>
            ))}
          {placed
            .filter((k) => k.black)
            .map(({ n, white: i }) => (
              <button key={n} className={`key key--black${lit(n)}`} {...keyProps(n)} style={{ left: `${(i + 1) * w - w * 0.3}%`, width: `${w * 0.6}%` }} />
            ))}
        </div>
      </div>
    </section>
  )
}

/** The mod wheel: drag up and down; it stays where it is let go, as the real one does. Sends CC 1. */
export function ModWheel() {
  const value = useEditor((s) => s.modWheel)
  const setModWheel = useEditor((s) => s.setModWheel)
  const dragging = useRef(false)
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setModWheel(127 * (1 - (e.clientY - r.top) / (r.height || 1)))
  }
  return (
    <div className="modwheel">
      <div
        className="modwheel__track"
        role="slider"
        tabIndex={0}
        aria-label="Mod wheel"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={127}
        aria-valuenow={value}
        title="Mod wheel (CC 1, which the DX receives)"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          at(e)
        }}
        // A drag that leaves the wheel would otherwise select the panel's text on the way; focus by hand instead.
        onMouseDown={(e) => {
          e.preventDefault()
          e.currentTarget.focus()
        }}
        onPointerMove={(e) => dragging.current && at(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 8
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setModWheel(value + step)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setModWheel(value - step)
          else if (e.key === 'Home') setModWheel(0)
          else if (e.key === 'End') setModWheel(127)
          else return
          e.preventDefault()
        }}
      >
        <div className="modwheel__fill" style={{ height: `${(value / 127) * 100}%` }} />
      </div>
      <span className="modwheel__label">Mod {value}</span>
    </div>
  )
}
