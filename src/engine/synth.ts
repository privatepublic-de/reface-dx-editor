// A reface DX voice as sound, for probes (PLAN §8): four operators, the 12 algorithms, feedback on every
// operator (saw or square), the envelopes, keyboard scaling, velocity, LFO and pitch EG. Offline only: it renders a
// note in tests and tools so a style's change can be measured without the DX's audio out. The DX's effects aren't
// in it: it renders dry. Built after the volca fm generator's DX7 engine, in its own units: levels in dB, phase in
// cycles, modulation in cycles. Plain TypeScript, no browser globals.
import { ALGORITHMS } from '../params/algorithms'
import { fixedHzOf, ratioOf } from '../params/display'
import type { Voice } from '../sysex/codec'
import {
  ampModDb, ATTACK_FLOOR_DB, attackDbPerS, decayDbPerS, detuneFactor, feedbackGain, kscDb, levelDb, lfoDelayS, lfoHz,
  pitchEgSemitones, pitchEgSemitonesPerS, pitchModSemitones, rateScale, SILENT_DB, TUNING, velocityDb,
} from './tables'

/** Four carriers at full level stay within ±1. */
const OUTPUT_SCALE = 1 / 4

/** A four-stage envelope in dB: from L4 at key-on, R1 → L1, R2 → L2, R3 → L3, held; R4 → L4 after key-off. */
class Env {
  private rates = [0, 0, 0, 0]
  private levels = [0, 0, 0, 0]
  private speed = 1
  private ix = 0
  private down = true
  private target = 0
  private step = 0
  db = SILENT_DB

  constructor(private readonly sampleRate: number) {}

  init(rates: number[], levels: number[], speed: number) {
    this.rates = rates
    this.levels = levels.map(levelDb)
    this.speed = speed
    this.db = this.levels[3]
    this.down = true
    this.advance(0)
  }

  keyUp() {
    if (!this.down) return
    this.down = false
    this.advance(3)
  }

  get finished() {
    return this.ix >= 4
  }

  private advance(ix: number) {
    this.ix = ix
    if (ix >= 4) return
    this.target = this.levels[ix]
    const rising = this.target > this.db
    // an attack starts from a floor, as on the DX7: a rise from silence doesn't crawl up from −120 dB
    if (rising && this.db < ATTACK_FLOOR_DB) this.db = Math.min(this.target, ATTACK_FLOOR_DB)
    const perS = rising ? attackDbPerS(this.rates[ix]) : decayDbPerS(this.rates[ix])
    this.step = (rising ? 1 : -1) * perS * this.speed / this.sampleRate
  }

  next(): number {
    if (this.ix < 3 || (this.ix === 3 && !this.down)) {
      this.db += this.step
      if (this.step >= 0 ? this.db >= this.target : this.db <= this.target) {
        this.db = this.target
        this.advance(this.ix + 1)
      }
    }
    return this.db
  }
}

/** The pitch EG, in semitones. */
class PitchEnv {
  private rates = [0, 0, 0, 0]
  private levels = [0, 0, 0, 0]
  private ix = 0
  private down = true
  private target = 0
  private step = 0
  value = 0

  constructor(private readonly sampleRate: number) {}

  init(rates: number[], levels: number[]) {
    this.rates = rates
    this.levels = levels.map(pitchEgSemitones)
    this.value = this.levels[3]
    this.down = true
    this.advance(0)
  }

  keyUp() {
    if (!this.down) return
    this.down = false
    this.advance(3)
  }

  private advance(ix: number) {
    this.ix = ix
    if (ix >= 4) return
    this.target = this.levels[ix]
    this.step = Math.sign(this.target - this.value) * pitchEgSemitonesPerS(this.rates[ix]) / this.sampleRate
  }

  next(): number {
    if (this.ix < 3 || (this.ix === 3 && !this.down)) {
      this.value += this.step
      if (this.step >= 0 ? this.value >= this.target : this.value <= this.target) {
        this.value = this.target
        this.advance(this.ix + 1)
      }
    }
    return this.value
  }
}

