// Import from a DX7 bank (PLAN §8.6): a .syx file of DX7 voices opens a window with their names. Clicking one converts
// it (a few seconds, in a worker) and plays it on the DX the way the Style window previews; ticked ones go into the
// library. Closing gives the DX back the voice you had: nothing changes in the editor.
import { create } from 'zustand'
import { convertDx7 } from '../dx7/converter'
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
  /** converted; null until asked, 'working' meanwhile, an Error if it failed */
  converted: ImportedVoice | 'working' | Error | null
}

interface Dx7State {
  /** the file's name; null while closed */
  file: string | null
  voices: Dx7Voice[]
  /** ticked for the library */
  picked: number[]
  /** the one playing on the DX */
  hearing: number | null
  /** the voice before the window opened, sent back on closing; null without a DX to play on */
  original: Voice | null
  open(file: string, voices: SyxVoice[]): void
  /** converts it if need be, then plays it on the DX */
  hear(i: number): Promise<void>
  toggle(i: number): void
  /** the ticked ones into the library (converting what isn't yet), then closes */
  keep(): Promise<void>
  close(): void
}

export const useDx7 = create<Dx7State>((set, get) => {
  const converted = async (i: number): Promise<ImportedVoice | null> => {
    const v = get().voices[i]
    if (v.converted && v.converted !== 'working' && !(v.converted instanceof Error)) return v.converted
    patch(i, 'working')
    try {
      const r = await convertDx7(v.dx)
      patch(i, r)
      return r
    } catch (e) {
      patch(i, e instanceof Error ? e : new Error(String(e)))
      return null
    }
  }
  const patch = (i: number, c: Dx7Voice['converted']) => {
    if (!get().file) return
    set({ voices: get().voices.map((v, k) => (k === i ? { ...v, converted: c } : v)) })
  }
  return {
    file: null,
    voices: [],
    picked: [],
    hearing: null,
    original: null,
    open(file, voices) {
      if (get().file) get().close()
      set({
        file,
        voices: voices.map((v) => ({ name: dxName(v.voice) || '(no name)', source: v.source, dx: v.voice, converted: null })),
        picked: [],
        hearing: null,
        original: useEditor.getState().beginStyle(),
      })
    },
    async hear(i) {
      set({ hearing: i })
      const r = await converted(i)
      // still the one asked for, and the window still open
      if (r && get().hearing === i && get().original) useEditor.getState().previewVoice(r.voice)
    },
    toggle(i) {
      const { picked } = get()
      set({ picked: picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b) })
    },
    async keep() {
      const { file, picked } = get()
      if (!file) return
      const done: { voice: Voice; source: string }[] = []
      for (const i of picked) {
        const r = await converted(i)
        if (!get().file) return
        if (r) done.push({ voice: r.voice, source: `${file}, DX7 ${get().voices[i].source}` })
      }
      if (done.length) useLibrary.getState().keepAll(done)
      get().close()
    },
    close() {
      const { original } = get()
      if (original) useEditor.getState().endStyle(original, false, '')
      set({ file: null, voices: [], picked: [], hearing: null, original: null })
    },
  }
})
