// Init and the Style window (PLAN §8). Init is the plain VOICE INIT in one click. The Style button opens a window
// above the keyboard. The wheel is the instrument (wheel/, after the volca fm generator): a sentence under it says
// what the pins made, three buttons beside it go on by size (Variation, Mutate, New voice), and Start from… offers
// the classic DX7 instruments as the base instead of a tonality (wheel/instruments.ts), the pins then colour it.
// Below, the three things changed most (brightness, complexity, motion) and the envelope; how it plays, the rest of
// the sound and the effects fold away, each saying what's set while closed. Every change plays on the DX at once
// (paced Parameter Changes, sounding notes keep sounding). Mix goes from the voice as it was to the wheel's; Apply
// keeps what you hear as one undo step, Cancel (or Escape) goes back. Every chip keeps its size, so nothing moves
// while you choose.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { COLOUR_LABELS, COLOURS, MODE_BYTE, MODE_HINTS, MODES, SHAPE_HINTS, SPACE_LABELS, SPACES, type Mode } from '../style/choices'
import type { Envelope } from '../style/shapes'
import { TONALITY_HUES, TONALITY_LABELS, type Tonality } from '../wheel/choices'
import { TONALITY_SPACE } from '../wheel/controls'
import type { WheelVoice } from '../wheel/generate'
import { voiceName } from '../sysex/codec'
import { INSTRUMENT_GROUP_LABELS, INSTRUMENT_GROUPS, INSTRUMENT_IDS, instrumentName, INSTRUMENTS, type InstrumentId } from '../wheel/instruments'
import { TONALITY_DEFS } from '../wheel/tonalities'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'
import { useStyle, type Section, type SheetChoices } from './styleStore'
import { OwnCurve, OwnSign, ShapeIcon } from './EnvelopeDrawings'
import { Weights } from './Weights'
import { Wheel } from './Wheel'

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

/** The Style button: opens the Style window. */
export function StyleMenu() {
  const open = useStyle((s) => s.open)
  const isOpen = useStyle((s) => !!s.original)
  const busy = useBusy()
  return (
    <button className="voice-title__init" onClick={open} aria-haspopup="dialog" disabled={busy || isOpen}
      title="Make a voice on the tonality wheel, and hear it as you choose">
      Style
    </button>
  )
}

/** The envelopes offered: the style editor's six and the swell (brightness rising into the note). */
const ENVELOPES: Envelope[] = ['pluck', 'struck', 'bowed', 'pad', 'swell', 'gate', 'reverse']
const ENVELOPE_LABELS: Record<Envelope, string> = { pluck: 'Pluck', struck: 'Struck', bowed: 'Bowed', pad: 'Pad', swell: 'Swell', gate: 'Gate', reverse: 'Reverse' }
const ENVELOPE_HINTS: Record<Envelope, string> = { ...SHAPE_HINTS, struck: 'A quick drop, then a long fade', swell: 'The brightness rises into the note' }
const REGISTERS = [['sub', 'Sub', 'Two octaves down'], ['bass', 'Bass', 'An octave down'], ['mid', 'Mid', 'Where the tonality plays'], ['high', 'High', 'An octave up']] as const
const PLAYS = [...MODES.map((m) => [m, { poly: 'Poly', mono: 'Mono', legato: 'Legato' }[m], MODE_HINTS[m]] as const), ['lead', 'Lead', 'One note at a time, gliding, with vibrato']] as const
const TOUCH = [[0, 'None', 'Every note alike'], [0.5, 'Some', 'A little louder and brighter when you play harder'], [1, 'Strong', 'Much louder and brighter when you play harder']] as const

/** What the pins made, in one sentence: the heaviest (or the instrument), then the others by how they came in. */
function sentence(g: WheelVoice | null, instrument: InstrumentId | null): ReactNode {
  if (!g || (g.mix.length < 1 && !instrument)) return null
  const name = (t: Tonality) => <b key={t} style={{ color: `hsl(${TONALITY_HUES[t]} 72% 72%)` }}>{TONALITY_LABELS[t]}</b>
  const list = (ts: Tonality[]) => ts.flatMap((t, i) => [i ? (i === ts.length - 1 ? ' and ' : ', ') : '', name(t)])
  const by = (...as: string[]) => g.roles.slice(1).filter((r) => as.includes(r.as)).map((r) => r.tonality)
  const parts: ReactNode[] = []
  if (by('branch', 'solo').length) parts.push(<>with {list(by('branch', 'solo'))} as a second part</>)
  if (by('graft').length) parts.push(<>{list(by('graft'))} in its tone</>)
  if (by('transform').length) parts.push(<>tinted by {list(by('transform'))}</>)
  const base = instrument
    ? <b style={{ color: `hsl(${TONALITY_HUES[INSTRUMENTS[instrument].family]} 72% 72%)` }}>{instrumentName(instrument)}</b>
    : name(g.roles[0].tonality)
  return <>{base}{parts.map((p, i) => <span key={i}>, {p}</span>)}</>
}

