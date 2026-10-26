// A DX7 voice for Import .syx… (PLAN §8.6): converted the quick way (convert.ts, a few seconds), as loud as the
// wheel's voices, named as on the DX7.
import { cloneVoice, setVoiceName, type Voice } from '../sysex/codec'
import { ensureAudible, levelLoudness } from '../wheel/loudness'
import { convert } from './convert'
import { voiceName, type Voice as DxVoice } from './voice'

export interface ImportedVoice {
  voice: Voice
  /** how six operators became four */
  reduced: string
  /** dB from the original, as convert.ts measures it */
  distance: number
}

export function importDx7Voice(dx: DxVoice): ImportedVoice {
  const c = convert(dx, { fast: true })
  const voice = cloneVoice(c.voice)
  ensureAudible(voice)
  levelLoudness(voice)
  setVoiceName(voice, voiceName(dx))
  return { voice, reduced: c.describe, distance: c.score }
}
