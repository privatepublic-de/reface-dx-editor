// Voices for ?demo and the fake DX, written for this project (no factory or third-party voices).
// They use algorithm 8 (confirmed by the manual) and 1 and 12 (a plain stack and all carriers in the
// unverified table): recheck them when the algorithms are checked on the DX (Q13).
import { initVoice } from '../params/init'
import { setVoiceName, type Voice } from '../sysex/codec'

type Eg = [number, number, number, number]

interface OpSpec {
  /** Ratio as [coarse, fine], or fixed Hz as { fixed: [coarse, fine] }. */
  ratio?: [number, number]
  fixed?: [number, number]
  level: number
  rates: Eg
  levels: Eg
  velocity?: number
  /** Feedback level, and square instead of saw. */
  feedback?: number
  square?: boolean
  /** −64…+63 */
  detune?: number
  amd?: number
  pmd?: boolean
}

interface VoiceSpec {
  name: string
  /** 1–12 */
  algorithm: number
  transpose?: number
  mono?: boolean
  portamento?: number
  lfo?: { wave: number; speed: number; delay: number; pmd: number }
  /** [type, param 1, param 2]; types: 0 thru, 1 dist, 2 t.wah, 3 chorus, 4 flanger, 5 phaser, 6 delay, 7 reverb */
  fx1?: [number, number, number]
  fx2?: [number, number, number]
  ops: [OpSpec, OpSpec, OpSpec, OpSpec]
}

function build(spec: VoiceSpec): Voice {
  const v = initVoice()
  setVoiceName(v, spec.name)
  const c = v.common
  c[0x0c] = 0x40 + (spec.transpose ?? 0)
  c[0x0d] = spec.mono ? 1 : 0
  c[0x0e] = spec.portamento ?? 0
  c[0x10] = spec.algorithm - 1
  if (spec.lfo) c.set([spec.lfo.wave, spec.lfo.speed, spec.lfo.delay, spec.lfo.pmd], 0x11)
  if (spec.fx1) c.set(spec.fx1, 0x1d)
  if (spec.fx2) c.set(spec.fx2, 0x20)
  spec.ops.forEach((o, i) => {
    const op = v.ops[i]
    op.set(o.rates, 0x01)
    op.set(o.levels, 0x05)
    op[0x0e] = o.amd ?? 0
    op[0x0f] = o.pmd ? 1 : 0
    op[0x11] = o.velocity ?? 0
    op[0x12] = o.level
    op[0x13] = o.feedback ?? 0
    op[0x14] = o.square ? 1 : 0
    const [coarse, fine] = o.fixed ?? o.ratio ?? [1, 0]
    op.set([o.fixed ? 1 : 0, coarse, fine, 64 + (o.detune ?? 0)], 0x15)
  })
  return v
}

const SUSTAIN: Eg = [127, 127, 127, 70]
const FULL: Eg = [127, 127, 127, 0]

