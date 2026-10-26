// The worker that converts DX7 voices, one at a time in the order asked; without workers (tests), on this thread.
import type { Voice as DxVoice } from './voice'
import { importDx7Voice, type ImportedVoice } from './import'

let worker: Worker | null = null
let next = 1
const waiting = new Map<number, { resolve(r: ImportedVoice): void; reject(e: Error): void }>()

function start(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker
  worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; error?: string } & ImportedVoice>) => {
    const w = waiting.get(e.data.id)
    waiting.delete(e.data.id)
    if (!w) return
    if (e.data.error) w.reject(new Error(e.data.error))
    else w.resolve({ voice: e.data.voice, reduced: e.data.reduced, distance: e.data.distance })
  }
  return worker
}

export function convertDx7(dx: DxVoice): Promise<ImportedVoice> {
  const w = start()
  if (!w) return Promise.resolve().then(() => importDx7Voice(dx))
  const id = next++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    w.postMessage({ id, dx })
  })
}
