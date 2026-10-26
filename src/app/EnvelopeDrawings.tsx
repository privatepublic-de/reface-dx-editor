// The envelopes drawn small, for the Style window's Envelope chips (after the volca fm generator's): loudness against
// time, the dashed line where the key is let go. The seven shapes as icons drawn to be told apart at a glance; Own as
// the envelope you actually hear, the loudest carrier's, run through the probe engine's envelope (measured on the DX:
// the attack's curve, the decay and release times, the EG level curve), so its timing is the DX's.
import { envelopeDb } from '../engine/synth'
import { ALGORITHMS } from '../params/algorithms'
import type { Envelope } from '../style/shapes'
import type { Voice } from '../sysex/codec'

const W = 60
const H = 24
/** Where the icons let go of the key. */
const RELEASE_X = 44

const SHAPE_ICONS: Record<Envelope, string> = {
  // instant, a steep curved fall to nothing
  pluck: 'M3 21 L3 3 C6 15, 10 20, 20 20.6 L57 21',
  // instant, a short drop, a long fade
  struck: 'M3 21 L3 3 C4 7, 6 8.5, 9 8.5 C20 9.5, 34 15, 44 18.5 C48 20, 51 20.8, 57 21',
  // a soft rise, held, let go
  bowed: 'M3 21 C6 9, 9 5, 14 5 L44 5 C47 11, 50 18, 54 21 L57 21',
  // a slow rise in and a slow fall out
  pad: 'M3 21 C15 20.5, 19 5, 28 5 L40 5 C46 5.5, 51 17, 57 21',
  // in at half, growing all the while it is held
  swell: 'M3 21 C4 13, 6 12, 10 12 C22 11.5, 34 6, 44 4 C47 10, 50 18, 54 21 L57 21',
  // on, held, off
  gate: 'M3 21 L5 21 L5 4 L44 4 L44 21 L57 21',
  // a rise, then cut off
  reverse: 'M3 21 C20 20.5, 32 13, 40 3 L40.5 21 L57 21',
}

export function ShapeIcon({ shape }: { shape: Envelope }) {
  return (
    <svg className="eg-icon" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className="eg-icon__release" x1={RELEASE_X} y1={1} x2={RELEASE_X} y2={H - 1} />
      <path d={SHAPE_ICONS[shape]} />
    </svg>
  )
}

/** The loudest sounding carrier's envelope: what you hear of the voice's shape. */
function heardEnvelope(v: Voice): { rates: number[]; levels: number[] } | null {
  const carriers = ALGORITHMS[v.common[0x10]].carriers.filter((op) => v.ops[op][0x00] === 1 && v.ops[op][0x12] > 0)
  if (!carriers.length) return null
  const op = carriers.reduce((a, c) => (v.ops[c][0x12] > v.ops[a][0x12] ? c : a), carriers[0])
  const o = v.ops[op]
  return { rates: [o[0x01], o[0x02], o[0x03], o[0x04]], levels: [o[0x05], o[0x06], o[0x07], o[0x08]] }
}

const STEP_S = 0.005
/** Held at most this long in the drawing (a bell's long ring is cut, not squashed), at least this long. */
const MAX_HOLD_S = 3
const MIN_HOLD_S = 0.3

/** The voice's envelope as a line: held until it settles (or 3 s), then let go until it's silent (or 2 s more). */
export function OwnCurve({ voice }: { voice: Voice }) {
  const eg = heardEnvelope(voice)
  if (!eg) return <svg className="eg-icon" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />
  // how long until it holds still (or keeps fading): the drawing holds the key that long
  const held = envelopeDb(eg.rates, eg.levels, MAX_HOLD_S + 1, MAX_HOLD_S + 1, STEP_S)
  const settle = held.findIndex((db, k) => k * STEP_S > 0.05 && Math.abs(db - (held[k + 20] ?? db)) < 0.2)
  const holdS = Math.max(MIN_HOLD_S, Math.min(MAX_HOLD_S, (settle < 0 ? held.length : settle) * STEP_S + 0.2))
  const curve = envelopeDb(eg.rates, eg.levels, holdS, holdS + 2, STEP_S)
  // after the key, until it's gone
  const gone = curve.findIndex((db, k) => k * STEP_S > holdS && db < -50)
  const end = gone < 0 ? curve.length : Math.min(curve.length, gone + 2)
  const amp = (db: number) => Math.max(0, Math.min(1, 10 ** (db / 20)))
  const x = (k: number) => 3 + (k / Math.max(1, end - 1)) * (W - 6)
  const y = (db: number) => H - 3 - amp(db) * (H - 6)
  const d = curve.slice(0, end).map((db, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(db).toFixed(1)}`).join(' ')
  const release = x(holdS / STEP_S)
  return (
    <svg className="eg-icon" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className="eg-icon__release" x1={release} y1={1} x2={release} y2={H - 1} />
      <path d={`M3 ${H - 3} L${d.slice(1)}`} />
    </svg>
  )
}

/** Own while another shape is chosen: just a sign for "the voice's own". */
export function OwnSign() {
  return (
    <svg className="eg-icon eg-icon--sign" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d="M3 21 L10 5 L28 10 L44 10 L57 21" />
    </svg>
  )
}
