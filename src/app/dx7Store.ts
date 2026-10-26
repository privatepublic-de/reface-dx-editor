// Import from a DX7 bank (PLAN §8.6): a .syx file of DX7 voices opens a window with their names, and every voice starts
// converting in the background (dx7/converter.ts, a few seconds each, in file order). Clicking one moves it to the
// front of the queue and plays it on the DX when it's ready, the way the Style window previews; Use keeps the one heard
// in the editor (a step undo takes back); ticked ones go into the library. Closing stops the conversion and gives the
// DX back the voice you had: nothing changes in the editor.
import { create } from 'zustand'
import { canConvert, convertDx7, stopConverting } from '../dx7/converter'
import type { ImportedVoice } from '../dx7/import'
import type { SyxVoice } from '../dx7/sysex'
import { voiceName as dxName } from '../dx7/voice'
import type { Voice } from '../sysex/codec'
import { useLibrary } from './libraryStore'
import { useEditor } from './store'

export interface Dx7Voice {
  name: string
  /** where in the file: "bank 1 / 12" */
  source: string
  dx: Uint8Array
  /** converted; 'queued' until a worker takes it, 'working' meanwhile, an Error if it failed */
  converted: ImportedVoice | 'queued' | 'working' | Error
}

interface Dx7State {
  /** the file's name; null while closed */
  file: string | null
  voices: Dx7Voice[]
  /** ticked for the library */
  picked: number[]
  /** the one asked for: played on the DX once it's converted */
  hearing: number | null
  /** the voice before the window opened, sent back on closing; null without a DX to play on */
  original: Voice | null
  open(file: string, voices: SyxVoice[]): void
  /** plays it on the DX, converting it first (ahead of the others) if need be */
  hear(i: number): void
  toggle(i: number): void
  /** the ticked ones into the library once they're converted, then closes */
  keep(): Promise<void>
  /** the one heard into the editor as a step undo takes back, then closes */
  use(): void
  close(): void
}

export const isDone = (c: Dx7Voice['converted']): c is ImportedVoice => typeof c === 'object' && !(c instanceof Error)

export const useDx7 = create<Dx7State>((set, get) => {
  /** waiting their turn, in order; a voice heard or ticked goes to the front */
  let queue: number[] = []
  /** a new window: results from an earlier one are dropped */
  let session = 0

  const patch = (i: number, c: Dx7Voice['converted']) => set({ voices: get().voices.map((v, k) => (k === i ? { ...v, converted: c } : v)) })
  const play = (i: number) => {
    const c = get().voices[i]?.converted
    if (get().hearing === i && get().original && isDone(c)) useEditor.getState().previewVoice(c.voice)
  }
  /** as many conversions running as there are workers */
  const pump = () => {
    while (queue.length && canConvert()) {
      const i = queue.shift()!
      const mine = session
      patch(i, 'working')
      convertDx7(get().voices[i].dx).then(
        (r) => {
          if (mine !== session) return
          patch(i, r)
          play(i)
          pump()
        },
        (e: unknown) => {
          if (mine !== session) return
          patch(i, e instanceof Error ? e : new Error(String(e)))
          pump()
        },
      )
    }
  }
  const first = (i: number) => {
    if (!queue.includes(i)) return
    queue = [i, ...queue.filter((x) => x !== i)]
    pump()
  }
  /** the window shut, the conversion stopped; the DX keeps what it has */
  const shut = () => {
    session++
    queue = []
    stopConverting()
    set({ file: null, voices: [], picked: [], hearing: null, original: null })
  }
  /** resolves once every one of `ids` is converted (or failed), or the window closed */
  const settled = (ids: number[]) => new Promise<void>((resolve) => {
    const check = () => !get().file || ids.every((i) => { const c = get().voices[i].converted; return c !== 'queued' && c !== 'working' })
    if (check()) return resolve()
    const stop = useDx7.subscribe(() => {
      if (!check()) return
      stop()
      resolve()
    })
  })

  return {
    file: null,
    voices: [],
    picked: [],
    hearing: null,
    original: null,
    open(file, voices) {
      if (get().file) get().close()
      session++
      set({
        file,
        voices: voices.map((v) => ({ name: dxName(v.voice) || '(no name)', source: v.source, dx: v.voice, converted: 'queued' })),
        picked: [],
        hearing: null,
        original: useEditor.getState().beginStyle(),
      })
      queue = voices.map((_, i) => i)
      pump()
    },
    hear(i) {
      set({ hearing: i })
      first(i)
      play(i)
    },
    toggle(i) {
      const { picked } = get()
      set({ picked: picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b) })
    },
    async keep() {
      const { file, picked } = get()
      if (!file) return
      // the ticked ones still waiting go first
      for (const i of [...picked].reverse()) first(i)
      await settled(picked)
      if (get().file !== file) return
      const done = picked.flatMap((i) => {
        const { converted, source } = get().voices[i]
        return isDone(converted) ? [{ voice: converted.voice, source: `${file}, DX7 ${source}` }] : []
      })
      if (done.length) useLibrary.getState().keepAll(done)
      get().close()
    },
    use() {
      const { file, voices, hearing, original } = get()
      const c = hearing === null ? undefined : voices[hearing]?.converted
      if (!original || !c || !isDone(c)) return
      // what's heard is this voice already, unless another was clicked and isn't converted yet
      useEditor.getState().previewVoice(c.voice)
      useEditor.getState().endStyle(original, true, `From ${file}`)
      shut()
    },
    close() {
      const { original } = get()
      if (original) useEditor.getState().endStyle(original, false, '')
      shut()
    },
  }
})
