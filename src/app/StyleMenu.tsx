// Init and Style ▾ (PLAN §7.2). Init is the plain VOICE INIT in one click. Style ▾ holds the style choices and two
// kinds of action: a new voice in the style (typical … wild), or a step for the voice you have (towards the style,
// or a random mutation). Each is one undo step and goes to the DX as paced Parameter Changes, so sounding notes keep
// sounding. Every chip keeps its size whatever its state, so nothing moves while you choose.
import {
  CHARACTER_LABELS, CHARACTERS, FAMILIES, FAMILY_HINTS, FAMILY_LABELS, isEmpty, SHAPE_HINTS, SHAPE_LABELS, SHAPES, SPACE_LABELS, SPACES,
  type Character, type StyleChoices,
} from '../style/choices'
import { newSeed } from '../style/random'
import { mutate, styleAdjust, styleInit } from '../style/style'
import { TEMPLATES } from '../style/templates'
import { voiceName } from '../sysex/codec'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'
import { useStyle } from './styleStore'
import { usePopover } from './usePopover'

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
  const { open, setOpen, anchor } = usePopover()
  return (
    <span className="popup-anchor" ref={anchor}>
      <button className="voice-title__init" onClick={() => setOpen(!open)} aria-expanded={open} disabled={useBusy()}
        title="A new voice in a style, or move this voice towards one">
        Style ▾
      </button>
      {open && <StylePanel />}
    </span>
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

function StylePanel() {
  const { choices: c, amount, mutatePercent, variation, more, seed, set, setAmount, setMutatePercent, setVariation, setMore, reroll, reset } = useStyle()
  const applyVoice = useEditor((s) => s.applyVoice)
  const current = () => useEditor.getState().voice!
  const empty = isEmpty(c)
  // what the family brings when no envelope or space is chosen: shown as an outline, not as a choice
  const template = c.family && c.family !== 'any' ? TEMPLATES[c.family] : null
  const newVoice = (s: number) => {
    const v = styleInit(c, s, current(), variation)
    applyVoice(v, empty ? 'Init voice' : `New “${voiceName(v)}”`)
  }
  return (
    <div className="popup style-panel" role="dialog" aria-label="Styles">
      <div className="style-panel__summary">
        <span>{summary(c)}</span>
        <button className={`link${empty ? ' hidden' : ''}`} onClick={reset} tabIndex={empty ? -1 : 0}>Clear</button>
      </div>

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

      <div className="style-panel__actions">
        <section>
          <h4>New voice in this style</h4>
          <div className="style-panel__row">
            <button className="primary" onClick={() => newVoice(seed)} title="Replaces the sound with a voice in this style (the same one until Another)">New voice</button>
            <button onClick={() => newVoice(reroll())} title="Another voice in this style">Another</button>
          </div>
          <Slider label="Variation" left="typical" right="wild" value={variation} min={0} onChange={setVariation} compact />
        </section>
        <section>
          <h4>Change this voice</h4>
          <div className="style-panel__row">
            <button disabled={empty} onClick={() => applyVoice(styleAdjust(current(), c, amount, seed, newSeed(), variation), `Towards style ${Math.round(amount * 100)} %`)}
              title={empty ? 'Choose something in the style first' : 'Moves this voice a step towards the style; click again to go further. Without a family it keeps its algorithm and ratios.'}>
              Towards style
            </button>
            <Slider label="by" value={amount} min={0.05} max={1} percent onChange={setAmount} compact />
          </div>
          <div className="style-panel__row">
            <button onClick={() => applyVoice(mutate(current(), mutatePercent, newSeed(), c.keepFx), `Mutate ${mutatePercent} %`)}
              title="Small random changes to this voice; ignores the style">
              Mutate
            </button>
            <Slider label="by" value={mutatePercent / 100} min={0.01} max={1} percent onChange={(v) => setMutatePercent(Math.round(v * 100))} compact />
          </div>
        </section>
      </div>
      <p className="note">Each is one undo step. Nothing is stored on the DX until you Store.</p>
    </div>
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
function Slider({ label, left, right, value, min, max = 1, percent, compact, title, onChange }: {
  label: string; left?: string; right?: string; value: number; min: number; max?: number; percent?: boolean; compact?: boolean; title?: string; onChange(v: number): void
}) {
  const neutral = min < 0 ? 0 : min
  return (
    <label className={`slider${compact ? ' slider--compact' : ''}`} onDoubleClick={() => !percent && onChange(neutral)} title={title ?? (percent ? undefined : 'Double-click: back to neutral')}>
      <span className="slider__label">{label}</span>
      {left && <span className="slider__end dim">{left}</span>}
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {right && <span className="slider__end dim">{right}</span>}
      {percent && <span className="slider__value">{Math.round(value * 100)} %</span>}
    </label>
  )
}
