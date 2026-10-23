// Live edits as Parameter Changes, after nord-lead-2-editor's CcSender: a parameter changed again within
// INTERVAL_MS of its last send goes out once, with its latest value, when the interval is up (a dragged knob:
// ~60 messages a second per parameter, and the last value always arrives). The DX takes 32 Parameter Changes
// back to back (FINDINGS Q7), so different parameters aren't paced against each other.
// The DX echoes nothing (Q6), but an FM knob turned on the DX can cross our own send of the same parameter;
// the session drops those CCs for ECHO_MS (see `recentlySent`), so a knob turned on both sides doesn't jump.
import { parameterChange, type Address } from '../sysex/messages'

/** Shortest time between two sends of the same parameter: ~60 Hz. */
export const INTERVAL_MS = 16
/** How long after our own send a CC from the DX for the same parameter is taken as crossing it, and ignored. */
export const ECHO_MS = 300

export interface ParamSenderOptions {
  send: (message: Uint8Array) => void
  now?: () => number
  /** device number in the messages (any works, FINDINGS Q1) */
  device?: number
}

const keyOf = (a: Address) => (a[0] << 14) | (a[1] << 7) | a[2]
const addressOf = (key: number): Address => [key >> 14, (key >> 7) & 0x7f, key & 0x7f]

export class ParamSender {
  private sentAt = new Map<number, number>()
  private pending = new Map<number, { data: number[]; timer: ReturnType<typeof setTimeout> }>()
  private readonly now: () => number

  constructor(private readonly options: ParamSenderOptions) {
    this.now = options.now ?? (() => Date.now())
  }

  /** Sends `data` (usually one byte; the name is ten) to `address` now, or as the trailing send once the interval is up. */
  push(address: Address, data: number[]) {
    const key = keyOf(address)
    const waiting = this.pending.get(key)
    if (waiting) {
      waiting.data = data
      return
    }
    const since = this.now() - (this.sentAt.get(key) ?? -Infinity)
    if (since >= INTERVAL_MS) return this.send(key, data)
    const timer = setTimeout(() => {
      const p = this.pending.get(key)
      this.pending.delete(key)
      if (p) this.send(key, p.data)
    }, INTERVAL_MS - since)
    this.pending.set(key, { data, timer })
  }

  /** Whether `address` went out within `windowMs`, or is still waiting to go out. */
  recentlySent(address: Address, windowMs = ECHO_MS): boolean {
    const key = keyOf(address)
    return this.pending.has(key) || this.now() - (this.sentAt.get(key) ?? -Infinity) < windowMs
  }

  /** Sends what is waiting now (before a whole voice or a read, so the DX has every edit first). */
  flush() {
    for (const [key, p] of [...this.pending]) {
      clearTimeout(p.timer)
      this.pending.delete(key)
      this.send(key, p.data)
    }
  }

  /** Drops what hasn't gone out (another voice was selected; a trailing send would change it). */
  clear() {
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
  }

  get size() {
    return this.pending.size
  }

  private send(key: number, data: number[]) {
    this.sentAt.set(key, this.now())
    try {
      this.options.send(parameterChange(this.options.device ?? 0, addressOf(key), data))
    } catch {
      // The port is gone; the store notices and says so.
    }
  }
}
