// The DX7 import window (PLAN §8.6, dx7Store.ts): a DX7 file's voices by name, converting in the background from the
// moment it opens (a spinner on each that isn't done). Click one to hear it on the DX (it goes first if it isn't
// converted yet); Use keeps the one heard in the editor; tick the ones to keep; Add puts them in the library. In the Style window's frame, above the
// playable keyboard.
import { useEffect, useState } from 'react'
import { isDone, useDx7, type Dx7Voice } from './dx7Store'

/** How close the conversion came, in a word (convert.ts's distance, dB). */
function closeness(c: Dx7Voice['converted']): { word: string; title: string } | null {
  if (c === 'queued' || c === 'working') return null
  if (c instanceof Error) return { word: 'failed', title: c.message }
  const word = c.distance < 2.5 ? 'close' : c.distance < 5 ? 'fair' : 'loose'
  return { word, title: `${c.distance.toFixed(1)} dB from the original; ${c.reduced}` }
}

export function Dx7Import() {
  const { file, voices, picked, hearing, original, hear, toggle, keep, use, close } = useDx7()
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      useDx7.getState().close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!file) return null
  const heard = hearing === null ? null : voices[hearing]
  const usable = original !== null && heard !== null && isDone(heard.converted)
  const done = voices.filter((v) => isDone(v.converted) || v.converted instanceof Error).length
  return (
    <aside className="style-sheet dx7-import" role="dialog" aria-modal="true" aria-labelledby="dx7-title">
      <div className="style-sheet__head">
        <h2 id="dx7-title">DX7 voices</h2>
        <span className="style-sheet__voice" title="The file">{file}</span>
        <span />
        <button className="style-sheet__close" onClick={close} aria-label="Close without importing" title="Close without importing (Escape)">×</button>
      </div>
      <div className="style-sheet__body dx7-import__body">
        <p className="dim dx7-import__hint">
          {original
            ? 'Every voice is being converted to four operators. Most lose something on the way and none sounds exactly as on a DX7 or in Dexed: click one to hear it on the DX (it goes first if it isn’t ready yet), Use takes the one you hear into the editor, tick the ones worth keeping.'
            : 'Connect the DX to hear them. Ticked voices are converted and kept all the same.'}
        </p>
        <ul className="dx7-import__list">
          {voices.map((v, i) => {
            const c = closeness(v.converted)
            const waiting = v.converted === 'queued' || v.converted === 'working'
            return (
              <li key={i} className={`dx7-import__voice${hearing === i ? ' on' : ''}`}>
                <input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} aria-label={`Keep ${v.name}`} />
                <button onClick={() => void hear(i)} disabled={!original} title={original ? 'Hear it on the DX' : 'Connect the DX to hear it'}>
                  <span className="dx7-import__num">{i + 1}</span>
                  <span className="dx7-import__name">{v.name}</span>
                </button>
                {waiting
                  ? <span className={`dx7-import__state spinner${v.converted === 'working' ? ' on' : ''}`} role="img"
                      aria-label={v.converted === 'working' ? 'Converting' : 'Waiting to be converted'} title={v.converted === 'working' ? 'Converting' : 'Waiting its turn'} />
                  : <span className={`dx7-import__state dim${c?.word === 'failed' ? ' error' : ''}`} title={c?.title}>{c?.word}</span>}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="style-sheet__foot">
        <div className="style-sheet__actions">
          <span className="dim">{done < voices.length ? `${done} of ${voices.length} converted` : 'All converted'}{picked.length ? `, ${picked.length} ticked` : ''}</span>
          <span />
          <button onClick={close} title="Back to your voice (Escape)">Cancel</button>
          <button onClick={use} disabled={!usable}
            title={!original ? 'Connect the DX to hear it' : heard === null ? 'Click a voice first' : !usable ? 'Once it’s converted' : 'This voice in the editor, as a step you can undo; the window closes'}>
            {heard ? `Use ${heard.name}` : 'Use'}
          </button>
          <button className="primary" onClick={() => { setAdding(true); void keep().finally(() => setAdding(false)) }} disabled={!picked.length || adding}
            title="Keeps the ticked voices in the library (once they're converted); your voice comes back">
            {adding ? 'Adding…' : `Add ${picked.length || ''} to library`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </aside>
  )
}
