// Converts DX7 voices off the page's thread (a few seconds each): { id, dx } in, { id, voice, reduced, distance } out.
import { importDx7Voice } from './import'

self.onmessage = (e: MessageEvent<{ id: number; dx: Uint8Array }>) => {
  const { id, dx } = e.data
  try {
    const r = importDx7Voice(dx)
    self.postMessage({ id, ...r })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
