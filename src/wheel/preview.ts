// What the Style sheet plays (PLAN §8.4 step 5): the wheel's voice from the choices, then the sheet's Mix and Wild as
// the style editor had them (style/style.ts): Mix 1 is the new voice, less moves the voice you had towards it; Wild's
// first half is the wheel's own wildness (further into the tonalities' ranges), its second half mutates on top.
import { blend, mutate, wildParts } from '../style/style'
import { rng as makeRng } from '../style/random'
import { cloneVoice, type Voice } from '../sysex/codec'
import type { WheelChoices } from './choices'
import { generateWheel, type WheelVoice } from './generate'

export interface WheelPreview {
  /** what plays */
  voice: Voice
  /** the wheel's voice it comes from, with how each pin came in */
  generated: WheelVoice
}

/** Everything from the cached `original`, so moving a slider back goes back. With keepFx, the effects stay yours. */
export function wheelPreview(original: Voice, c: WheelChoices, seed: number, p: { mix: number; wild: number }, keepFx = false): WheelPreview {
  const { variation, mutate: percent } = wildParts(p.wild)
  const generated = generateWheel(c, { seed, wild: variation })
  let v = cloneVoice(generated.voice)
  if (keepFx) v.common.set(original.common.subarray(0x1d, 0x23), 0x1d)
  if (p.mix < 1) {
    // your voice, that far towards the wheel's; it keeps its name
    v = p.mix <= 0 ? cloneVoice(original) : blend(original, v, p.mix, makeRng(seed + 1))
    v.common.set(original.common.subarray(0, 10), 0)
  }
  if (percent > 0) v = mutate(v, percent, seed + 2, keepFx)
  return { voice: v, generated }
}
