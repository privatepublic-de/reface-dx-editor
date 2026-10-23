// Store… in the top bar: the DX stores only from its own panel (FINDINGS Q2, Q3), so this guides it. Choose where,
// press STORE on the DX, then Check: the editor selects another location and the chosen one again, reads it, and
// compares with the voice it sent (the name may have been changed on the DX's Store Name screen). Nothing in the
// DX's memory changes from here; Export .syx saves the voice as a file instead.
import { useState } from 'react'
import { fileName, exportSyx } from '../library/library'
import { locationName, voiceName } from '../sysex/codec'
import { download } from './download'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'
import { usePopover } from './usePopover'

type Phase = 'choose' | 'waiting' | 'checking' | 'ok' | 'differs' | 'no-reply'

export function StoreButton() {
  const { open, setOpen, anchor } = usePopover()
  const busy = useLibrary((s) => !!s.job)
  const ready = useEditor((s) => !!s.voice && !s.reading)
  return (
    <span className="popup-anchor" ref={anchor}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} disabled={busy || (!ready && !open)}
        title={busy ? 'Wait for Read all to finish' : 'Store the voice in one of the DX’s 32 locations (with STORE on the DX), or export it as a .syx file'}>
        Store…
      </button>
      {open && <StoreForm onClose={() => setOpen(false)} />}
    </span>
  )
}

function StoreForm({ onClose }: { onClose(): void }) {
  const { voice, program, beginStore, checkStore } = useEditor()
  const memory = useLibrary((s) => s.memory)
  const [target, setTarget] = useState<number | null>(program)
  const [phase, setPhase] = useState<Phase>('choose')
  if (!voice) return null
  const where = target === null ? '' : locationName(target)
  const now = target === null ? null : memory[target]
  const check = async () => {
    if (target === null) return
    setPhase('checking')
    setPhase(await checkStore(target))
  }
  return (
    <form className="popup popup--form" role="dialog" aria-label="Store the voice" onSubmit={(e) => e.preventDefault()}>
      <h3 className="popup__title">Store “{voiceName(voice)}”</h3>
      {phase === 'choose' && (
        <>
          <label className="popup__where">
            <span>Location on the DX</span>
            <select value={target ?? ''} onChange={(e) => setTarget(Number(e.target.value))}>
              {target === null && <option value="">choose…</option>}
              {Array.from({ length: 32 }, (_, p) => (
                <option key={p} value={p}>{locationName(p)}{memory[p] ? `  ${voiceName(memory[p]!.voice)}` : ''}</option>
              ))}
            </select>
          </label>
          {target !== null && <p className="dim">Now at {where}: {now ? `“${voiceName(now.voice)}”` : 'not read yet (Read all in the Library shows it)'}</p>}
          <span className="popup__row">
            {/* a click, never Enter in a field: the DX's memory is about to change */}
            <button type="button" className="primary" disabled={target === null} onClick={() => { beginStore(); setPhase('waiting') }}>
              {target === null ? 'Store…' : `Replace ${where}…`}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="link popup__export" onClick={() => { download(fileName(voice), exportSyx([voice])); onClose() }}>Export .syx</button>
          </span>
        </>
      )}
      {(phase === 'waiting' || phase === 'checking') && (
        <>
          <ol className="popup__steps">
            <li>On the DX, press <b>STORE</b>.</li>
            <li>Choose <b>{where}</b> with BANK and 1–8. Give it a name on the Store Name screen if you like.</li>
            <li>Press <b>STORE</b> on the screen, then <b>YES</b>.</li>
          </ol>
          <p className="dim">Then Check: the editor selects {where} on the DX and reads it back. Don’t select another voice on the DX before.</p>
          <span className="popup__row">
            <button type="button" className="primary" disabled={phase === 'checking'} onClick={() => void check()}>{phase === 'checking' ? 'Checking…' : `Check ${where}`}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </span>
        </>
      )}
      {phase === 'ok' && (
        <>
          <p className="ok-text" role="status">✓ Stored: {where} holds “{voiceName(useEditor.getState().voice!)}”.</p>
          <span className="popup__row"><button type="button" onClick={onClose}>Close</button></span>
        </>
      )}
      {(phase === 'differs' || phase === 'no-reply') && (
        <>
          <p className="warn-text" role="alert">
            {phase === 'differs'
              ? `${where} doesn’t hold your voice: the DX didn’t store it there. Your voice is back in the DX, nothing is lost; store again.`
              : `The DX didn’t answer the read-back. Check the connection, then check again.`}
          </p>
          <span className="popup__row">
            <button type="button" className="primary" onClick={() => setPhase('waiting')}>Try again</button>
            <button type="button" onClick={onClose}>Close</button>
          </span>
        </>
      )}
    </form>
  )
}
