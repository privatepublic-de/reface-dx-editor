// The ways on from a voice, by size (after the volca fm generator's explore.ts):
// - Another (the dice), small: the same pins and controls, another seed: the details move within the tonalities.
// - Mutate, medium: move what made the voice. The pins wander around the wheel and in or out, their weights shift,
//   now and then a pin comes or goes; the controls get a push, sometimes another envelope.
// - New voice (the wheel's centre), large: a fresh roll of the wheel. New pins anywhere, the controls back to their
//   defaults (the register, the play mode and the effects stay: they're how you play, not the sound).
import type { Rng } from '../style/random'
import { SHAPES } from '../style/choices'
import { NO_PINS, SECTOR, type Pin, type WheelChoices } from './choices'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** At most this many pins on the wheel. */
export const MAX_PINS = 3

/** The choices with pins of the caller's own kind (the sheet's have ids). */
export type ChoicesWith<P extends Pin> = Omit<WheelChoices, 'pins'> & { pins: P[] }

/** `amount` 0…1: how far. The pins keep their order (the first pins stay the first). */
export function mutateChoices<P extends Pin>(c: ChoicesWith<P>, rng: Rng, newPin: (p: Pin) => P, amount = 0.6): ChoicesWith<P> {
  const a = clamp(amount, 0, 1)
  let pins: P[] = c.pins.map((p): P => ({
    ...p,
    // up to about two sectors either way
    angle: (p.angle + (rng.next() * 2 - 1) * SECTOR * (0.6 + 1.6 * a) + 360) % 360,
    radius: clamp(p.radius + (rng.next() * 2 - 1) * 0.45 * a, 0, 1),
    weight: clamp(p.weight * 2 ** ((rng.next() * 2 - 1) * 1.2 * a), 0.05, 1),
  }))
  // a pin goes (the lightest, never the last) or a new one comes, anywhere on the wheel; without pins, always one
  if (!pins.length) {
    pins.push(newPin({ angle: rng.range(0, 360), radius: rng.range(0.3, 0.8), weight: 1 }))
  } else if (pins.length > 1 && rng.chance(0.2 * a)) {
    const lightest = pins.reduce((m, p, i) => (p.weight < pins[m].weight ? i : m), 0)
    pins = pins.filter((_, i) => i !== lightest)
  } else if (pins.length < MAX_PINS && rng.chance(0.25 + 0.3 * a)) {
    pins.push(newPin({ angle: rng.range(0, 360), radius: rng.range(0.2, 1), weight: rng.range(0.15, 0.5) }))
  }
  const push = (x: number, lo: number, hi: number, by: number) => clamp(x + (rng.next() * 2 - 1) * by * a, lo, hi)
  return {
    ...c,
    pins,
    brightness: push(c.brightness, -1, 1, 0.6),
    complexity: push(c.complexity, 0, 1, 0.45),
    motion: push(c.motion, 0, 1, 0.45),
    length: push(c.length, -1, 1, 0.5),
    shape: rng.chance(0.25 * a) ? rng.pick([null, ...SHAPES, 'swell' as const]) : c.shape,
  }
}

/** New voice: one to three pins anywhere (one in three times a single pin, two most often), the first the heaviest;
 *  the controls at their defaults but the register, play mode and effects. */
export function freshChoices<P extends Pin>(c: Omit<WheelChoices, 'pins'>, rng: Rng, newPin: (p: Pin) => P): ChoicesWith<P> {
  const n = rng.chance(0.3) ? 1 : rng.chance(0.7) ? 2 : 3
  const pins = Array.from({ length: n }, (_, i) => newPin({
    angle: rng.range(0, 360),
    radius: rng.range(0.15, 0.95),
    weight: i === 0 ? rng.range(0.6, 1) : rng.range(0.2, 0.6),
  }))
  return { ...NO_PINS, register: c.register, mode: c.mode, colour: c.colour, space: c.space, pins }
}