/** The LFO all notes share. Its phase and delay restart with every key down. */
class Lfo {
  private phase = 0
  private inc = 0
  private wave = 0
  private delayS = 0
  private time = 0
  private random = 1
  private held = 0
  /** −1 … 1 */
  value = 0
  /** 0 … 1: how far the delay has faded it in */
  fade = 1

  constructor(private readonly sampleRate: number) {}

  set(v: Voice) {
    this.wave = v.common[0x11]
    this.inc = lfoHz(v.common[0x12]) / this.sampleRate
    this.delayS = lfoDelayS(v.common[0x13])
  }

  keyDown() {
    this.phase = 0
    this.time = 0
  }

  next() {
    this.phase += this.inc
    const wrapped = this.phase >= 1
    if (wrapped) this.phase -= 1
    const p = this.phase
    switch (this.wave) {
      case 0: this.value = Math.sin(2 * Math.PI * p); break
      case 1: this.value = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4; break
      case 2: this.value = 2 * p - 1; break
      case 3: this.value = 1 - 2 * p; break
      case 4: this.value = p < 0.5 ? 1 : -1; break
      default: // sample and hold, a new value each cycle; S&H 8 in eight steps (estimate)
        if (wrapped) {
          this.random = (this.random * 1103515245 + 12345) & 0x7fffffff
          this.held = (this.random / 0x3fffffff) - 1
          if (this.wave === 5) this.held = Math.round(this.held * 3.5) / 3.5
        }
        this.value = this.held
    }
    this.time += 1 / this.sampleRate
    const d = this.delayS
    this.fade = !d || this.time >= 2 * d ? 1 : this.time < d ? 0 : (this.time - d) / d
  }
}

interface OpState {
  env: Env
  on: boolean
  /** dB the operator sits below its envelope: output level, keyboard scaling, velocity */
  offsetDb: number
  hz: number
  phase: number
  feedback: number
  square: boolean
  amdDb: number
  pmd: boolean
  peg: boolean
  /** the last two outputs, in cycles, for feedback */
  out0: number
  out1: number
  /** this sample's output */
  y: number
}

class Note {
  readonly ops: OpState[]
  readonly pitchEnv: PitchEnv
  private carriers: readonly number[] = [0]
  private modulators: number[][] = [[], [], [], []]
  private pmdSemitones = 0
  key = -1
  released = false
  active = false
  age = 0

  constructor(private readonly sampleRate: number) {
    this.ops = Array.from({ length: 4 }, () => ({
      env: new Env(sampleRate), on: true, offsetDb: 0, hz: 0, phase: 0, feedback: 0, square: false, amdDb: 0, pmd: false, peg: false, out0: 0, out1: 0, y: 0,
    }))
    this.pitchEnv = new PitchEnv(sampleRate)
  }

  start(v: Voice, key: number, velocity: number, age: number) {
    // transpose: 0x40 is none
    const note = key + v.common[0x0c] - 0x40
    this.key = key
    this.age = age
    this.released = false
    this.active = true
    const algorithm = ALGORITHMS[v.common[0x10]] ?? ALGORITHMS[0]
    this.carriers = algorithm.carriers
    this.modulators = [0, 1, 2, 3].map((op) => algorithm.modulations.filter(([, to]) => to === op).map(([from]) => from))
    const keyHz = 440 * 2 ** ((note - 69) / 12)
    v.ops.forEach((o, i) => {
      const s = this.ops[i]
      s.on = o[0x00] !== 0
      s.offsetDb = levelDb(o[0x12]) + kscDb(note, o[0x0a], o[0x0b], o[0x0c], o[0x0d]) + velocityDb(velocity, o[0x11])
      s.env.init([o[0x01], o[0x02], o[0x03], o[0x04]], [o[0x05], o[0x06], o[0x07], o[0x08]], rateScale(note, o[0x09]))
      s.hz = (o[0x15] ? fixedHzOf(o[0x16], o[0x17]) : keyHz * ratioOf(o[0x16], o[0x17])) * detuneFactor(o[0x18])
      s.feedback = feedbackGain(o[0x13])
      s.square = o[0x14] !== 0
      s.amdDb = ampModDb(o[0x0e])
      s.pmd = o[0x0f] !== 0
      s.peg = o[0x10] !== 0
      s.phase = 0
      s.out0 = s.out1 = s.y = 0
    })
    this.pitchEnv.init([v.common[0x15], v.common[0x16], v.common[0x17], v.common[0x18]], [v.common[0x19], v.common[0x1a], v.common[0x1b], v.common[0x1c]])
    this.pmdSemitones = pitchModSemitones(v.common[0x14])
  }

