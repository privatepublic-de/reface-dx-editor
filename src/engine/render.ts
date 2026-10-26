// Offline rendering: a voice played as one note, for tests and probes (PLAN §8). No clipping.
import type { Voice } from '../sysex/codec'
import { Synth } from './synth'

export interface RenderOptions {
  note?: number
  velocity?: number
  /** how long the key is held */
  holdSeconds?: number
  /** how long it is rendered after the key is released */
  releaseSeconds?: number
  sampleRate?: number
}

export function renderNote(v: Voice, { note = 60, velocity = 100, holdSeconds = 1, releaseSeconds = 0, sampleRate = 48000 }: RenderOptions = {}): Float32Array {
  const synth = new Synth(sampleRate, v)
  const hold = Math.round(holdSeconds * sampleRate)
  const out = new Float32Array(hold + Math.round(releaseSeconds * sampleRate))
  synth.noteOn(note, velocity)
  synth.render(out, 0, hold)
  synth.noteOff(note)
  synth.render(out, hold)
  return out
}
