// The voice on one screen: the algorithm and the common settings on the left, the four operators side by side
// (each with its frequency, level, feedback, envelope, LFO depths and keyboard scaling), as the DX's FM section
// and Edit mode pages hold them (Reference Manual pp. 3–10).
import { useState } from 'react'
import { addressKey } from '../params/address'
import { isCarrier, modulates } from '../params/algorithms'
import { commonParam, EFFECT_PARAM_LABELS, EFFECT_TYPES, NAME_LENGTH } from '../params/common'
import { describeFrequency } from '../params/display'
import { kscBytes, kscSide, operatorParam, type KscSide } from '../params/operator'
import type { Param } from '../params/param'
import { initVoice } from '../params/init'
import type { Address } from '../sysex/messages'
import { voiceName } from '../sysex/codec'
import { AlgorithmPicker, AlgorithmView } from './AlgorithmView'
import { Knob } from './controls/Knob'
import { Switch } from './controls/Switch'
import { EgGraph } from './EgGraph'
import { KscGraph } from './KscGraph'
import { useEditor } from './store'

const INIT = initVoice()
const common = (offset: number): Address => [0x30, 0x00, offset]
const opAt = (op: number, offset: number): Address => [0x31, op, offset]

/** A knob for the param at `address`, wired to the store: value, baseline tick, panel highlight, undo gestures.
 *  `onSet` replaces the plain edit (the envelope knobs go through the link). */
function P({ param, address, title, display, small, onSet }: { param: Param; address: Address; title?: string; display?: (v: number) => string; small?: boolean; onSet?(v: number): void }) {
  const value = useEditor((s) => valueAt(s.voice, address))
  const baseline = useEditor((s) => valueAt(s.baseline, address))
  const flash = useEditor((s) => s.touched.includes(addressKey(address)))
  const { setValue, beginGesture, endGesture } = useEditor.getState()
  return (
    <Knob param={param} title={title} value={value} baseline={baseline} defaultValue={valueAt(INIT, address)} display={display} flash={flash} small={small}
      onChange={(v) => (onSet ? onSet(v) : setValue(address, v))} onGesture={(on) => (on ? beginGesture() : endGesture())} />
  )
}

function valueAt(v: { common: Uint8Array; ops: Uint8Array[] } | null, a: Address): number {
  if (!v) return 0
  return a[0] === 0x30 ? v.common[a[2]] : v.ops[a[1]][a[2]]
}

/** A switch for the param at `address`. */
function S({ param, address, steps, toggle, hideLabel, title }: { param: Param; address: Address; steps?: readonly string[]; toggle?: boolean; hideLabel?: boolean; title?: string }) {
  const value = useEditor((s) => valueAt(s.voice, address))
  const flash = useEditor((s) => s.touched.includes(addressKey(address)))
  const setValue = useEditor((s) => s.setValue)
  return <Switch label={title ?? param.label} steps={steps ?? param.labels ?? []} value={value} min={param.min} toggle={toggle} hideLabel={hideLabel} flash={flash} onChange={(v) => setValue(address, v)} />
}

export function Panel() {
  return (
    <div className="panel">
      <div className="panel__side">
        <AlgorithmBox />
        <VoiceBox />
        <LfoBox />
        <PitchEgBox />
      </div>
      <div className="panel__ops">
        {[0, 1, 2, 3].map((op) => <OperatorStrip key={op} op={op} />)}
      </div>
      <EffectsBox />
    </div>
  )
}

function AlgorithmBox() {
  const voice = useEditor((s) => s.voice)!
  const focus = useEditor((s) => s.focusOp)
  const flash = useEditor((s) => s.touched.includes(addressKey(common(0x10))))
  const { setValue, focusOperator } = useEditor.getState()
  const [picking, setPicking] = useState(false)
  const algorithm = voice.common[0x10]
  return (
    <section className={`group-box algo-box${flash ? ' control--touched' : ''}`} aria-label="Algorithm">
      <h2>
        Algorithm {algorithm + 1}
        <button type="button" className="group-box__action" onClick={() => setPicking(!picking)} aria-expanded={picking}>{picking ? 'Done' : 'Change'}</button>
      </h2>
      {picking ? (
        <AlgorithmPicker value={algorithm} onChange={(a) => setValue(common(0x10), a)} />
      ) : (
        <div className="algo-stage">
          <AlgorithmView algorithm={algorithm} voice={voice} focus={focus} onOperator={focusOperator} />
        </div>
      )}
    </section>
  )
}