export const DEMO_VOICES: readonly Voice[] = [
  build({
    name: 'Tine Piano', algorithm: 8, fx1: [3, 50, 40], fx2: [7, 40, 60],
    ops: [
      { ratio: [1, 0], level: 127, rates: [127, 45, 30, 65], levels: [127, 90, 0, 0], velocity: 50 },
      { ratio: [1, 0], level: 78, rates: [127, 60, 40, 65], levels: [127, 55, 0, 0], velocity: 70 },
      { ratio: [1, 0], level: 112, rates: [127, 50, 30, 65], levels: [127, 80, 0, 0], velocity: 40, detune: 4 },
      { ratio: [14, 0], level: 46, rates: [127, 95, 60, 70], levels: [127, 0, 0, 0], velocity: 90 },
    ],
  }),
  build({
    name: 'Wood Bass', algorithm: 1, mono: true, portamento: 20, transpose: -12, fx1: [1, 30, 70],
    ops: [
      { ratio: [0, 0], level: 127, rates: [127, 50, 40, 90], levels: [127, 100, 80, 0], velocity: 30 },
      { ratio: [0, 0], level: 92, rates: [127, 70, 50, 90], levels: [127, 60, 40, 0], velocity: 60, feedback: 40 },
      { ratio: [1, 0], level: 60, rates: [127, 90, 60, 90], levels: [127, 20, 0, 0], velocity: 70 },
      { ratio: [1, 0], level: 0, rates: FULL, levels: [0, 0, 0, 0] },
    ],
  }),
  build({
    name: 'Soft Brass', algorithm: 8, lfo: { wave: 0, speed: 70, delay: 60, pmd: 10 }, fx2: [7, 50, 70],
    ops: [
      { ratio: [1, 0], level: 120, rates: [70, 60, 60, 75], levels: [127, 115, 110, 0], velocity: 30, pmd: true },
      { ratio: [1, 0], level: 88, rates: [55, 50, 50, 70], levels: [127, 100, 95, 0], velocity: 50, feedback: 30, pmd: true },
      { ratio: [1, 0], level: 110, rates: [70, 60, 60, 75], levels: [127, 115, 110, 0], detune: -5, pmd: true },
      { ratio: [1, 0], level: 84, rates: [55, 50, 50, 70], levels: [127, 100, 95, 0], velocity: 50, feedback: 30, pmd: true },
    ],
  }),
  build({
    name: 'Glass Bell', algorithm: 8, fx1: [3, 40, 30], fx2: [6, 50, 70],
    ops: [
      { ratio: [1, 0], level: 120, rates: [127, 40, 25, 40], levels: [127, 70, 0, 0], velocity: 40 },
      { ratio: [3, 50], level: 70, rates: [127, 50, 30, 40], levels: [127, 50, 0, 0], velocity: 60 },
      { ratio: [2, 0], level: 96, rates: [127, 35, 22, 40], levels: [127, 60, 0, 0], detune: 7 },
      { ratio: [7, 0], level: 62, rates: [127, 60, 35, 40], levels: [127, 30, 0, 0], velocity: 60 },
    ],
  }),
  build({
    name: 'Drawbars', algorithm: 12, lfo: { wave: 1, speed: 90, delay: 0, pmd: 6 }, fx1: [1, 20, 60], fx2: [3, 70, 80],
    ops: [
      { ratio: [0, 0], level: 110, rates: SUSTAIN, levels: FULL, pmd: true },
      { ratio: [1, 0], level: 118, rates: SUSTAIN, levels: [127, 127, 127, 0], pmd: true },
      { ratio: [2, 0], level: 100, rates: SUSTAIN, levels: [127, 127, 127, 0], pmd: true },
      { ratio: [3, 0], level: 86, rates: SUSTAIN, levels: [127, 127, 127, 0], pmd: true },
    ],
  }),
  build({
    name: 'Wide Pad', algorithm: 12, lfo: { wave: 0, speed: 40, delay: 30, pmd: 5 }, fx1: [4, 50, 30], fx2: [7, 80, 100],
    ops: [
      { ratio: [1, 0], level: 108, rates: [40, 40, 40, 35], levels: [127, 120, 115, 0], detune: -6, feedback: 30 },
      { ratio: [1, 0], level: 108, rates: [38, 40, 40, 35], levels: [127, 120, 115, 0], detune: 6, feedback: 30 },
      { ratio: [2, 0], level: 88, rates: [30, 40, 40, 35], levels: [127, 110, 100, 0], detune: -3, feedback: 50, square: true },
      { ratio: [0, 0], level: 96, rates: [45, 40, 40, 35], levels: [127, 120, 115, 0], detune: 3 },
    ],
  }),
  build({
    name: 'Sync Lead', algorithm: 1, mono: true, portamento: 35, lfo: { wave: 0, speed: 85, delay: 70, pmd: 12 }, fx1: [1, 60, 80], fx2: [6, 40, 60],
    ops: [
      { ratio: [1, 0], level: 127, rates: [127, 80, 80, 80], levels: [127, 120, 115, 0], feedback: 70, pmd: true },
      { ratio: [2, 0], level: 85, rates: [127, 70, 60, 80], levels: [127, 100, 90, 0], velocity: 50, pmd: true },
      { ratio: [1, 1], level: 70, rates: [127, 50, 50, 80], levels: [127, 90, 80, 0], feedback: 60, square: true },
      { ratio: [1, 0], level: 0, rates: FULL, levels: [0, 0, 0, 0] },
    ],
  }),
  initVoice(),
]
