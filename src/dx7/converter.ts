// The workers that convert DX7 voices: a small pool (half the machine's cores, up to four), each one voice at a time.
// Without workers (tests), on this thread.
import type { Voice as DxVoice } from './voice'
import { importDx7Voice, type ImportedVoice } from './import'

interface Slot { worker: Worker; busy: boolean }
let pool: Slot[] | null = null
let next = 1
const waiting = new Map<number, { slot: Slot; resolve(r: ImportedVoice): void; reject(e: Error): void }>()

/** How many voices convert at once. */
export const POOL_SIZE = typeof navigator === 'undefined' ? 1 : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency ?? 2) / 2)))

function slots(): Slot[] | null {
  if (pool || typeof Worker === 'undefined') return pool
  pool = Array.from({ length: POOL_SIZE }, () => {
    const slot: Slot = { worker: new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' }), busy: false }
    slot.worker.onmessage = (e: MessageEvent<{ id: number; error?: string } & ImportedVoice>) => {
      const w = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      slot.busy = false
      if (!w) return
      if (e.data.error) w.reject(new Error(e.data.error))
      else w.resolve({ voice: e.data.voice, reduced: e.data.reduced, distance: e.data.distance })
    }
    return slot
  })
  return pool
}

/** Whether a worker is free for another voice. */
export const canConvert = () => !slots() || slots()!.some((s) => !s.busy)

export function convertDx7(dx: DxVoice): Promise<ImportedVoice> {
  const all = slots()
  if (!all) return Promise.resolve().then(() => importDx7Voice(dx))
  const slot = all.find((s) => !s.busy) ?? all[0]
  slot.busy = true
  const id = next++
  return new Promise((resolve, reject) => {
    waiting.set(id, { slot, resolve, reject })
    slot.worker.postMessage({ id, dx })
  })
}

/** Stops whatever is converting (the import window closed): the workers go, the next conversion starts new ones. */
export function stopConverting() {
  if (!pool) return
  for (const s of pool) s.worker.terminate()
  pool = null
  for (const w of waiting.values()) w.reject(new Error('stopped'))
  waiting.clear()
}