function VoiceBox() {
  const voice = useEditor((s) => s.voice)!
  const setValues = useEditor((s) => s.setValues)
  // While typing, the field keeps its own text: the stored name is padded with spaces, and trimming it back
  // would eat a space just typed before the next letter.
  const [draft, setDraft] = useState<string | null>(null)
  const name = draft ?? voiceName(voice)
  return (
    <section className="group-box" aria-label="Voice">
      <h2>Voice</h2>
      <label className="name-field">
        <span className="control__label">Name</span>
        <input value={name} maxLength={NAME_LENGTH} spellCheck={false} onBlur={() => setDraft(null)}
          onChange={(e) => {
            // ASCII 32–126 only, padded to 10 as the DX stores it.
            const text = e.target.value.replace(/[^\x20-\x7e]/g, '').slice(0, NAME_LENGTH)
            setDraft(text)
            setValues([[common(0x00), Array.from(text.padEnd(NAME_LENGTH), (c) => c.charCodeAt(0))]], 'Name')
          }} />
      </label>
      <div className="group-box__controls">
        <P param={commonParam('transpose')} address={common(0x0c)} />
        <P param={commonParam('pbRange')} address={common(0x0f)} />
        <P param={commonParam('portamento')} address={common(0x0e)} title="Porta" />
      </div>
      <div className="group-box__controls">
        <S param={commonParam('partMode')} address={common(0x0d)} steps={['poly', 'mono full', 'mono legato']} />
      </div>
    </section>
  )
}

function LfoBox() {
  return (
    <section className="group-box" aria-label="LFO">
      <h2>LFO</h2>
      <div className="group-box__controls">
        <S param={commonParam('lfoWave')} address={common(0x11)} steps={['sin', 'tri', 'saw↑', 'saw↓', 'sq', 'S&H8', 'S&H']} hideLabel />
      </div>
      <div className="group-box__controls">
        <P param={commonParam('lfoSpeed')} address={common(0x12)} title="Speed" />
        <P param={commonParam('lfoDelay')} address={common(0x13)} title="Delay" />
        <P param={commonParam('lfoPmd')} address={common(0x14)} title="Pitch mod" />
      </div>
    </section>
  )
}

function PitchEgBox() {
  const voice = useEditor((s) => s.voice)!
  const { setValue, beginGesture, endGesture } = useEditor.getState()
  const rates = [0, 1, 2, 3].map((i) => voice.common[0x15 + i])
  const levels = [0, 1, 2, 3].map((i) => voice.common[0x19 + i])
  return (
    <section className="group-box" aria-label="Pitch EG">
      <h2>Pitch EG</h2>
      <EgGraph label="Pitch EG" rates={rates} levels={levels} levelMin={0x10} levelMax={0x70}
        onChange={(kind, i, v) => setValue(common((kind === 'rate' ? 0x15 : 0x19) + i), v)} onGesture={(on) => (on ? beginGesture() : endGesture())} />
      <div className="group-box__controls group-box__controls--eg">
        {[1, 2, 3, 4].map((n) => <P key={n} param={commonParam(`pegRate${n}`)} address={common(0x14 + n)} title={`R${n}`} small />)}
      </div>
      <div className="group-box__controls group-box__controls--eg">
        {[1, 2, 3, 4].map((n) => <P key={n} param={commonParam(`pegLevel${n}`)} address={common(0x18 + n)} title={`L${n}`} small />)}
      </div>
      <p className="note">±48 = ±4 octaves. Each operator’s Pitch EG switch says whether it follows.</p>
    </section>
  )
}

function EffectsBox() {
  return (
    <section className="group-box fx-box" aria-label="Effects">
      <h2>Effects</h2>
      <div className="fx-box__row">
        <Effect n={1} at={0x1d} />
        <Effect n={2} at={0x20} />
      </div>
    </section>
  )
}

function Effect({ n, at }: { n: 1 | 2; at: number }) {
  const type = useEditor((s) => s.voice?.common[at] ?? 0)
  const [l1, l2] = EFFECT_PARAM_LABELS[type]
  return (
    <div className="group-box__sub">
      <h3>Effect {n}</h3>
      <S param={commonParam(`fx${n}Type`)} address={common(at)} steps={['thru', 'dist', 't.wah', 'cho', 'fla', 'pha', 'dly', 'rev']} hideLabel title={`Effect ${n} type: ${EFFECT_TYPES[type]}`} />
      <div className="group-box__controls">
        <P param={commonParam(`fx${n}Param1`)} address={common(at + 1)} title={l1} />
        <P param={commonParam(`fx${n}Param2`)} address={common(at + 2)} title={l2} />
      </div>
    </div>
  )
}

/** The feedback knob's ends, as on the DX's FB screen: square down (left), saw up (right). In a 6 × 4 box. */
const SQUARE_GLYPH = 'M0 4V0.5H3V4H6V0.5'
const SAW_GLYPH = 'M0 4L3 0.5V4L6 0.5V4'

