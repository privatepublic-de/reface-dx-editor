import { useEffect, useMemo, useState } from 'react'
import { diffVoices, locationName, voiceName } from '../sysex/codec'
import { AboutDialog } from './AboutDialog'
import { Keyboard } from './Keyboard'
import { LibraryPanel } from './Library'
import { useLibrary } from './libraryStore'
import { SettingsDialog } from './SettingsDialog'
import { StoreButton } from './StoreButton'
import { Dx7Import } from './Dx7Import'
import { useDx7 } from './dx7Store'
import { InitButton, StyleMenu, StyleSheet } from './StyleMenu'
import { Panel } from './Panel'
import { isOnline, useEditor, type Status } from './store'
import { useStyle } from './styleStore'
import { usePopover } from './usePopover'

const MAC = /Mac|iPhone|iPad/.test(navigator.platform)
/** the style panel's width, px (narrower windows: all of it) */

const STATUS_TEXT: Record<Status, string> = {
  offline: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  demo: 'Demo (no DX)',
  notfound: 'No DX found',
  lost: 'Port gone',
}

export function App() {
  useUndoKeys()
  useAltKey()
  useResyncOnFocus()
  const styling = useStyle((s) => !!s.original)
  const importing = useDx7((s) => !!s.file)
  useStyleLayout(styling || importing)
  return (
    <>
      <ConnectionBar />
      <main className={styling || importing ? 'main--styling' : undefined}>
        <MainView />
        <Keyboard />
        <LibraryPanel />
      </main>
      {(styling || importing) && <div className="style-scrim" aria-hidden="true" />}
      {styling && <StyleSheet />}
      {importing && <Dx7Import />}
    </>
  )
}

/** While the Style window (or the DX7 import) is open: the bar, the editor and the library are locked (inert), the keyboard is pinned to
 *  the bottom and stays playable, and the window sits centred in the room above it (the keyboard's height as a CSS
 *  variable). */
function useStyleLayout(styling: boolean) {
  useEffect(() => {
    const locked = ['.bar', '.stage', '.library'].flatMap((q) => [...document.querySelectorAll(q)])
    locked.forEach((el) => el.toggleAttribute('inert', styling))
    document.body.classList.toggle('styling', styling)
    if (!styling) return
    const root = document.documentElement
    const measure = () => {
      root.style.setProperty('--keys-h', `${document.querySelector('.keys')?.getBoundingClientRect().height ?? 0}px`)
    }
    window.addEventListener('resize', measure)
    measure()
    const watch = new ResizeObserver(measure)
    for (const q of ['.keys']) {
      const el = document.querySelector(q)
      if (el) watch.observe(el)
    }
    return () => {
      window.removeEventListener('resize', measure)
      watch.disconnect()
      locked.forEach((el) => el.removeAttribute('inert'))
      document.body.classList.remove('styling')
    }
  }, [styling])
}

/** Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes, and Ctrl+Y off the Mac (where Cmd+Y isn't redo); not while typing in a field. */
function useUndoKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) useEditor.getState().undo()
      else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.shiftKey && !MAC)) useEditor.getState().redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Alt/Option held links envelope edits for the moment (PLAN §7.1). Pointer events say it too, in case a key event went elsewhere. */
function useAltKey() {
  useEffect(() => {
    const set = (held: boolean) => useEditor.getState().setAltHeld(held)
    const onKey = (e: KeyboardEvent) => set(e.altKey)
    const onPointer = (e: PointerEvent) => set(e.altKey)
    const off = () => set(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('blur', off)
    }
  }, [])
}

