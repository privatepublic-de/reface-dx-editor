// Init and the Style sheet (PLAN §8). Init is the plain VOICE INIT in one click. The Style tab opens a panel joined to
// it, docked on the left: the tonality wheel (wheel/, after the volca fm generator) and the controls next to it. It
// caches the voice, and every change plays on the DX at once (paced Parameter Changes, sounding notes keep sounding).
// Mix goes from the voice as it was to the wheel's voice; Wild from typical to anywhere in the tonalities' ranges and
// then mutated; the dice tries another variation, Mutate moves the pins, the wheel's centre rolls a new voice. Apply
// keeps what you hear as one undo step, Cancel (or Escape) goes back. Every chip keeps its size, so nothing moves.
import { useEffect, useRef } from 'react'
import { ALGORITHMS } from '../params/algorithms'
import { COLOUR_LABELS, COLOURS, MODE_BYTE, MODE_HINTS, MODE_LABELS, MODES, SHAPE_HINTS, SHAPE_LABELS, SHAPES, SPACE_LABELS, SPACES } from '../style/choices'
import type { Envelope } from '../style/shapes'
import { REGISTER_LABELS, REGISTERS, TONALITY_HUES, TONALITY_LABELS } from '../wheel/choices'
import { TONALITY_SPACE } from '../wheel/controls'
import { TONALITY_DEFS } from '../wheel/tonalities'
import { AlgorithmView } from './AlgorithmView'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'
import { useStyle } from './styleStore'
import { pinLabel, Wheel } from './Wheel'

/** Both hooks every render (an `a || b` of hooks skips the second while reading, and React fails). */
function useBusy() {
  const editing = useEditor((s) => s.reading || !s.voice)
  const libraryJob = useLibrary((s) => !!s.job)
  return editing || libraryJob
}

export function InitButton() {
  const init = useEditor((s) => s.init)
  return (
    <button className="voice-title__init" onClick={init} disabled={useBusy()} title="The DX’s VOICE INIT: a sine on OP1 (one undo step)">
      Init
    </button>
  )
}

/** The Style tab: opens the panel, and while it's open stays lit and joins it. */
export function StyleMenu() {
  const open = useStyle((s) => s.open)
  const isOpen = useStyle((s) => !!s.original)
  const busy = useBusy()
  return (
    <button className={`voice-title__init style-tab${isOpen ? ' style-tab--open' : ''}`} onClick={open} aria-expanded={isOpen} aria-controls="style-panel"
      disabled={busy && !isOpen} title={isOpen ? 'The style editor is open' : 'Make this voice in a style, and hear it as you choose'}>
      Style
    </button>
  )
}

/** The envelopes offered: the style editor's six and the swell (brightness rising into the note). */
const ENVELOPES: Envelope[] = [...SHAPES, 'swell']
const ENVELOPE_LABELS: Record<Envelope, string> = { ...SHAPE_LABELS, swell: 'Swell' }
const ENVELOPE_HINTS: Record<Envelope, string> = { ...SHAPE_HINTS, swell: 'The brightness rises into the note' }
const ROLE_WORDS = { skeleton: 'the base', branch: 'a voice of its own', solo: 'one operator alone', graft: 'in the base’s tone', transform: 'colouring the base' }