  release() {
    this.released = true
    for (const s of this.ops) s.env.keyUp()
    this.pitchEnv.keyUp()
  }

  /** One sample. */
  next(lfo: Lfo): number {
    const peg = this.pitchEnv.next()
    const vibrato = this.pmdSemitones * lfo.fade * lfo.value
    // modulators before what they modulate: in every algorithm a modulator has the higher number
    for (let i = 3; i >= 0; i--) {
      const s = this.ops[i]
      let db = s.env.next() + s.offsetDb
      if (s.amdDb) db -= s.amdDb * lfo.fade * (1 - lfo.value) / 2
      const semis = (s.pmd ? vibrato : 0) + (s.peg ? peg : 0)
      s.phase += (s.hz * (semis ? 2 ** (semis / 12) : 1)) / this.sampleRate
      s.phase -= Math.floor(s.phase)
      if (!s.on || db <= SILENT_DB) {
        s.y = 0
      } else {
        const amp = TUNING.maxCycles * 10 ** (db / 20)
        let mod = 0
        for (const m of this.modulators[i]) mod += this.ops[m].y
        if (s.feedback) {
          const last = (s.out0 + s.out1) / 2
          // saw: the output moves its own phase; square: its square does (estimate: that keeps the wave symmetric
          // over half a cycle, so only odd harmonics, as a square has)
          mod += s.feedback * (s.square ? (last * last) / amp : last)
        }
        s.y = amp * Math.sin(2 * Math.PI * (s.phase + mod))
      }
      s.out0 = s.out1
      s.out1 = s.y
    }
    let out = 0
    for (const c of this.carriers) out += this.ops[c].y / TUNING.maxCycles
    if (this.released && this.carriers.every((c) => !this.ops[c].on || (this.ops[c].env.finished && this.ops[c].env.db + this.ops[c].offsetDb <= SILENT_DB))) {
      this.active = false
    }
    return out * OUTPUT_SCALE
  }
}

/** The reface DX plays eight notes at once. */
const POLYPHONY = 8

export class Synth {
  private voice: Voice
  private readonly notes: Note[]
  private readonly lfo: Lfo
  private clock = 0

  constructor(readonly sampleRate: number, voice: Voice) {
    this.voice = voice
    this.lfo = new Lfo(sampleRate)
    this.lfo.set(voice)
    this.notes = Array.from({ length: POLYPHONY }, () => new Note(sampleRate))
  }

  /** The voice for the next notes; sounding notes keep theirs. */
  setVoice(v: Voice) {
    this.voice = v
    this.lfo.set(v)
  }

  noteOn(key: number, velocity = 100) {
    const n = this.notes.find((x) => x.active && x.key === key)
      ?? this.notes.find((x) => !x.active)
      ?? this.notes.reduce((a, x) => (x.age < a.age ? x : a))
    this.lfo.keyDown()
    n.start(this.voice, key, velocity, this.clock++)
  }

  noteOff(key: number) {
    for (const n of this.notes) if (n.active && !n.released && n.key === key) n.release()
  }

  /** Fills `out` from `start` for `length` samples. */
  render(out: Float32Array, start = 0, length = out.length - start) {
    for (let i = start; i < start + length; i++) {
      this.lfo.next()
      let sum = 0
      for (const n of this.notes) if (n.active) sum += n.next(this.lfo)
      out[i] = sum
    }
  }
}
