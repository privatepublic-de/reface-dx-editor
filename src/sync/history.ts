// Undo/redo for the voice as snapshots, after nord-lead-2-editor's History (which has it from dominion-1-controller
// and hydrasynth-editor). Going back sends only what differs, as Parameter Changes: a whole voice would cut
// the notes that are sounding (FINDINGS Q7). See `voiceChanges`.
import { cloneVoice, type Voice } from '../sysex/codec'

interface Step {
  voice: Voice
  label: string
}

/** Changes to the same param this close together are one step (a knob turned with the wheel or keys). */
export const COALESCE_MS = 1000

export class History {
  private undoStack: Step[] = []
  private redoStack: Step[] = []
  private last: { key: string; at: number } | null = null
  /** An open gesture: everything recorded until it ends is one step, named after its first change. */
  private gesture: { recorded: boolean } | null = null

  constructor(
    private readonly limit = 200,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Forget everything (another voice). */
  reset() {
    this.undoStack = []
    this.redoStack = []
    this.last = null
  }

  /**
   * Call before changing `key`, with the voice as it is before the change. Starts a new step unless
   * it continues the current one: the same key within COALESCE_MS, or inside a gesture.
   */
  record(before: Voice, key: string, label: string) {
    const t = this.now()
    if (this.gesture) {
      if (!this.gesture.recorded) this.push({ voice: cloneVoice(before), label })
      this.gesture.recorded = true
      return
    }
    if (!(this.last && this.last.key === key && t - this.last.at < COALESCE_MS)) this.push({ voice: cloneVoice(before), label })
    this.last = { key, at: t }
  }

  /** A pointer gesture (a knob drag from press to release) is one step. Calls while one is open are ignored. */
  beginGesture() {
    this.gesture ??= { recorded: false }
  }

  endGesture() {
    this.gesture = null
    this.last = null
  }

  /** The voice to go back to, given the current one; null if there is nothing to undo. */
  undo(current: Voice): Voice | null {
    const step = this.undoStack.pop()
    if (!step) return null
    this.redoStack.push({ voice: cloneVoice(current), label: step.label })
    this.last = null
    return step.voice
  }

  redo(current: Voice): Voice | null {
    const step = this.redoStack.pop()
    if (!step) return null
    this.undoStack.push({ voice: cloneVoice(current), label: step.label })
    this.last = null
    return step.voice
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  private push(step: Step) {
    this.undoStack.push(step)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }
}