export function StyleSheet() {
  const { choices: c, mix, wild, more, keepFx, dirty, original, generated, set, setMix, setWild, setMore, setKeepFx, another, mutate, reset, apply, cancel } = useStyle()
  const voice = useEditor((s) => s.voice)
  const first = useRef<HTMLDivElement>(null)
  // what the heaviest tonality brings when nothing is chosen: shown outlined, not as a choice
  const dominant = generated?.roles[0].tonality ?? null
  const ownShape = dominant ? TONALITY_DEFS[dominant].skeleton.shape : null
  const ownSpace = dominant ? TONALITY_SPACE[dominant] : null
  const ownMode = mix >= 1 ? (c.register === 'lead' ? MODE_BYTE.legato : MODE_BYTE.poly) : original?.common[0x0d]
  const dominantName = dominant ? TONALITY_LABELS[dominant].toLowerCase() : ''
  const neutral = !c.pins.length && !c.shape && !c.length && !c.brightness && !c.treble && c.complexity === 0.5 && !c.motion && !c.register && c.velocity === null && !c.pitchAccent && !c.mode && !c.colour && !c.space
  useEffect(() => first.current?.querySelector<HTMLElement>('.wheel-centre')?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as Element).closest?.('dialog')) return
      e.preventDefault()
      useStyle.getState().cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const shown = voice ?? original
  return (
    <aside className="style-sheet" id="style-panel" role="dialog" aria-label="Style">
      <div className="style-sheet__body">
        <div className="style-wheel" ref={first}>
          <Wheel />
          <p className="style-wheel__pins dim">
            {c.pins.length
              ? generated?.roles.map((r, i) => (
                <span key={i} style={{ color: `hsl(${TONALITY_HUES[r.tonality]} 70% 70%)` }}>{TONALITY_LABELS[r.tonality]}<span className="dim"> {ROLE_WORDS[r.as]}</span></span>
              ))
              : 'Click the wheel to pin a tonality, up to three. The centre rolls new pins.'}
          </p>
        </div>

        {shown && generated && (
          <div className="style-voice" aria-label="The voice the wheel made">
            <AlgorithmView algorithm={shown.common[0x10]} voice={shown} small
              colours={mix >= 1 ? generated.opTonality.map((t) => (t ? `hsl(${TONALITY_HUES[t]} 75% 62%)` : null)) : undefined} />
            <span className="dim">{c.pins.map(pinLabel).join(' · ') || 'a tonality picked by the dice'}</span>
          </div>
        )}

        <div className="style-panel__sliders">
          <Slider label="Brightness" left="mellow" right="bright" value={c.brightness} min={-1} onChange={(v) => set({ brightness: v })} />
          <Slider label="Complexity" left="pure" right="dense" value={c.complexity} min={0} neutral={0.5} onChange={(v) => set({ complexity: v })}
            title="Pure: two operators. Dense: all four, stacked deeper. Middle: the tonalities’ own." />
          <Slider label="Motion" left="still" right="alive" value={c.motion} min={0} onChange={(v) => set({ motion: v })} />
        </div>

        <Group title="Envelope" note={!c.shape && dominant ? `outlined: the ${dominantName}’s own` : undefined}>
          <div className="chips chips--7">
            {ENVELOPES.map((s) => (
              <Chip key={s} on={c.shape === s} implied={!c.shape && ownShape === s} onClick={() => set({ shape: c.shape === s ? null : s })} title={ENVELOPE_HINTS[s]}>
                {ENVELOPE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="Register">
          <div className="chips chips--5">
            {REGISTERS.map((r) => (
              <Chip key={r} on={c.register === r} onClick={() => set({ register: c.register === r ? null : r })}
                title={r === 'lead' ? 'One note at a time, gliding, with vibrato' : r === 'mid' ? 'As the tonality plays it' : undefined}>{REGISTER_LABELS[r]}</Chip>
            ))}
          </div>
        </Group>

        <Group title="Play" note={!c.mode ? `outlined: ${mix >= 1 ? 'the wheel’s' : 'as your voice has it'}` : undefined}>
          <div className="chips chips--3">
            {MODES.map((m) => (
              <Chip key={m} on={c.mode === m} implied={!c.mode && ownMode === MODE_BYTE[m]} onClick={() => set({ mode: c.mode === m ? null : m })} title={MODE_HINTS[m]}>
                {MODE_LABELS[m]}
              </Chip>
            ))}
          </div>
          <div className="style-panel__play">
            <Slider label="Velocity" left="none" right="strong" value={c.velocity ?? 0} min={0} onChange={(v) => set({ velocity: v })}
              title={c.velocity === null ? 'As the tonality plays it (double-click: back to that)' : 'Double-click: back to the tonality’s own'} onReset={() => set({ velocity: null })} dimmed={c.velocity === null} />
            <label className="style-panel__keep">
              <input type="checkbox" checked={c.pitchAccent} onChange={(e) => set({ pitchAccent: e.target.checked })} />
              Pitch accent
            </label>
          </div>
        </Group>

        <details className="style-panel__more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>More: length, treble, effects</summary>
          <div className="style-panel__sliders">
            <Slider label="Length" left="short" right="long" value={c.length} min={-1} onChange={(v) => set({ length: v })} />
            <Slider label="Treble" left="tamer" right="brighter" value={c.treble} min={-1} onChange={(v) => set({ treble: v })} title="How the brightness changes up the keyboard" />
          </div>
          <Group title="Colour">
            <div className="chips chips--6">
              {COLOURS.map((k) => (
                <Chip key={k} on={c.colour === k} implied={!c.colour && k === 'clean'} onClick={() => set({ colour: c.colour === k ? null : k })}>{COLOUR_LABELS[k]}</Chip>
              ))}
            </div>
          </Group>
          <Group title="Space" note={!c.space && dominant ? `outlined: the ${dominantName}’s own` : undefined}>
            <div className="chips chips--4">
              {SPACES.map((s) => (
                <Chip key={s} on={c.space === s} implied={!c.space && ownSpace === s} onClick={() => set({ space: c.space === s ? null : s })}>{SPACE_LABELS[s]}</Chip>
              ))}
            </div>
          </Group>
          <label className="style-panel__keep">
            <input type="checkbox" checked={keepFx} onChange={(e) => setKeepFx(e.target.checked)} />
            Keep my effects
          </label>
        </details>
      </div>

      <div className="style-sheet__foot">
        <Slider label="Mix" left="my voice" right="wheel" value={mix} min={0} onChange={setMix} percent
          title="All the way: the wheel’s voice. Less: your voice moved that far towards it." />
        <div className="style-sheet__wild">
          <Slider label="Wild" left="typical" right="mutated" value={wild} min={0} onChange={setWild}
            title="First half: further into the tonalities’ ranges. Second half: random changes on top as well." />
          <button className="icon dice" onClick={another} aria-label="Another variation" title="Another variation: the same pins">
            <svg viewBox="0 0 16 16" className="icon__svg" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="2.5" />
              <circle cx="5.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="10.5" cy="10.5" r=".9" fill="currentColor" />
              <circle cx="10.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="5.5" cy="10.5" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" />
            </svg>
          </button>
          <button onClick={mutate} title="Move the pins and the controls a little: somewhere else on the wheel">Mutate</button>
        </div>
        <div className="style-sheet__actions">
          <button className={`link${neutral ? ' hidden' : ''}`} onClick={reset} tabIndex={neutral ? -1 : 0}>Clear choices</button>
          <span />
          <button onClick={cancel} title="Back to the voice as it was (Escape)">Cancel</button>
          <button className="primary" onClick={apply} disabled={!dirty} title={dirty ? 'Keep what you hear (one undo step)' : 'Change something first'}>Apply</button>
        </div>
      </div>
    </aside>
  )
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="style-panel__group">
      <h4>{title}{note && <span className="dim"> · {note}</span>}</h4>
      {children}
    </div>
  )
}

function Chip({ on, implied, onClick, title, children }: { on: boolean; implied?: boolean; onClick(): void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}${implied ? ' implied' : ''}`} aria-pressed={on} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

/** A slider with its ends named; double-click goes back to neutral (or `onReset`). */
function Slider({ label, left, right, value, min, max = 1, neutral, percent, title, dimmed, onChange, onReset }: {
  label: string; left?: string; right?: string; value: number; min: number; max?: number; neutral?: number; percent?: boolean; title?: string; dimmed?: boolean
  onChange(v: number): void; onReset?(): void
}) {
  const home = neutral ?? (min < 0 ? 0 : min)
  return (
    <label className={`slider${dimmed ? ' slider--dimmed' : ''}`} onDoubleClick={() => !percent && (onReset ? onReset() : onChange(home))} title={title ?? (percent ? undefined : 'Double-click: back to neutral')}>
      <span className="slider__label">{label}</span>
      {left && <span className="slider__end dim">{left}</span>}
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {right && <span className="slider__end dim">{right}</span>}
      {percent && <span className="slider__value">{Math.round(value * 100)} %</span>}
    </label>
  )
}
