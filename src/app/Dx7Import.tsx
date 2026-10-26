// The DX7 import window (PLAN §8.6, dx7Store.ts): a DX7 file's voices by name. Click one to hear it converted on the
// DX; tick the ones to keep; Add puts them in the library. In the Style window's frame, above the playable keyboard.
import { useEffect } from 'react'
import { useDx7, type Dx7Voice } from './dx7Store'

/** How close the conversion came, in a word (convert.ts's distance, dB). */
function closeness(c: Dx7Voice['converted']): { word: string; title: string } | null {
  if (!c) return null
  if (c === 'working') return { word: 'converting…', title: 'Converting to four operators' }
  if (c instanceof Error) return { word: 'failed', title: c.message }
  const word = c.distance < 2.5 ? 'close' : c.distance < 5 ? 'fair' : 'loose'
  return { word, title: `${c.distance.toFixed(1)} dB from the original; ${c.reduced}` }
}

export function Dx7Import() {
  const { file, voices, picked, hearing, original, hear, toggle, keep, close } = useDx7()
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
  const busy = picked.some((i) => voices[i].converted === 'working')
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
            ? 'Click a voice to hear it on the DX, converted to four operators (a few seconds the first time). Tick the ones to keep.'
            : 'Connect the DX to hear them. Ticked voices are converted and kept all the same.'}
        </p>
        <ul className="dx7-import__list">
          {voices.map((v, i) => {
            const c = closeness(v.converted)
            return (
              <li key={i} className={`dx7-import__voice${hearing === i ? ' on' : ''}`}>
                <input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} aria-label={`Keep ${v.name}`} />
                <button onClick={() => void hear(i)} disabled={!original} title={original ? 'Hear it on the DX' : 'Connect the DX to hear it'}>
                  <span className="dx7-import__num">{i + 1}</span>
                  <span className="dx7-import__name">{v.name}</span>
                </button>
                <span className={`dx7-import__state dim${c?.word === 'failed' ? ' error' : ''}`} title={c?.title}>{c?.word ?? ''}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="style-sheet__foot">
        <div className="style-sheet__actions">
          <span className="dim">{picked.length ? `${picked.length} ticked` : 'Nothing ticked yet'}</span>
          <span />
          <button onClick={close} title="Back to your voice (Escape)">Cancel</button>
          <button className="primary" onClick={() => void keep()} disabled={!picked.length || busy}
            title="Converts the ticked voices and keeps them in the library; your voice comes back">
            {busy ? 'Converting…' : `Add ${picked.length || ''} to library`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </aside>
  )
}
