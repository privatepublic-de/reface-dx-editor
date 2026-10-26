// The wheel (PLAN §8): twelve tonalities around a circle and the pins on it. Copied from the volca fm generator
// (its choices.ts) with the same names, order and hues, so the two wheels look and read alike.
import type { Colour, Mode, Space } from '../style/choices'
import type { Envelope } from '../style/shapes'

/** The twelve tonalities clockwise from the top of the wheel; neighbours sound close. */
export const TONALITIES = ['noise', 'metallic', 'bell', 'glass', 'tine', 'wooden', 'organ', 'warm', 'reed', 'brass', 'string', 'breath'] as const
export type Tonality = (typeof TONALITIES)[number]
/** Degrees between two tonalities on the wheel. */
export const SECTOR = 360 / TONALITIES.length

export const TONALITY_LABELS: Record<Tonality, string> = {
  noise: 'Noise', metallic: 'Metal', bell: 'Bell', glass: 'Glass', tine: 'Tine', wooden: 'Wood',
  organ: 'Organ', warm: 'Sine', reed: 'Reed', brass: 'Brass', string: 'String', breath: 'Breath',
}
export const TONALITY_HINTS: Record<Tonality, string> = {
  noise: 'Noise as the sound: hiss, wind, cymbals, sweeps',
  metallic: 'Dense and inharmonic: gongs, plates, ring modulation',
  bell: 'Sparse inharmonic partials that ring long: tubular and church bells',
  glass: 'Clean high partials: glass harp, celesta, chimes',
  tine: 'A tine’s attack over a soft body: e-piano, vibraphone',
  wooden: 'Short and knocky: marimba, wood blocks, kalimba',
  organ: 'Drawbars: harmonics side by side, steady',
  warm: 'Round, few harmonics: soft pads, sine bass, flute bodies',
  reed: 'Hollow, odd harmonics: clarinet, square-ish leads',
  brass: 'Bright and buzzy, the brightness swelling with the note',
  string: 'Saw-like, detuned against itself, bowed',
  breath: 'A tone with air in it: flutes, pan pipes, breathy pads',
}

/** Each tonality's colour (hue, degrees): cool and pale at the noisy top, warm at the bottom. */
export const TONALITY_HUES: Record<Tonality, number> = {
  noise: 265, metallic: 228, bell: 200, glass: 182, tine: 158, wooden: 105,
  organ: 72, warm: 34, reed: 18, brass: 2, string: 340, breath: 300,
}

/** Where a tonality sits on the wheel, in degrees clockwise from the top. */
export const angleOf = (t: Tonality) => TONALITIES.indexOf(t) * SECTOR

/** A pin on the wheel. */
export interface Pin {
  /** degrees clockwise from the top */
  angle: number
  /** 0 (the centre: a mild version) … 1 (the rim: extreme) */
  radius: number
  /** its share of the mix, any positive number (the weights are compared, not summed to 1) */
  weight: number
}

/** Where on the keyboard a voice sits: an octave or two down or up; lead plays one note at a time, gliding. */
export const REGISTERS = ['sub', 'bass', 'mid', 'lead', 'high'] as const
export type Register = (typeof REGISTERS)[number]
export const REGISTER_LABELS: Record<Register, string> = { sub: 'Sub', bass: 'Bass', mid: 'Mid', lead: 'Lead', high: 'High' }

/** The pins and the controls next to the wheel (PLAN §8.3). Every control has a neutral value, so pins alone make a
 *  voice in the tonality's own way. */
export interface WheelChoices {
  pins: Pin[]
  /** null: the dominant tonality's own */
  shape: Envelope | null
  /** −1 short … +1 long */
  length: number
  /** −1 mellow … +1 bright */
  brightness: number
  /** −1 tamer … +1 brighter up the keyboard */
  treble: number
  /** 0 pure (two operators) … 1 dense (all four, stacked deeper); ½ the tonalities' own */
  complexity: number
  /** 0 still … 1 alive */
  motion: number
  /** null: as the tonality plays it */
  register: Register | null
  /** 0 none … 1 strong: velocity on brightness and loudness; null: the voice's own */
  velocity: number | null
  /** a short pitch fall into each note */
  pitchAccent: boolean
  /** the DX's part mode; null: the voice's own (lead plays mono legato) */
  mode: Mode | null
  /** effect slot 1; null: clean */
  colour: Colour | null
  /** effect slot 2; null: the dominant tonality's own */
  space: Space | null
}

export const NO_PINS: WheelChoices = {
  pins: [], shape: null, length: 0, brightness: 0, treble: 0, complexity: 0.5, motion: 0, register: null, velocity: null, pitchAccent: false,
  mode: null, colour: null, space: null,
}

/** A tonality in the mix, after the pins are read. */
export interface MixPart {
  tonality: Tonality
  weight: number
  /** 0…1 */
  intensity: number
}

/** Near a sector's centre a pin is that tonality alone; further out it shares with the neighbour. */
const SNAP = 0.15

/** The pins as tonalities: a pin between two sectors belongs to both in proportion; the same tonality from several
 *  pins adds up. Heaviest first (ties: wheel order). */
export function mixOf(pins: readonly Pin[]): MixPart[] {
  const parts = new Map<Tonality, MixPart>()
  const add = (tonality: Tonality, weight: number, intensity: number) => {
    if (weight <= 0) return
    const p = parts.get(tonality)
    if (p) { p.weight += weight; p.intensity = Math.max(p.intensity, intensity) }
    else parts.set(tonality, { tonality, weight, intensity })
  }
  for (const pin of pins) {
    const pos = (((pin.angle % 360) + 360) % 360) / SECTOR
    const i = Math.floor(pos)
    let t = pos - i
    if (t < SNAP) t = 0
    else if (t > 1 - SNAP) t = 1
    else t = (t - SNAP) / (1 - 2 * SNAP)
    const intensity = Math.max(0, Math.min(1, pin.radius))
    add(TONALITIES[i % TONALITIES.length], pin.weight * (1 - t), intensity)
    add(TONALITIES[(i + 1) % TONALITIES.length], pin.weight * t, intensity)
  }
  return [...parts.values()].sort((a, b) => b.weight - a.weight || TONALITIES.indexOf(a.tonality) - TONALITIES.indexOf(b.tonality))
}