/** Feedback as the DX's FB slider has it: up from the centre saw, down square, 0 = none. */
const FEEDBACK: Param = {
  offset: 0x13, key: 'feedback', label: 'Feedback', min: -127, max: 127, center: 0,
  // The level alone: the lit glyph at the knob's end says square or saw.
  format: (v) => String(Math.abs(v)),
  // A plain number keeps the wave it had; "-64" or "64 sq" is square, "+64" or "64 saw" saw.
  parse: (t, current) => {
    const m = /^\s*([-−+]?)(\d+)\s*(sq|square|saw)?/i.exec(t)
    if (!m) return null
    const n = Number(m[2])
    const square = m[3] ? m[3].toLowerCase() !== 'saw' : m[1] ? m[1] !== '+' : current < 0
    return square ? -n : n
  },
}

function OperatorStrip({ op }: { op: number }) {
  const voice = useEditor((s) => s.voice)!
  const focused = useEditor((s) => s.focusOp === op)
  const { setValues, setEgValue, beginGesture, endGesture, focusOperator } = useEditor.getState()
  const o = voice.ops[op]
  const algorithm = voice.common[0x10]
  const carrier = isCarrier(algorithm, op)
  const targets = modulates(algorithm, op).map((t) => t + 1)
  const on = o[0x00] === 1
  const fb = o[0x14] ? -o[0x13] : o[0x13]
  const flashFb = useEditor((s) => s.touched.includes(addressKey(opAt(op, 0x13))) || s.touched.includes(addressKey(opAt(op, 0x14))))
  const rates = [0, 1, 2, 3].map((i) => o[0x01 + i])
  const levels = [0, 1, 2, 3].map((i) => o[0x05 + i])
  const ghosts = [0, 1, 2, 3].filter((i) => i !== op).map((i) => ({ rates: [0, 1, 2, 3].map((k) => voice.ops[i][0x01 + k]), levels: [0, 1, 2, 3].map((k) => voice.ops[i][0x05 + k]) }))
  const gesture = (active: boolean) => (active ? beginGesture() : endGesture())
  return (
    <section className={`op${focused ? ' op--focus' : ''}${on ? '' : ' op--off'}`} aria-label={`Operator ${op + 1}`} onPointerDown={() => focusOperator(op)}>
      <header className="op__head">
        <h2>OP{op + 1}</h2>
        <span className="op__role" title={carrier ? 'A carrier: you hear it; Level is its volume' : `A modulator of OP${targets.join(', OP')}: Level is how much it modulates`}>
          {carrier ? 'out' : `→ ${targets.join(', ')}`}
        </span>
        <S param={operatorParam('on')} address={opAt(op, 0x00)} toggle title="On" />
      </header>
      <div className="op__freq-row">
        <S param={operatorParam('freqMode')} address={opAt(op, 0x15)} hideLabel />
        <div className="op__freq" title="As the DX shows it">{describeFrequency(o[0x15], o[0x16], o[0x17])}</div>
      </div>
      <div className="group-box__controls">
        <P param={operatorParam('coarse')} address={opAt(op, 0x16)} />
        <P param={operatorParam('fine')} address={opAt(op, 0x17)} />
        <P param={operatorParam('detune')} address={opAt(op, 0x18)} />
      </div>
      <div className="group-box__controls">
        <P param={operatorParam('level')} address={opAt(op, 0x12)} title={carrier ? 'Volume' : 'Mod depth'} />
        <Knob param={FEEDBACK} value={fb} defaultValue={0} flash={flashFb} onGesture={gesture} ends={[SQUARE_GLYPH, SAW_GLYPH]}
          onChange={(v) => setValues([[opAt(op, 0x13), [Math.abs(v)]], ...(v === 0 ? [] : [[opAt(op, 0x14), [v < 0 ? 1 : 0]] as [Address, number[]]])], `OP${op + 1} Feedback`)} />
        <P param={operatorParam('velocity')} address={opAt(op, 0x11)} title="Velocity" />
      </div>
      <div className="op__section">
        <h3 className="op__eg-head">
          EG
          <LinkToggle carrier={carrier} />
        </h3>
        <EgGraph label={`OP${op + 1} EG`} rates={rates} levels={levels} ghosts={ghosts} onChange={(kind, i, v) => setEgValue(op, kind, i, v)} onGesture={gesture} />
        <div className="group-box__controls group-box__controls--eg">
          {[0, 1, 2, 3].map((i) => <P key={i} param={operatorParam(`egRate${i + 1}`)} address={opAt(op, 1 + i)} title={`R${i + 1}`} small onSet={(v) => setEgValue(op, 'rate', i, v)} />)}
        </div>
        <div className="group-box__controls group-box__controls--eg">
          {[0, 1, 2, 3].map((i) => <P key={i} param={operatorParam(`egLevel${i + 1}`)} address={opAt(op, 5 + i)} title={`L${i + 1}`} small onSet={(v) => setEgValue(op, 'level', i, v)} />)}
        </div>
      </div>
      <div className="op__section">
        <h3>LFO and Pitch EG</h3>
        <div className="group-box__controls">
          <P param={operatorParam('lfoAmd')} address={opAt(op, 0x0e)} title="Amp mod" />
          <S param={operatorParam('lfoPmd')} address={opAt(op, 0x0f)} toggle title="Pitch mod" />
          <S param={operatorParam('peg')} address={opAt(op, 0x10)} toggle title="Pitch EG" />
        </div>
      </div>
      <div className="op__section">
        <h3>Keyboard scaling</h3>
        <KscSection op={op} />
      </div>
    </section>
  )
}