/** Edits made on the DX outside the FM section send nothing (FINDINGS Q5): coming back to the window reads the voice again. */
function useResyncOnFocus() {
  useEffect(() => {
    const onVisible = () => {
      const s = useEditor.getState()
      if (document.visibilityState === 'visible' && s.status === 'connected' && !s.reading && !s.styling) void s.resync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}

/** The bar: the wordmark, the voice (location, name, Edited), what you do to it, Help, and the connection at the far right. */
function ConnectionBar() {
  const online = useEditor((s) => isOnline(s.status))
  return (
    <header className={online ? 'bar' : 'bar bar--offline'}>
      <strong className="brand">reface DX</strong>
      {online ? <VoiceTitle /> : <span />}
      <div className="bar__end">
        {online && (
          <div className="bar__group" role="group" aria-label="Edit">
            <ResyncButton />
            <HistoryButtons />
            <StoreButton />
          </div>
        )}
        <div className="bar__group">
          {online && <SettingsButton />}
          <HelpButton />
        </div>
        <ConnectionButton />
      </div>
    </header>
  )
}

/** Where the voice is stored (once known), its name, and "Edited" when it differs from what the DX had. */
function VoiceTitle() {
  const { voice, baseline, program, reading, selectProgram } = useEditor()
  const edited = useMemo(() => !!voice && !!baseline && diffVoices(baseline, voice).length > 0, [voice, baseline])
  const memory = useLibrary((s) => s.memory)
  return (
    <div className="voice-title">
      <label className="voice-title__where" title={`${program === null ? 'The DX doesn’t say where this voice came from until a location is selected. ' : ''}Selects a stored voice on the DX (your edits to this one are dropped there)`}>
        <span className="visually-hidden">Location</span>
        <select value={program ?? ''} disabled={reading} onChange={(e) => void selectProgram(Number(e.target.value))}>
          {program === null && <option value="">?</option>}
          {Array.from({ length: 32 }, (_, p) => (
            // the name the DX's memory was last seen to hold there (Read all, or selecting it), when it's known
            <option key={p} value={p}>{memory[p] ? `${locationName(p)}\u2003${voiceName(memory[p]!.voice)}` : locationName(p)}</option>
          ))}
        </select>
      </label>
      <span className="voice-title__name">{voice ? voiceName(voice) || '(no name)' : '…'}</span>
      <span className={edited ? 'edited' : 'edited edited--hidden'} aria-hidden={!edited}>Edited</span>
      <InitButton />
      <StyleMenu />
    </div>
  )
}

function ResyncButton() {
  const { reading, resync } = useEditor()
  return (
    <button className="icon" onClick={() => void resync()} disabled={reading} aria-label="Read the voice again"
      title={reading ? 'Reading the voice…' : 'Read the voice from the DX again (after editing it on the DX: only FM-section moves come through by themselves)'}>
      <Icon d="M13 4.5A5.5 5.5 0 1 0 14 9M13 1.5v3h-3" spin={reading} />
    </button>
  )
}

function HistoryButtons() {
  const { undoLabel, redoLabel, undo, redo } = useEditor()
  return (
    <div className="bar__pair" role="group" aria-label="History">
      <button className="icon" onClick={undo} disabled={!undoLabel} aria-label="Undo" title={undoLabel ? `Undo ${undoLabel} (${MAC ? '⌘Z' : 'Ctrl+Z'})` : 'Nothing to undo'}>
        <Icon d="M5.5 3 2.5 6l3 3M2.5 6H10a3.5 3.5 0 0 1 0 7H7" />
      </button>
      <button className="icon" onClick={redo} disabled={!redoLabel} aria-label="Redo" title={redoLabel ? `Redo ${redoLabel} (${MAC ? '⇧⌘Z' : 'Ctrl+Y'})` : 'Nothing to redo'}>
        <Icon d="M10.5 3l3 3-3 3M13.5 6H6a3.5 3.5 0 0 0 0 7h3" />
      </button>
    </div>
  )
}

function Ports() {
  const { ports, settings, choosePorts } = useEditor()
  if (!ports.inputs.length) return null
  return (
    <span className="ports">
      <label>
        <span className="dim">MIDI in</span>
        <select value={settings.input ?? ''} onChange={(e) => choosePorts({ input: e.target.value })}>
          {ports.inputs.map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        <span className="dim">MIDI out</span>
        <select value={settings.output ?? ''} onChange={(e) => choosePorts({ output: e.target.value })}>
          {ports.outputs.map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
    </span>
  )
}

/** The connection, one button in one place: Connect before, Connected (or Demo) after, with the ports and the DX's MIDI settings. */
function ConnectionButton() {
  const { status, system, version, connect, disconnect, setSystemValue } = useEditor()
  const { open, setOpen, anchor } = usePopover()
  const online = isOnline(status)
  const demo = status === 'demo'
  if (!online)
    return (
      <span className="popup-anchor">
        <button className="status primary" onClick={() => void connect()} disabled={status === 'connecting'} title={STATUS_TEXT[status]}>
          <span className={`dot dot--${status}`} aria-hidden />
          {status === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      </span>
    )
  const tx = system?.[0x00] ?? 0x7f
  const rx = system?.[0x01] ?? 0
  const midiControl = system?.[0x0e] === 1
  return (
    <span className="popup-anchor" ref={anchor}>
      <button className="status" onClick={() => setOpen(!open)} aria-expanded={open} title="Connection: MIDI ports and the DX's MIDI settings">
        <span className={`dot dot--${status}`} aria-hidden />
        {demo ? 'Demo' : 'Connected'}
      </button>
      {open && (
        <div className="popup" role="dialog" aria-label="Connection">
          <h3 className="popup__title">{demo ? 'Demo: a simulated reface DX. Nothing is sent.' : `Connected${version === 3 ? ', firmware 1.30' : version !== null ? `, version byte ${version}` : ''}`}</h3>
          <Ports />
          <p className="dim">
            The DX receives on {rx < 16 ? `channel ${rx + 1}` : 'all channels (the editor plays on 1)'} and sends on {tx < 16 ? `channel ${tx + 1}` : 'no channel (TR CH off: voices chosen on the DX aren’t followed)'}.
          </p>
          <label className="popup__check">
            <input type="checkbox" checked={midiControl} onChange={(e) => setSystemValue(0x0e, e.target.checked ? 1 : 0)} />
            <span>
              MIDI Control on the DX
              <small className="dim"> {midiControl ? 'FREQ, LEVEL, ALGO and FB moves on the DX show up here.' : 'Off: moves on the DX don’t reach the editor.'}</small>
            </span>
          </label>
          <span className="popup__row">
            <button onClick={() => { setOpen(false); void connect() }}>{demo ? 'Connect the DX' : 'Reconnect'}</button>
            {demo && <button onClick={() => { setOpen(false); disconnect() }}>End demo</button>}
          </span>
        </div>
      )}
    </span>
  )
}

export const Icon = ({ d, spin }: { d: string; spin?: boolean }) => (
  <svg className={spin ? 'icon__svg icon__svg--spin' : 'icon__svg'} viewBox="0 0 16 16" aria-hidden>
    <path d={d} />
  </svg>
)

function MainView() {
  const online = useEditor((s) => isOnline(s.status))
  const voice = useEditor((s) => s.voice)
  if (!online) return <Welcome />
  return (
    <section className="stage" aria-label="Voice">
      <Message />
      {voice ? <Panel /> : <p className="dim">Reading the voice…</p>}
    </section>
  )
}

function Message() {
  const { message, replaced, loadVoice } = useEditor()
  if (!message) return null
  return (
    <p className="hint">
      {message}
      {replaced && (
        <button className="hint__action" onClick={() => loadVoice(replaced)} title="Sends it back into the DX (all of it: notes sounding stop)">
          Send “{voiceName(replaced)}” back
        </button>
      )}
    </p>
  )
}

/** Before a connection: what to set up, the MIDI ports, and the demo. Connect itself stays in the bar. */
function Welcome() {
  const { message, startDemo, status } = useEditor()
  return (
    <section className="welcome" aria-label="Connect">
      {message && <p className="hint">{message}</p>}
      <p>
        Connect the reface DX by USB (or MIDI in and out) and press <b>Connect</b> at the top right. Allow MIDI with SysEx when the
        browser asks. For knob moves on the DX to show up here, turn on MIDI Control (FUNCTION, MIDI page); the editor can do that for you.
      </p>
      <Ports />
      <p className="welcome__demo">
        <span className="dim">No DX at hand?</span>
        <button onClick={() => void startDemo()} disabled={status === 'connecting'}>Try the demo</button>
      </p>
    </section>
  )
}

function SettingsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon" onClick={() => setOpen(true)} title="DX settings: MIDI channels, MIDI Control, tuning, pedal, speakers" aria-label="DX settings">
        <Icon d="M2 4h6M11 4h3M9.5 2.5v3M2 12h3M8 12h6M6.5 10.5v3" />
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon" onClick={() => setOpen(true)} title="Help and About" aria-label="Help and About">?</button>
      {open && <AboutDialog onClose={() => setOpen(false)} />}
    </>
  )
}
