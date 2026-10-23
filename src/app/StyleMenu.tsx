// Init and the style editor (PLAN §7.2). Init is the plain VOICE INIT in one click. Style… opens a sub-editor
// docked beside the editor: it caches the voice, and every choice plays on the DX at once (paced Parameter Changes,
// sounding notes keep sounding). It starts from a new voice in the style (typical … wild) or from your voice moved
// towards it; Mutate adds random changes. Apply keeps what you hear as one undo step, Cancel (or Escape) goes back.
// Every chip keeps its size whatever its state, so nothing moves while you choose.
import { useEffect, useRef } from 'react'
import {
  CHARACTER_LABELS, CHARACTERS, FAMILIES, FAMILY_HINTS, FAMILY_LABELS, isEmpty, MODE_BYTE, MODE_HINTS, MODE_LABELS, MODES, SHAPE_HINTS, SHAPE_LABELS, SHAPES, SPACE_LABELS, SPACES,
  type Character, type StyleChoices,
} from '../style/choices'
import { TEMPLATES } from '../style/templates'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'
import { useStyle } from './styleStore'

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

export function StyleMenu() {
  const open = useStyle((s) => s.open)
  const isOpen = useStyle((s) => !!s.original)
  return (
    <button className="voice-title__init" onClick={open} aria-expanded={isOpen} disabled={useBusy() || isOpen}
      title="The style editor: a new voice in a style, or this voice towards one, heard as you choose">
      Style…
    </button>
  )
}

