// The voice library: voices kept in this browser, and what each of the DX's 32 locations was last seen to hold.
// Pure functions here; libraryStore.ts keeps the state and saves it.
import { cloneVoice, voiceName, voiceProblems, voicesFromBytes, voiceToBytes, type Voice } from '../sysex/codec'
import { SIZE } from '../sysex/messages'

export interface Entry {
  id: string
  voice: Voice
  /** where it came from: "2-5 on the DX", "bank.syx", "Kept from the editor" */
  source: string
  addedAt: number
  /** out-of-range values found when it came in (shown, never fixed silently) */
  problems?: string[]
}

/** What a location on the DX was last seen to hold, and when. */
export interface Slot {
  voice: Voice
  seenAt: number
}

const VOICE_LENGTH = SIZE.common + 4 * SIZE.operator

/** A voice as 150 bytes: Common, then OP1–OP4. */
export function voiceBytes(v: Voice): Uint8Array {
  const out = new Uint8Array(VOICE_LENGTH)
  out.set(v.common, 0)
  v.ops.forEach((op, i) => out.set(op, SIZE.common + i * SIZE.operator))
  return out
}

export function voiceFromBytes(b: ArrayLike<number>): Voice | null {
  if (b.length !== VOICE_LENGTH) return null
  const all = Uint8Array.from(b)
  return {
    common: all.slice(0, SIZE.common),
    ops: [0, 1, 2, 3].map((i) => all.slice(SIZE.common + i * SIZE.operator, SIZE.common + (i + 1) * SIZE.operator)) as Voice['ops'],
  }
}

/** Same sound and name, byte for byte: the key for "already in the library". */
export const voiceKey = (v: Voice) => Array.from(voiceBytes(v), (b) => b.toString(16).padStart(2, '0')).join('')

export const sameVoice = (a: Voice, b: Voice) => voiceKey(a) === voiceKey(b)

let counter = 0
export const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

export function makeEntry(voice: Voice, source: string, now = Date.now()): Entry {
  const problems = voiceProblems(voice)
  return { id: newId(), voice: cloneVoice(voice), source, addedAt: now, ...(problems.length ? { problems } : {}) }
}

/** Entries from a .syx file (any number of voices back to back), and what the parser dropped. */
export function importSyx(bytes: ArrayLike<number>, fileName: string, now = Date.now()): { entries: Entry[]; problems: string[] } {
  const { voices, problems } = voicesFromBytes(bytes)
  return { entries: voices.map((v) => makeEntry(v, fileName, now)), problems }
}

/** Voices as a .syx file in the DX's own format (7 blocks each, back to back). */
export function exportSyx(voices: Voice[]): Uint8Array {
  const parts = voices.map((v) => voiceToBytes(0, v))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  parts.reduce((o, p) => (out.set(p, o), o + p.length), 0)
  return out
}

/** Adds entries whose voices aren't in the library yet; returns the new library and how many were skipped. */
export function addEntries(library: Entry[], entries: Entry[]): { library: Entry[]; skipped: number } {
  const known = new Set(library.map((e) => voiceKey(e.voice)))
  const fresh: Entry[] = []
  for (const e of entries) {
    const key = voiceKey(e.voice)
    if (known.has(key)) continue
    known.add(key)
    fresh.push(e)
  }
  return { library: [...fresh, ...library], skipped: entries.length - fresh.length }
}

/** A file name from a voice name: "Tine Piano" → "Tine Piano.syx". */
export function fileName(v: Voice | string, fallback = 'voice'): string {
  const name = (typeof v === 'string' ? v : voiceName(v)).replace(/[\\/:*?"<>|]/g, '_').trim()
  return `${name || fallback}.syx`
}

// ---- persistence: voices as hex strings, small and readable ----

interface Stored {
  version: 1
  entries: { id: string; voice: string; source: string; addedAt: number; problems?: string[] }[]
  memory: ({ voice: string; seenAt: number } | null)[]
}

const toHex = (v: Voice) => voiceKey(v)
const fromHex = (h: string) => voiceFromBytes(Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)))

export function serialize(entries: Entry[], memory: (Slot | null)[]): string {
  const stored: Stored = {
    version: 1,
    entries: entries.map((e) => ({ id: e.id, voice: toHex(e.voice), source: e.source, addedAt: e.addedAt, ...(e.problems ? { problems: e.problems } : {}) })),
    memory: memory.map((m) => (m ? { voice: toHex(m.voice), seenAt: m.seenAt } : null)),
  }
  return JSON.stringify(stored)
}

export function deserialize(text: string | null): { entries: Entry[]; memory: (Slot | null)[] } {
  const empty = { entries: [], memory: Array(32).fill(null) }
  if (!text) return empty
  try {
    const s = JSON.parse(text) as Stored
    if (s.version !== 1) return empty
    const entries = s.entries.flatMap((e) => {
      const voice = fromHex(e.voice)
      return voice ? [{ ...e, voice }] : []
    })
    const memory = Array.from({ length: 32 }, (_, i) => {
      const m = s.memory?.[i]
      const voice = m && fromHex(m.voice)
      return voice ? { voice, seenAt: m!.seenAt } : null
    })
    return { entries, memory }
  } catch {
    return empty
  }
}
