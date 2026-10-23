// Default voice data, as read from the DX on 2026-10-23:
// - initVoice(): FUNCTION → Job → VOICE INIT (FINDINGS Q14). OP1 at level 100, OP2–4 at 0: a sine.
//   The reserved bytes weren't shown in that read and are assumed 0.
// - RESET_OPERATOR: what the DX put into the operators a framed voice left out (Q7). The same as a VOICE INIT
//   operator at level 100; On and Pitch EG on didn't show in Q7 and are taken from VOICE INIT.
import type { Voice } from '../sysex/codec'

// prettier-ignore
export const RESET_OPERATOR: readonly number[] = [
  1,                    // 00 on
  127, 127, 127, 100,   // 01–04 EG rates
  127, 127, 127, 0,     // 05–08 EG levels
  0,                    // 09 rate scaling
  0, 0, 0, 3,           // 0A–0D KSC L/R depth, L curve −lin, R curve +lin
  0, 1, 1,              // 0E AMD, 0F LFO PMD on, 10 pitch EG on
  0, 100, 0, 0,         // 11 velocity, 12 output level, 13 feedback, 14 saw
  0, 1, 0, 64,          // 15 ratio, 16 coarse 1, 17 fine 0, 18 detune 0
  0, 0, 0,              // 19–1B reserved
]

// prettier-ignore
export const INIT_COMMON: readonly number[] = [
  ...Array.from('Init Voice', (c) => c.charCodeAt(0)),
  0, 0,                 // 0A–0B reserved
  0x40, 0, 0, 0x42,     // transpose 0, poly, portamento 0, PB +2
  0,                    // algorithm 1
  0, 64, 0, 0,          // LFO sine, speed 64, delay 0, PMD 0
  64, 64, 64, 64,       // pitch EG rates
  0x40, 0x40, 0x40, 0x40, // pitch EG levels 0
  0, 64, 64,            // effect 1 thru
  0, 64, 64,            // effect 2 thru
  0, 0, 0,              // 23–25 reserved
]

export function initVoice(): Voice {
  const op = (level: number) => {
    const o = Uint8Array.from(RESET_OPERATOR)
    o[0x12] = level
    return o
  }
  return { common: Uint8Array.from(INIT_COMMON), ops: [op(100), op(0), op(0), op(0)] }
}
