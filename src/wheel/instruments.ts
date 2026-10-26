// Instruments to start from (PLAN §8.6): the volca fm generator's, the classic DX7 voices FM was first sold on, on the
// reface's four operators. tools/fromDx7.ts converts each original (instrumentVoices.ts, generated): every parameter
// by what it does, measured, and six operators to four by the reduction that sounds closest. An instrument is the
// base of a voice in place of the heaviest pin; pins colour it.
import type { Voice } from '../sysex/codec'
import { INSTRUMENT_DATA, type InstrumentData } from './instrumentVoices'

export const INSTRUMENT_GROUPS = ['keys', 'plucked', 'mallets', 'bass', 'winds', 'brass', 'strings', 'percussion', 'voices'] as const
export type InstrumentGroup = (typeof INSTRUMENT_GROUPS)[number]
export const INSTRUMENT_GROUP_LABELS: Record<InstrumentGroup, string> = {
  keys: 'Keys', plucked: 'Plucked', mallets: 'Mallets', bass: 'Bass', winds: 'Winds', brass: 'Brass', strings: 'Strings', percussion: 'Percussion', voices: 'Voices',
}

export type InstrumentId = keyof typeof INSTRUMENT_DATA
export const INSTRUMENTS: Record<InstrumentId, InstrumentData> = INSTRUMENT_DATA
export const INSTRUMENT_IDS = Object.keys(INSTRUMENT_DATA) as InstrumentId[]

export const isInstrument = (x: unknown): x is InstrumentId => typeof x === 'string' && Object.hasOwn(INSTRUMENT_DATA, x)
/** Its full name, where the label is shortened. */
export const instrumentName = (id: InstrumentId) => INSTRUMENTS[id].name ?? INSTRUMENTS[id].label

const bytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16))

/** One of its originals as a Voice, a fresh copy. */
export function instrumentVoice(id: InstrumentId, variant: number): Voice {
  const { variants } = INSTRUMENTS[id]
  const x = variants[Math.max(0, Math.min(variants.length - 1, variant))]
  return { common: bytes(x.common), ops: x.ops.map(bytes) as Voice['ops'] }
}
