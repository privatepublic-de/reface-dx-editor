// Requests to the DX, one in flight at a time. The DX answers in ~3–18 ms, or ~210 ms
// right after a Program Change (FINDINGS Q8). A reply that comes after its request gave up must not be taken
// as the next request's answer, so after a timeout the queue waits it out (and drops it) before moving on.
// A voice is 7 messages: the `match` of a voice read collects them and accepts the footer (see session.ts).
import type { MidiTransport } from '../midi/transport'
import { parseSysex, type DxSysex } from '../sysex/messages'

export interface AskOptions {
  /** how long to wait for the reply (default 1500 ms) */
  timeoutMs?: number
  /** after a timeout: how long a late reply is waited for and dropped (default 1500 ms) */
  graceMs?: number
  /** how often to ask (default 2) */
  attempts?: number
}

interface Waiter {
  match: (s: DxSysex) => boolean
  resolve: (s: DxSysex | null) => void
}

export class Requests {
  private queue: Promise<unknown> = Promise.resolve()
  private waiter: Waiter | null = null
  private unsubscribe: () => void
  closed = false

  /** `other` gets every message no request takes (CCs, Program Changes, notes). */
  constructor(
    private readonly transport: MidiTransport,
    private readonly other: (m: Uint8Array) => void = () => {},
  ) {
    this.unsubscribe = transport.subscribe((m) => this.receive(m))
  }

  /** Sends `request` (one message or several) once the requests before it are done; resolves with the
   *  reply `match` accepts, or null. */
  ask(request: Uint8Array | Uint8Array[], match: (s: DxSysex) => boolean, opts: AskOptions = {}): Promise<DxSysex | null> {
    const run = () => this.run(request, match, opts)
    const next = this.queue.then(run, run)
    this.queue = next
    return next
  }

  close() {
    this.closed = true
    this.unsubscribe()
    this.waiter?.resolve(null)
  }

  private async run(request: Uint8Array | Uint8Array[], match: (s: DxSysex) => boolean, { timeoutMs = 1500, graceMs = 1500, attempts = 2 }: AskOptions) {
    for (let i = 0; i < attempts && !this.closed; i++) {
      for (const m of Array.isArray(request) ? request : [request]) this.transport.send(m)
      const reply = await this.wait(match, timeoutMs)
      if (reply) return reply
      if (graceMs > 0) await this.wait(match, graceMs) // a late reply: dropped
    }
    return null
  }

  private wait(match: (s: DxSysex) => boolean, ms: number): Promise<DxSysex | null> {
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(null), ms)
      const done = (s: DxSysex | null) => {
        clearTimeout(timer)
        if (this.waiter === w) this.waiter = null
        resolve(s)
      }
      const w: Waiter = { match, resolve: done }
      this.waiter = w
    })
  }

  private receive(m: Uint8Array) {
    const s = m[0] === 0xf0 ? parseSysex(m) : null
    if (s && this.waiter?.match(s)) this.waiter.resolve(s)
    else this.other(m)
  }
}
