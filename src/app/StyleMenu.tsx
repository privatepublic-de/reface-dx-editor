// Init and the style editor (PLAN §7.2). Init is the plain VOICE INIT in one click. The Style tab opens a panel
// joined to it, docked on the left: it caches the voice, and every choice plays on the DX at once (paced Parameter
// Changes, sounding notes keep sounding). Mix goes from the voice as it was to a new voice in the style; Wild from
// typical to anywhere in the style's ranges and then mutated; the dice tries another variation. Apply keeps what
// you hear as one undo step, Cancel (or Escape) goes back. Every chip keeps its size, so nothing moves while you choose.
import { useEffect, useRef } from 'react'
import {
  CHARACTER_LABELS, CHARACTERS, COLOUR_LABELS, COLOURS, FAMILIES, FAMILY_HINTS, FAMILY_LABELS, isEmpty, MODE_BYTE, MODE_HINTS, MODE_LABELS, MODES, SHAPE_HINTS,
  SHAPE_LABELS, SHAPES, SPACE_LABELS, SPACES, type Character,
} from '../style/choices'
import { TEMPLATES } from '../style/templates'
import { colourOf } from '../style/transforms'
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

export function StyleSheet() {
  const { choices: c, mix, wild, more, dirty, original, set, setMix, setWild, setMore, another, reset, apply, cancel } = useStyle()
  const first = useRef<HTMLDivElement>(null)
  // what the family brings when nothing is chosen: shown outlined, not as a choice
  const template = c.family && c.family !== 'any' ? TEMPLATES[c.family] : null
  const ownMode = template && mix >= 1 ? MODE_BYTE[template.mono ?? 'poly'] : original?.common[0x0d]
  const familyName = template ? FAMILY_LABELS[c.family as keyof typeof FAMILY_LABELS].toLowerCase() : ''
  useEffect(() => first.current?.querySelector('button')?.focus(), [])
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
    <aside className="style-sheet" id="style-panel" role="dialog" aria-label="Style">
      <div className="style-sheet__body">
        <Group title="Family">
          <div className="chips chips--4" ref={first}>
            {FAMILIES.map((f) => (
              <Chip key={f} on={c.family === f} onClick={() => set({ family: c.family === f ? null : f })} title={FAMILY_HINTS[f]}>{FAMILY_LABELS[f]}</Chip>
            ))}
            <Chip on={c.family === 'any'} onClick={() => set({ family: c.family === 'any' ? null : 'any' })} title="A family picked at random (the dice picks again)">Any</Chip>
          </div>
        </Group>

        <Group title="Character">
          <div className="chips chips--5">
            {CHARACTERS.map((k: Character) => {
              const on = !!c.characters[k]
              return <Chip key={k} on={on} onClick={() => set({ characters: { ...c.characters, [k]: on ? 0 : 1 } })}>{CHARACTER_LABELS[k]}</Chip>
            })}
          </div>
        </Group>

        <Slider label="Brightness" left="mellow" right="bright" value={c.brightness} min={-1} onChange={(v) => set({ brightness: v })} />

        <Group title="Envelope" note={template && !c.shape ? `outlined: the ${familyName}’s own` : undefined}>
          <div className="chips chips--6">
            {SHAPES.map((s) => (
              <Chip key={s} on={c.shape === s} implied={!c.shape && template?.shape === s} onClick={() => set({ shape: c.shape === s ? null : s })} title={SHAPE_HINTS[s]}>
                {SHAPE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="Play" note={!c.mode ? `outlined: ${template && mix >= 1 ? `the ${familyName}’s own` : 'as your voice has it'}` : undefined}>
          <div className="chips chips--3">
            {MODES.map((m) => (
              <Chip key={m} on={c.mode === m} implied={!c.mode && ownMode === MODE_BYTE[m]} onClick={() => set({ mode: c.mode === m ? null : m })} title={MODE_HINTS[m]}>
                {MODE_LABELS[m]}
              </Chip>
            ))}
          </div>
        </Group>

        <details className="style-panel__more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>More: length, movement, treble, effects</summary>
          <div className="style-panel__sliders">
            <Slider label="Length" left="short" right="long" value={c.length} min={-1} onChange={(v) => set({ length: v })} />
            <Slider label="Evolving" left="still" right="moving" value={c.evolving} min={0} onChange={(v) => set({ evolving: v })} />
            <Slider label="Expressive" left="even" right="touch" value={c.expressive} min={0} onChange={(v) => set({ expressive: v })} />
            <Slider label="Treble" left="tamer" right="brighter" value={c.treble} min={-1} onChange={(v) => set({ treble: v })} title="How the brightness changes up the keyboard" />
          </div>
          <Group title="Colour" note={!c.colour ? 'outlined: what the characters bring' : undefined}>
            <div className="chips chips--6">
              {COLOURS.map((k) => (
                <Chip key={k} on={c.colour === k} implied={!c.colour && colourOf(c) === k} onClick={() => set({ colour: c.colour === k ? null : k })}
                  title={k === 'drive' ? 'With square feedback on a modulator' : undefined}>{COLOUR_LABELS[k]}</Chip>
              ))}
            </div>
          </Group>
          <Group title="Space">
            <div className="chips chips--4">
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
        <Slider label="Mix" left="my voice" right="style" value={mix} min={0} onChange={setMix} percent
          title="All the way: a new voice in the style. Less: your voice moved that far towards it." />
        <div className="style-sheet__wild">
          <Slider label="Wild" left="typical" right="mutated" value={wild} min={0} onChange={setWild}
            title="First half: further into the style’s ranges. Second half: random changes on top as well." />
          <button className="icon dice" onClick={another} aria-label="Another variation" title="Another variation">
            <svg viewBox="0 0 16 16" className="icon__svg" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="2.5" />
              <circle cx="5.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="10.5" cy="10.5" r=".9" fill="currentColor" />
              <circle cx="10.5" cy="5.5" r=".9" fill="currentColor" /><circle cx="5.5" cy="10.5" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="style-sheet__actions">
          <button className={`link${isEmpty(c) ? ' hidden' : ''}`} onClick={reset} tabIndex={isEmpty(c) ? -1 : 0}>Clear choices</button>
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
