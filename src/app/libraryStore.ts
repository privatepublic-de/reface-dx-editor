// The library's state: voices kept in this browser, and the DX's 32 locations as last seen. After
// nord-lead-2-editor's libraryStore, in localStorage (a voice is 150 bytes; even thousands fit).
import { create } from 'zustand'
import { addEntries, deserialize, importSyx, makeEntry, serialize, type Entry, type Slot } from '../library/library'
import { cloneVoice, setVoiceName, type Voice } from '../sysex/codec'

export const LIBRARY_KEY = 'reface-dx-editor.library'
/** The demo keeps its own library: its pretend DX must never overwrite the picture of the real one's memory. */
export const DEMO_LIBRARY_KEY = 'reface-dx-editor.library.demo'

export interface LibraryState {
  entries: Entry[]
  /** locations 1-1 … 4-8 (0–31) as last read from the DX: after a Program Change, a Store, or Read all */
  memory: (Slot | null)[]
  /** a running Read all: how far it is */
  job: { done: number; total: number } | null
  /** what the last action did, for a line under the library's buttons */
  notice: string | null

  /** Keeps a voice; false if the library already has it. */
  keep(voice: Voice, source: string): boolean
  /** Keeps several at once (the DX's memory), with one notice. */
  keepAll(voices: { voice: Voice; source: string }[]): void
  /** Adds the voices of a .syx file; says how many and what was dropped. */
  importFile(bytes: ArrayLike<number>, name: string): void
  remove(id: string): void
  rename(id: string, name: string): void
  /** Location `program` holds `voice` (just read from it, or just stored there). */
  remember(program: number, voice: Voice): void
  setJob(job: LibraryState['job']): void
  setNotice(notice: string | null): void
  /** Switches between the real library and the demo's (the editor calls it on connect, demo and disconnect). */
  useStorage(key: string): void
}

function load(key: string) {
  try {
    return deserialize(localStorage.getItem(key))
  } catch {
    return deserialize(null)
  }
}

let storageKey = LIBRARY_KEY
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Keeps the library in localStorage, at most every half second (Read all changes it 32 times). */
function save(state: Pick<LibraryState, 'entries' | 'memory'>, key = storageKey) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(key, serialize(state.entries, state.memory))
    } catch {
      // private mode or full: the library lasts for this visit
    }
  }, 500)
}

const loaded = load(LIBRARY_KEY)

export const useLibrary = create<LibraryState>((set, get) => {
  const update = (patch: Partial<Pick<LibraryState, 'entries' | 'memory'>>) => {
    set(patch)
    save(get())
  }
  return {
    entries: loaded.entries,
    memory: loaded.memory,
    job: null,
    notice: null,

    keep(voice, source) {
      const { library, skipped } = addEntries(get().entries, [makeEntry(voice, source)])
      if (skipped) {
        set({ notice: 'Already in the library.' })
        return false
      }
      update({ entries: library })
      set({ notice: null })
      return true
    },

    keepAll(voices) {
      const { library, skipped } = addEntries(get().entries, voices.map((v) => makeEntry(v.voice, v.source)))
      update({ entries: library })
      const added = voices.length - skipped
      set({ notice: `${added} voice${added === 1 ? '' : 's'} kept${skipped ? `, ${skipped} skipped (already kept, or the same voice twice)` : ''}.` })
    },

    importFile(bytes, name) {
      const { entries, problems } = importSyx(bytes, name)
      const { library, skipped } = addEntries(get().entries, entries)
      update({ entries: library })
      const added = entries.length - skipped
      const parts = [`${name}: ${added} voice${added === 1 ? '' : 's'} added`]
      if (skipped) parts.push(`${skipped} already in the library`)
      if (!entries.length) parts.push('no reface DX voices found')
      if (problems.length) parts.push(`dropped: ${problems.join('; ')}`)
      set({ notice: `${parts.join(', ')}.` })
    },

    remove(id) {
      update({ entries: get().entries.filter((e) => e.id !== id) })
    },

    rename(id, name) {
      update({
        entries: get().entries.map((e) => {
          if (e.id !== id) return e
          const voice = cloneVoice(e.voice)
          setVoiceName(voice, name)
          return { ...e, voice }
        }),
      })
    },

    remember(program, voice) {
      const memory = get().memory.slice()
      memory[program] = { voice: cloneVoice(voice), seenAt: Date.now() }
      update({ memory })
    },

    setJob: (job) => set({ job }),
    setNotice: (notice) => set({ notice }),

    useStorage(key) {
      if (key === storageKey) return
      // What waits to be saved belongs to the library being left.
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
        try {
          localStorage.setItem(storageKey, serialize(get().entries, get().memory))
        } catch {
          // as in save()
        }
      }
      storageKey = key
      set({ ...load(key), job: null, notice: null })
    },
  }
})