/** Start from…: the instruments in their groups, over the window's body. Picking one makes it the base. */
function StartFrom({ current, onPick, onClose }: { current: InstrumentId | null; onPick(id: InstrumentId): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.chip.on, .chip')?.focus()
    const away = (e: PointerEvent) => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest?.('[data-start-toggle]')) onClose()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [onClose])
  return (
    <div className="start-from" ref={ref} role="dialog" aria-label="Start from an instrument">
      <div className="start-from__head">
        <h3>Start from</h3>
        <span className="dim">Classic DX7 instruments on the reface’s four operators. Pins colour them.</span>
        <button className="style-sheet__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {INSTRUMENT_GROUPS.map((g) => (
        <div className="start-from__group" key={g}>
          <span className="style-row__label">{INSTRUMENT_GROUP_LABELS[g]}</span>
          <div className="chips chips--wrap">
            {INSTRUMENT_IDS.filter((id) => INSTRUMENTS[id].group === g).map((id) => (
              <Chip key={id} on={current === id} onClick={() => onPick(id)} title={INSTRUMENTS[id].hint}>{INSTRUMENTS[id].label}</Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A folded section's line while closed: what's set in it, or what it does when nothing is. */
function summaries(c: SheetChoices, own: { shapeName: string; spaceName: string }, keepFx: boolean, wild: number): Record<Section, string> {
  const playing = [
    c.register === 'lead' ? 'lead' : c.register && c.register !== 'mid' ? REGISTERS.find(([r]) => r === c.register)![1].toLowerCase() : '',
    c.mode ?? '',
    c.velocity === null ? '' : `${TOUCH.reduce((a, t) => (Math.abs(t[0] - c.velocity!) < Math.abs(a[0] - c.velocity!) ? t : a))[1].toLowerCase()} touch`,
    c.pitchAccent ? 'accent' : '',
  ].filter(Boolean)
  const more = [
    c.length ? (c.length > 0 ? 'longer' : 'shorter') : '',
    c.treble ? (c.treble > 0 ? 'brighter up the keys' : 'tamer up the keys') : '',
    wild > 0.5 ? 'wild' : '',
  ].filter(Boolean)
  const effects = keepFx ? ['yours'] : [c.colour && c.colour !== 'clean' ? COLOUR_LABELS[c.colour].toLowerCase() : '', c.space ? SPACE_LABELS[c.space].toLowerCase() : ''].filter(Boolean)
  return {
    playing: playing.join(', ') || 'register, mode, touch, accent',
    more: more.join(', ') || 'length, treble, wildness',
    effects: effects.join(', ') || own.spaceName,
  }
}

export function StyleSheet() {
  const { choices: c, mix, wild, sections, keepFx, dirty, original, generated, set, setMix, setWild, setSection, setKeepFx, another, mutate, newVoice, startFrom, reset, apply, cancel } = useStyle()
  const first = useRef<HTMLDivElement>(null)
  const [choosing, setChoosing] = useState(false)
  const choosingRef = useRef(choosing)
  choosingRef.current = choosing
  const voice = useEditor((s) => s.voice)
  // what the heaviest tonality brings when nothing is chosen: shown outlined, not as a choice
  const dominant = generated?.roles[0].tonality ?? null
  // an instrument's own envelope is its original's: Own draws it, no shape stands for it
  const ownShape = dominant && !c.instrument ? TONALITY_DEFS[dominant].skeleton.shape : null
  const ownSpace = dominant ? TONALITY_SPACE[dominant] : null
  const ownMode = mix >= 1 ? MODE_BYTE.poly : original?.common[0x0d]
  const dominantName = dominant ? TONALITY_LABELS[dominant].toLowerCase() : 'tonality'
  const neutral = !c.pins.length && !c.instrument && !c.shape && !c.length && !c.brightness && !c.treble && c.complexity === 0.5 && !c.motion && !c.register && c.velocity === null && !c.pitchAccent && !c.mode && !c.colour && !c.space
  const said = summaries(c, { shapeName: ownShape ?? '', spaceName: ownSpace ? `the ${dominantName}’s own ${SPACE_LABELS[ownSpace].toLowerCase()}` : 'colour and space' }, keepFx, wild)
  useEffect(() => first.current?.querySelector<HTMLElement>('.wheel-centre')?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as Element).closest?.('dialog')) return
      e.preventDefault()
      // Escape closes Start from first
      if (choosingRef.current) setChoosing(false)
      else useStyle.getState().cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const isMode = (m: Mode | 'lead') => (m === 'lead' ? c.register === 'lead' : c.mode === m && c.register !== 'lead')
  const setPlay = (m: Mode | 'lead') => {
    if (m === 'lead') set(c.register === 'lead' ? { register: null } : { register: 'lead', mode: null })
    else set({ mode: c.mode === m ? null : m, register: c.register === 'lead' ? null : c.register })
  }
  return (
    <aside className="style-sheet" id="style-panel" role="dialog" aria-modal="true" aria-labelledby="style-title">
      <div className="style-sheet__head">
        <h2 id="style-title">Style</h2>
        {voice && <span className="style-sheet__voice" title="What you hear">{voiceName(voice)}</span>}
        <span />
        <button className="style-sheet__close" onClick={cancel} aria-label="Close without keeping" title="Close without keeping (Escape)">×</button>
      </div>
      <div className="style-sheet__body">
        <div className="style-wheel" ref={first}>
          <Wheel />
          <Weights />
          <p className="style-wheel__said" aria-live="polite">
            {c.pins.length || c.instrument ? sentence(generated, c.instrument) : 'Click the wheel to pin a tonality, up to three.'}
            {c.instrument && (
              <button className="style-wheel__off" onClick={() => startFrom(null)} aria-label={`Without the ${instrumentName(c.instrument).toLowerCase()}`}
                title="Back to the wheel alone">×</button>
            )}
          </p>
          <div className="style-wheel__actions">
            <button onClick={another} title={c.instrument ? 'The same pins, the details moved; another of the instrument’s originals where it has several' : 'The same pins, the details moved'}>
              <svg viewBox="0 0 16 16" className="icon__svg" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" rx="2.5" />
                <circle cx="5.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="10.5" cy="10.5" r=".9" fill="currentColor" />
                <circle cx="10.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="5.5" cy="10.5" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" />
              </svg>
              Variation
            </button>
            <button onClick={mutate} title="The pins and the controls moved a little: somewhere else on the wheel">Mutate</button>
            <button onClick={newVoice} title="New pins anywhere on the wheel (or click its centre)">New voice</button>
            <button data-start-toggle aria-expanded={choosing} onClick={() => setChoosing(!choosing)}
              title="One of 41 classic DX7 instruments as the base: keys, plucked, mallets, bass, winds, brass, strings, percussion, voices">Start from…</button>
          </div>
        </div>
        {choosing && <StartFrom current={c.instrument} onPick={(id) => { startFrom(id); setChoosing(false) }} onClose={() => setChoosing(false)} />}

        <div className="style-controls">
        <div className="style-rows">
          <Slider label="Brightness" left="mellow" right="bright" value={c.brightness} min={-1} onChange={(v) => set({ brightness: v })} />
          <Slider label="Complexity" left="pure" right="dense" value={c.complexity} min={0} neutral={0.5} ticks={[0.5]} onChange={(v) => set({ complexity: v })}
            title="Pure: two operators. Dense: all four, stacked deeper. The middle mark: the tonalities’ own." />
          <Slider label="Motion" left="still" right="alive" value={c.motion} min={0} onChange={(v) => set({ motion: v })} />
          <Row label="Envelope">
            <div className="chips chips--8 chips--drawn">
              <Chip on={!c.shape} onClick={() => set({ shape: null })}
                title={`${c.instrument ? `The ${instrumentName(c.instrument).toLowerCase()}’s own` : ownShape ? `The ${dominantName}’s own: ${ENVELOPE_LABELS[ownShape].toLowerCase()}` : 'The tonality’s own'}. Drawn: the envelope you hear, as the DX plays it`}>
                {!c.shape && voice ? <OwnCurve voice={voice} /> : <OwnSign />}
                <span>Own</span>
              </Chip>
              {ENVELOPES.map((s) => (
                <Chip key={s} on={c.shape === s} implied={!c.shape && ownShape === s} onClick={() => set({ shape: c.shape === s ? null : s })} title={ENVELOPE_HINTS[s]}>
                  <ShapeIcon shape={s} />
                  <span>{ENVELOPE_LABELS[s]}</span>
                </Chip>
              ))}
            </div>
          </Row>
        </div>

        <Fold section="playing" title="Playing" summary={said.playing} open={sections.includes('playing')} onToggle={setSection}>
          <Row label="Register">
            <div className="chips chips--4">
              {REGISTERS.map(([r, label, hint]) => (
                <Chip key={r} on={r === 'mid' ? !c.register || c.register === 'mid' || c.register === 'lead' : c.register === r} title={hint}
                  onClick={() => set({ register: r === 'mid' ? null : c.register === r ? null : r })}>{label}</Chip>
              ))}
            </div>
          </Row>
          <Row label="Mode">
            <div className="chips chips--4">
              {PLAYS.map(([m, label, hint]) => (
                <Chip key={m} on={isMode(m)} implied={m !== 'lead' && !c.mode && c.register !== 'lead' && ownMode === MODE_BYTE[m]} onClick={() => setPlay(m)} title={hint}>{label}</Chip>
              ))}
            </div>
          </Row>
          <Row label="Touch">
            <div className="chips chips--5">
              <Chip on={c.velocity === null} onClick={() => set({ velocity: null })} title="As the tonality answers to velocity">Own</Chip>
              {TOUCH.map(([x, label, hint]) => (
                <Chip key={label} on={c.velocity !== null && Math.abs(c.velocity - x) < 0.2} onClick={() => set({ velocity: x })} title={hint}>{label}</Chip>
              ))}
              <Chip on={c.pitchAccent} onClick={() => set({ pitchAccent: !c.pitchAccent })} title="A short pitch fall into each note">Accent</Chip>
            </div>
          </Row>
        </Fold>

        <Fold section="more" title="More" summary={said.more} open={sections.includes('more')} onToggle={setSection}>
          <Slider label="Length" left="short" right="long" value={c.length} min={-1} onChange={(v) => set({ length: v })} />
          <Slider label="Treble" left="tamer" right="brighter" value={c.treble} min={-1} onChange={(v) => set({ treble: v })} title="How the brightness changes up the keyboard" />
          <Slider label="Wildness" left="typical" right="wild" value={wild} min={0} onChange={setWild} title="How far into the tonalities’ ranges a voice may go" />
        </Fold>

        <Fold section="effects" title="Effects" summary={said.effects} open={sections.includes('effects')} onToggle={setSection}>
          <Row label="Colour">
            <div className="chips chips--6">
              {COLOURS.map((k) => (
                <Chip key={k} on={c.colour === k || (k === 'clean' && !c.colour)} onClick={() => set({ colour: k === 'clean' ? null : c.colour === k ? null : k })}>{COLOUR_LABELS[k]}</Chip>
              ))}
            </div>
          </Row>
          <Row label="Space">
            <div className="chips chips--5">
              <Chip on={!c.space} onClick={() => set({ space: null })} title={ownSpace ? `The ${dominantName}’s own: ${SPACE_LABELS[ownSpace].toLowerCase()}` : 'The tonality’s own'}>Own</Chip>
              {SPACES.map((s) => (
                <Chip key={s} on={c.space === s} implied={!c.space && ownSpace === s} onClick={() => set({ space: c.space === s ? null : s })}>{SPACE_LABELS[s]}</Chip>
              ))}
            </div>
          </Row>
          <label className="style-check">
            <input type="checkbox" checked={keepFx} onChange={(e) => setKeepFx(e.target.checked)} />
            Keep my effects
          </label>
        </Fold>
        </div>
      </div>

      <div className="style-sheet__foot">
        <Slider label="Mix" left="my voice" right="wheel" value={mix} min={0} onChange={setMix} percent
          title="All the way: the wheel’s voice. Less: your voice moved that far towards it." />
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

/** A label and its control, in the sheet's two columns. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="style-row">
      <span className="style-row__label">{label}</span>
      {children}
    </div>
  )
}

/** A section folded away: its title and, while closed, what's set in it. */
function Fold({ section, title, summary, open, onToggle, children }: {
  section: Section; title: string; summary: string; open: boolean; onToggle(section: Section, open: boolean): void; children: ReactNode
}) {
  return (
    <details className="style-fold" open={open} onToggle={(e) => e.currentTarget.open !== open && onToggle(section, e.currentTarget.open)}>
      <summary><span className="style-fold__title">{title}</span>{!open && <span className="style-fold__said">{summary}</span>}</summary>
      <div className="style-rows">{children}</div>
    </details>
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
function Slider({ label, left, right, value, min, max = 1, neutral, ticks, percent, title, dimmed, onChange, onReset }: {
  label: string; left?: string; right?: string; value: number; min: number; max?: number; neutral?: number; ticks?: number[]; percent?: boolean; title?: string
  dimmed?: boolean; onChange(v: number): void; onReset?(): void
}) {
  const home = neutral ?? (min < 0 ? 0 : min)
  const listId = ticks ? `ticks-${label.toLowerCase()}` : undefined
  return (
    <label className={`slider${dimmed ? ' slider--dimmed' : ''}`} onDoubleClick={() => !percent && (onReset ? onReset() : onChange(home))} title={title ?? (percent ? undefined : 'Double-click: back to neutral')}>
      <span className="slider__label">{label}</span>
      {left && <span className="slider__end dim">{left}</span>}
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} list={listId} />
      {ticks && <datalist id={listId}>{ticks.map((t) => <option key={t} value={t} />)}</datalist>}
      {right && <span className="slider__end dim">{right}</span>}
      {percent && <span className="slider__value">{Math.round(value * 100)} %</span>}
    </label>
  )
}