/** The character's amount steps through off → some → much on each click. */
const nextAmount = (a: number) => (a <= 0 ? 0.5 : a < 1 ? 1 : 0)
const dots = (a: number) => (a <= 0 ? '' : a < 1 ? '•' : '••')
const signed = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`

/** The choices read back in one line. */
function summary(c: StyleChoices): string {
  if (isEmpty(c)) return 'Nothing chosen yet: New voice gives the plain VOICE INIT.'
  const parts = [
    c.family === 'any' ? 'Any family' : c.family && FAMILY_LABELS[c.family],
    c.shape && SHAPE_LABELS[c.shape],
    c.mode && MODE_LABELS[c.mode],
    ...CHARACTERS.filter((k) => c.characters[k]).map((k) => `${CHARACTER_LABELS[k]} ${dots(c.characters[k]!)}`),
    c.brightness && `Brightness ${signed(c.brightness)}`,
    c.length && `Length ${signed(c.length)}`,
    c.evolving && 'Evolving',
    c.expressive && 'Expressive',
    c.treble && `Treble ${signed(c.treble)}`,
    c.drive && 'Drive',
    c.space && SPACE_LABELS[c.space],
    c.keepFx && 'your effects',
  ]
  return parts.filter(Boolean).join(' · ')
}

/** The style editor, docked beside the editor (which stays visible, locked, its knobs following the preview). */
export function StyleSheet() {
  const st = useStyle()
  const { choices: c, start, amount, variation, mutate, more, dirty, set, setStart, setAmount, setVariation, setMutate, setMore, another, reset, apply, cancel } = st
  const empty = isEmpty(c)
  const heading = useRef<HTMLHeadingElement>(null)
  // what the family brings when no envelope or space is chosen: shown as an outline, not as a choice
  const template = c.family && c.family !== 'any' ? TEMPLATES[c.family] : null
  // the play mode it keeps when none is chosen: the family's, or (from my voice, or without a family) the voice's
  const original = useStyle((s) => s.original)
  const ownMode = template && start === 'new' ? MODE_BYTE[template.mono ?? 'poly'] : original?.common[0x0d]
  useEffect(() => heading.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as Element).closest?.('dialog')) return
      e.preventDefault()
      useStyle.getState().cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <aside className="style-sheet" role="dialog" aria-labelledby="style-sheet-title">
      <div className="style-sheet__head">
        <h3 id="style-sheet-title" tabIndex={-1} ref={heading}>Style</h3>
        <div className="seg" role="group" aria-label="Start from">
          <button className={start === 'new' ? 'on' : ''} aria-pressed={start === 'new'} onClick={() => setStart('new')} title="A new voice in the style">New voice</button>
          <button className={start === 'mine' ? 'on' : ''} aria-pressed={start === 'mine'} onClick={() => setStart('mine')} title="The voice you had, moved towards the style">My voice</button>
        </div>
      </div>
      <div className="style-panel__summary">
        <span>{summary(c)}</span>
        <button className={`link${empty ? ' hidden' : ''}`} onClick={reset} tabIndex={empty ? -1 : 0}>Clear</button>
      </div>

      <div className="style-sheet__body">
        <Group title="Family">
          <div className="chips chips--6">
            {FAMILIES.map((f) => (
              <Chip key={f} on={c.family === f} onClick={() => set({ family: c.family === f ? null : f })} title={FAMILY_HINTS[f]}>{FAMILY_LABELS[f]}</Chip>
            ))}
            <Chip on={c.family === 'any'} onClick={() => set({ family: c.family === 'any' ? null : 'any' })} title="A family picked at random (Another picks again)">Any</Chip>
          </div>
        </Group>

        <Group title="Character" note="click for some, again for much, a third time for off">
          <div className="chips chips--4">
            {CHARACTERS.map((k: Character) => {
              const a = c.characters[k] ?? 0
              return (
                <Chip key={k} on={a > 0} onClick={() => set({ characters: { ...c.characters, [k]: nextAmount(a) } })} title={`${CHARACTER_LABELS[k]}: ${a === 0 ? 'off' : a < 1 ? 'some' : 'much'}`}>
                  {CHARACTER_LABELS[k]}
                  <span className="chip__amount" aria-hidden>{dots(a)}</span>
                </Chip>
              )
            })}
          </div>
        </Group>

        <Slider label="Brightness" left="mellow" right="bright" value={c.brightness} min={-1} onChange={(v) => set({ brightness: v })} />

        <Group title="Envelope" note={template && !c.shape ? `outlined: the ${FAMILY_LABELS[c.family as keyof typeof FAMILY_LABELS].toLowerCase()}’s own` : undefined}>
          <div className="chips chips--6">
            {SHAPES.map((s) => (
              <Chip key={s} on={c.shape === s} implied={!c.shape && template?.shape === s} onClick={() => set({ shape: c.shape === s ? null : s })} title={SHAPE_HINTS[s]}>
                {SHAPE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="Play" note={!c.mode ? `outlined: ${template && start === 'new' ? `the ${FAMILY_LABELS[c.family as keyof typeof FAMILY_LABELS].toLowerCase()}’s own` : 'as your voice has it'}` : undefined}>
          <div className="chips chips--3">
            {MODES.map((m) => (
              <Chip key={m} on={c.mode === m} implied={!c.mode && ownMode === MODE_BYTE[m]} onClick={() => set({ mode: c.mode === m ? null : m })} title={MODE_HINTS[m]}>
                {MODE_LABELS[m]}
              </Chip>
            ))}
          </div>
        </Group>

        <details className="style-panel__more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>More: length, movement, treble, drive, space and effects</summary>
          <div className="style-panel__sliders">
            <Slider label="Length" left="short" right="long" value={c.length} min={-1} onChange={(v) => set({ length: v })} />
            <Slider label="Evolving" left="still" right="moving" value={c.evolving} min={0} onChange={(v) => set({ evolving: v })} />
            <Slider label="Expressive" left="even" right="touch" value={c.expressive} min={0} onChange={(v) => set({ expressive: v })} />
            <Slider label="Treble" left="tamer" right="brighter" value={c.treble} min={-1} onChange={(v) => set({ treble: v })} title="How the brightness changes up the keyboard" />
            <Slider label="Drive" left="clean" right="driven" value={c.drive} min={0} onChange={(v) => set({ drive: v })} title="The distortion effect, and square feedback on a modulator" />
          </div>
          <Group title="Space">
            <div className="chips chips--5">
              {SPACES.map((s) => (
                <Chip key={s} on={c.space === s} implied={!c.space && template?.space === s} onClick={() => set({ space: c.space === s ? null : s })}>{SPACE_LABELS[s]}</Chip>
              ))}
            </div>
          </Group>
          <label className="style-panel__keep">
            <input type="checkbox" checked={c.keepFx} onChange={(e) => set({ keepFx: e.target.checked })} />
            Keep my effects
          </label>
        </details>
      </div>

      <div className="style-sheet__foot">
        <div className="style-panel__sliders">
          {start === 'new'
            ? <Slider label="Variation" left="typical" right="wild" value={variation} min={0} onChange={setVariation} />
            : <Slider label="Towards" left="my voice" right="the style" value={amount} min={0} onChange={setAmount} title="0: your voice as it was; all the way: the style" />}
          <Slider label="Mutate" left="none" right="much" value={mutate / 100} min={0} onChange={(v) => setMutate(Math.round(v * 100))} title="Random changes on top" />
        </div>
        <div className="style-sheet__actions">
          <button onClick={another} title="Another variation of the style (and of the mutation)">Another</button>
          <span className="note">{dirty ? 'You hear every change. Apply keeps it as one undo step.' : 'Your voice plays as it was until you change something.'}</span>
          <button onClick={cancel} title="Back to the voice as it was (Escape)">Cancel</button>
          <button className="primary" onClick={apply} disabled={!dirty}>Apply</button>
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

/** A slider with its ends named; double-click goes back to neutral. */
function Slider({ label, left, right, value, min, max = 1, percent, title, onChange }: {
  label: string; left?: string; right?: string; value: number; min: number; max?: number; percent?: boolean; title?: string; onChange(v: number): void
}) {
  const neutral = min < 0 ? 0 : min
  return (
    <label className="slider" onDoubleClick={() => !percent && onChange(neutral)} title={title ?? (percent ? undefined : 'Double-click: back to neutral')}>
      <span className="slider__label">{label}</span>
      {left && <span className="slider__end dim">{left}</span>}
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {right && <span className="slider__end dim">{right}</span>}
      {percent && <span className="slider__value">{Math.round(value * 100)} %</span>}
    </label>
  )
}
