// The library, under the keyboard: the DX's 32 locations as last seen (click one to select it on the DX), and the
// voices kept in this browser (click one to play it on the DX: the whole voice goes over, which cuts sounding
// notes, and it is one undo step). Store always means the DX's memory, Export always means a .syx file.
import { useMemo, useRef, useState } from 'react'
import { exportSyx, fileName, type Entry } from '../library/library'
import { locationName, voiceName } from '../sysex/codec'
import { download } from './download'
import { useLibrary } from './libraryStore'
import { isOnline, useEditor } from './store'

export function LibraryPanel() {
  const online = useEditor((s) => isOnline(s.status) && s.voice !== null)
  const notice = useLibrary((s) => s.notice)
  if (!online) return null
  return (
    <section className="library" aria-label="Library">
      <Memory />
      <Voices />
      {notice && <p className="library__notice" role="status">{notice}</p>}
    </section>
  )
}

/** The DX's 32 locations, 4 banks of 8 as on its BANK and 1–8 buttons. */
function Memory() {
  const memory = useLibrary((s) => s.memory)
  const job = useLibrary((s) => s.job)
  const program = useEditor((s) => s.program)
  const reading = useEditor((s) => s.reading)
  const { selectProgram, readAll, stopReadAll } = useEditor.getState()
  const known = memory.filter(Boolean).length
  return (
    <div className="group-box library__memory">
      <h2>
        On the DX
        <span className="library__actions">
          {job ? (
            <>
              <span className="dim">Reading {job.done}/{job.total}…</span>
              <button onClick={stopReadAll}>Stop</button>
            </>
          ) : (
            <button onClick={() => void readAll()} disabled={reading}
              title="Selects 1-1 … 4-8 on the DX one after the other and reads them (about 7 s). An edit on the DX that isn’t stored is lost (EDIT RECALL on the DX brings it back); the editor’s edits come back by themselves.">
              Read all 32
            </button>
          )}
          <button disabled={known < 32} onClick={() => download('reface DX bank.syx', exportSyx(memory.map((m) => m!.voice)))}
            title={known < 32 ? `${32 - known} location${32 - known === 1 ? '' : 's'} not read yet: Read all first` : 'All 32 as one .syx file (7712 bytes)'}>
            Export bank
          </button>
        </span>
      </h2>
      <div className="memory">
        {[0, 1, 2, 3].map((bank) => (
          <div key={bank} className="memory__bank">
            <span className="memory__label">Bank {bank + 1}</span>
            {Array.from({ length: 8 }, (_, i) => {
              const p = bank * 8 + i
              const m = memory[p]
              return (
                <button key={p} className={`memory__slot${p === program ? ' on' : ''}`} disabled={reading || !!job} onClick={() => void selectProgram(p)}
                  title={m ? `${locationName(p)} “${voiceName(m.voice)}”, read ${new Date(m.seenAt).toLocaleString()}: select it on the DX` : `${locationName(p)}: not read yet. Select it on the DX`}>
                  <span className="memory__num">{locationName(p)}</span>
                  <span className="memory__name">{m ? voiceName(m.voice) || '(no name)' : '·'}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Voices kept in this browser. */
function Voices() {
  const entries = useLibrary((s) => s.entries)
  const memory = useLibrary((s) => s.memory)
  const { keep, keepAll, importFile } = useLibrary.getState()
  const voice = useEditor((s) => s.voice)
  const program = useEditor((s) => s.program)
  const [query, setQuery] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? entries.filter((e) => voiceName(e.voice).toLowerCase().includes(q) || e.source.toLowerCase().includes(q)) : entries
  }, [entries, query])
  return (
    <div className="group-box library__voices">
      <h2>
        In this browser <span className="dim library__count">{entries.length}</span>
        <span className="library__actions">
          <button onClick={() => voice && keep(voice, program !== null ? `Kept from ${locationName(program)}` : 'Kept from the editor')} disabled={!voice}
            title="Keeps the voice as it is in the editor now">
            Keep this voice
          </button>
          <button onClick={() => voice && download(fileName(voice), exportSyx([voice]))} disabled={!voice} title="Saves the voice as it is in the editor now as a .syx file">
            Export this voice
          </button>
          <button disabled={!memory.some(Boolean)} title="Keeps every voice read from the DX’s memory"
            onClick={() => keepAll(memory.flatMap((m, p) => (m ? [{ voice: m.voice, source: `${locationName(p)} on the DX` }] : [])))}>
            Keep DX memory
          </button>
          <button onClick={() => file.current?.click()} title="Opens .syx files: single voices, banks, the DX’s own dumps">Import .syx…</button>
          <input ref={file} type="file" accept=".syx,application/octet-stream" multiple hidden
            onChange={async (e) => {
              for (const f of Array.from(e.target.files ?? [])) importFile(new Uint8Array(await f.arrayBuffer()), f.name)
              e.target.value = ''
            }} />
          <button disabled={!shown.length} onClick={() => download(query ? `${query}.syx` : 'reface DX library.syx', exportSyx(shown.map((e) => e.voice)))}
            title={query ? 'The voices shown, as one .syx file' : 'All voices, as one .syx file'}>
            Export {query ? 'shown' : 'all'}
          </button>
        </span>
      </h2>
      {entries.length > 0 && (
        <input className="library__search" type="search" placeholder="Find by name or source" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find voices" />
      )}
      {entries.length === 0 ? (
        <p className="dim">No voices kept yet. Keep the one you’re editing, keep what Read all found, or import .syx files.</p>
      ) : (
        <ul className="voices">
          {shown.map((e) => <VoiceRow key={e.id} entry={e} />)}
        </ul>
      )}
    </div>
  )
}

function VoiceRow({ entry }: { entry: Entry }) {
  const { remove, rename } = useLibrary.getState()
  const loadVoice = useEditor((s) => s.loadVoice)
  const busy = useLibrary((s) => !!s.job)
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const name = voiceName(entry.voice)
  return (
    <li className="voice-row">
      <button className="voice-row__play" disabled={busy} onClick={() => loadVoice(entry.voice)}
        title="Plays it on the DX: the whole voice goes over (sounding notes stop). One undo step; nothing is stored.">
        {editing ? null : <span className="voice-row__name">{name || '(no name)'}</span>}
      </button>
      {editing && (
        <input className="voice-row__rename" autoFocus defaultValue={name} maxLength={10} aria-label="Name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={(e) => {
            const text = e.currentTarget.value.replace(/[^\x20-\x7e]/g, '')
            if (text !== name) rename(entry.id, text)
            setEditing(false)
          }} />
      )}
      <span className="voice-row__source dim" title={new Date(entry.addedAt).toLocaleString()}>{entry.source}</span>
      {entry.problems && <span className="voice-row__problem" title={`Out of range: ${entry.problems.join(', ')}`}>!</span>}
      <span className="voice-row__tools">
        <button onClick={() => setEditing(true)} title="Rename (10 characters, as the DX stores it)">Rename</button>
        <button onClick={() => download(fileName(entry.voice), exportSyx([entry.voice]))} title="Export as a .syx file">Export</button>
        {confirm ? (
          <button className="danger" onClick={() => remove(entry.id)} onBlur={() => setConfirm(false)} autoFocus>Delete?</button>
        ) : (
          <button onClick={() => setConfirm(true)} title="Removes it from this browser">Delete</button>
        )}
      </span>
    </li>
  )
}