/** Link (PLAN §7.1): an envelope edit carries over to the other operators with the same role. Alt/Option links one edit. */
function LinkToggle({ carrier }: { carrier: boolean }) {
  const linkEgs = useEditor((s) => s.linkEgs)
  const alt = useEditor((s) => s.altHeld)
  const setLinkEgs = useEditor((s) => s.setLinkEgs)
  const on = linkEgs || alt
  return (
    <button type="button" className={`link-toggle${on ? ' on' : ''}`} aria-pressed={linkEgs} onClick={() => setLinkEgs(!linkEgs)}
      title={`Link envelopes: a change here carries over to the other ${carrier ? 'carriers' : 'modulators'} (rates by the same amount, levels by the same ratio). Hold Alt/Option to link one edit.`}>
      <span className="led" aria-hidden />
      Link {carrier ? 'carriers' : 'modulators'}
    </button>
  )
}

/** Depth as the DX's KSC screen shows it: the sign from the curve byte, −127…+127. */
const KSC_DEPTH: Param = { offset: 0, key: 'kscDepth', label: 'Depth', min: -127, max: 127, center: 0 }

/** Keyboard scaling as on the DX's KSC-Level screen: the graph, then L Depth · L Curve · R Curve · R Depth. */
function KscSection({ op }: { op: number }) {
  const o = useEditor((s) => s.voice!.ops[op])
  const b = useEditor((s) => s.baseline?.ops[op] ?? null)
  const flashL = useEditor((s) => s.touched.includes(addressKey(opAt(op, 0x0a))) || s.touched.includes(addressKey(opAt(op, 0x0c))))
  const flashR = useEditor((s) => s.touched.includes(addressKey(opAt(op, 0x0b))) || s.touched.includes(addressKey(opAt(op, 0x0d))))
  const { setValues, beginGesture, endGesture } = useEditor.getState()
  const left = kscSide(o[0x0a], o[0x0c])
  const right = kscSide(o[0x0b], o[0x0d])
  const set = (side: 'L' | 'R', next: KscSide, what: string) => {
    const [depthAt, curveAt] = side === 'L' ? [0x0a, 0x0c] : [0x0b, 0x0d]
    const [depth, curve] = kscBytes(next, o[curveAt])
    setValues([[opAt(op, depthAt), [depth]], [opAt(op, curveAt), [curve]]], `OP${op + 1} KSC ${side} ${what}`)
  }
  const gesture = (active: boolean) => (active ? beginGesture() : endGesture())
  return (
    <>
      <KscGraph label={`OP${op + 1} keyboard scaling`} left={left} right={right} />
      <div className="group-box__controls ksc-controls">
        <Knob param={KSC_DEPTH} title="L depth" value={left.depth} baseline={b && kscSide(b[0x0a], b[0x0c]).depth} defaultValue={0} flash={flashL} small
          onChange={(v) => set('L', { ...left, depth: v }, 'depth')} onGesture={gesture} />
        <Switch label="L curve" steps={['LIN', 'EXP']} value={left.exp ? 1 : 0} flash={flashL} onChange={(v) => set('L', { ...left, exp: v === 1 }, 'curve')} />
        <Switch label="R curve" steps={['LIN', 'EXP']} value={right.exp ? 1 : 0} flash={flashR} onChange={(v) => set('R', { ...right, exp: v === 1 }, 'curve')} />
        <Knob param={KSC_DEPTH} title="R depth" value={right.depth} baseline={b && kscSide(b[0x0b], b[0x0d]).depth} defaultValue={0} flash={flashR} small
          onChange={(v) => set('R', { ...right, depth: v }, 'depth')} onGesture={gesture} />
      </div>
      <div className="group-box__controls">
        <P param={operatorParam('rateScaling')} address={opAt(op, 0x09)} title="Rate scaling" />
      </div>
    </>
  )
}

