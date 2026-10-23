// Phase 0 probe: answers the open questions Q1–Q12 of PLAN.md §3 against the real reface DX.
// Only "Voice send" (Q2) could write memory, if a received bulk were stored; everything else touches the
// voice being edited, the DX's SYSTEM settings (Q11 buttons) or nothing.
import { findPorts, requestWebMidi, webMidiTransport, type MidiTransport } from './midi/transport'
import {
  ADDRESS, bulkBlock, dumpRequest, formatAddress, identityRequest, parameterChange, parameterRequest, parseSysex, sameAddress,
  type Address, type DxSysex,
} from './sysex/messages'
import { cloneVoice, diffVoices, formatVoice, locationName, setVoiceName, voiceName, voicesFromBytes, voiceToMessages, VoiceAssembler, type Voice } from './sysex/codec'
import { ccLabel } from './params/cc'
import { describeFrequency, formatDetune } from './params/display'
import { formatSystem } from './params/system'
import { addressLabel, addressValue } from './params/address'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const num = (sel: string) => Number($<HTMLInputElement>(sel).value)
const logEl = $<HTMLDivElement>('#log')
const statusEl = $<HTMLSpanElement>('#status')
const inputSel = $<HTMLSelectElement>('#input')
const outputSel = $<HTMLSelectElement>('#output')
const programSel = $<HTMLSelectElement>('#program')

const dev = () => num('#device') & 0x0f
const channel = () => (num('#channel') - 1) & 0x0f
const program = () => Number(programSel.value)

let access: MIDIAccess | null = null
let transport: MidiTransport | null = null
let unsubscribe: (() => void) | null = null
let busy = false
let stopRequested = false
/** The last voice read (not in quiet reads): what the next read is compared with. */
let lastVoice: Voice | null = null
/** The device number in the last voice's blocks (Q1). */
let lastVoiceDevice = -1
/** The voice as it was before "Send marked voice", and the marked copy. */
let original: Voice | null = null
let marked: Voice | null = null
let markCount = 0
/** While > 0, single blocks and voice summaries aren't logged (the caller reports). */
let quiet = 0
let lastSendAt = -Infinity
const captured: Uint8Array[] = []
const plainLog: string[] = []
const assembler = new VoiceAssembler()

// ---------- log ----------

function log(text: string, cls = '') {
  plainLog.push(text)
  const line = document.createElement('div')
  line.textContent = text
  if (cls) line.className = cls
  logEl.append(line)
  logEl.scrollTop = logEl.scrollHeight
}

const hex = (b: ArrayLike<number>, max = 32) =>
  Array.from(b).slice(0, max).map((x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ` … (${b.length} B)` : '')
const t0 = performance.now()
const stamp = () => `${String(Math.round(performance.now() - t0)).padStart(7)} ms`
/** "+12 ms after send" for anything arriving within 1.5 s of our last message: echoes and replies (Q6). */
const sinceSend = () => {
  const d = performance.now() - lastSendAt
  return d < 1500 ? `  (+${Math.round(d)} ms after send)` : ''
}

// ---------- MIDI in ----------

type Waiter = { match: (s: DxSysex) => boolean; resolve: (s: DxSysex) => void }
const waiters = new Set<Waiter>()
const voiceWaiters = new Set<(v: Voice) => void>()
const taps = new Set<(m: Uint8Array) => void>()

function waitFor(match: (s: DxSysex) => boolean, ms = 1000): Promise<DxSysex | null> {
  return new Promise((resolve) => {
    const w: Waiter = { match, resolve: (s) => { clearTimeout(timer); waiters.delete(w); resolve(s) } }
    const timer = setTimeout(() => { waiters.delete(w); resolve(null) }, ms)
    waiters.add(w)
  })
}

function nextVoice(ms = 1500): Promise<Voice | null> {
  return new Promise((resolve) => {
    const done = (v: Voice | null) => { clearTimeout(timer); voiceWaiters.delete(on); resolve(v) }
    const on = (v: Voice) => done(v)
    const timer = setTimeout(() => done(null), ms)
    voiceWaiters.add(on)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** The parameter at `offset` in the block at `a`. */
const at = (a: Address, offset: number): Address => [a[0], a[1], offset]

function onMessage(m: Uint8Array) {
  for (const tap of taps) tap(m)
  const status = m[0] & 0xf0
  const ch = m[0] & 0x0f
  const raw = $<HTMLInputElement>('#showRaw').checked ? `   [${hex(m)}]` : ''
  if (m[0] === 0xf0) {
    captured.push(Uint8Array.from(m))
    const s = parseSysex(m)
    if (s) onSysex(s, raw)
    else log(`${stamp()} <- SysEx ${m.length} B, not reface DX [${hex(m, 24)}]${sinceSend()}`, 'warn')
    if (s) for (const w of [...waiters]) if (w.match(s)) w.resolve(s)
  } else if (status === 0xb0) {
    log(`${stamp()} <- ch ${ch + 1} CC ${m[1]} = ${m[2]}  ${ccLabel(m[1], m[2])}${sinceSend()}${raw}`, 'dim')
  } else if (status === 0xc0) {
    if (m[1] < 32) programSel.value = String(m[1])
    log(`${stamp()} <- ch ${ch + 1} Program Change ${m[1]}${m[1] < 32 ? ` = ${locationName(m[1])}` : ''}${sinceSend()}${raw}`)
  } else if (status === 0x90 || status === 0x80) {
    const on = status === 0x90 && m[2] > 0
    log(`${stamp()} <- ch ${ch + 1} note ${on ? 'on' : 'off'} ${m[1]}${on ? ` vel ${m[2]}` : ''}${raw}`, 'dim')
  } else {
    log(`${stamp()} <- ${hex(m)}${sinceSend()}`, 'dim')
  }
}

function onSysex(s: DxSysex, raw: string) {
  const after = sinceSend()
  switch (s.kind) {
    case 'identityReply':
      log(`${stamp()} <- Identity Reply ${hex(s.bytes)}${s.matchesManual ? ' (as in the Data List)' : ' — differs from the Data List'}${after}`, s.matchesManual ? 'ok' : 'warn')
      log(`   version byte ${hex([s.version])} (03 = firmware 1.30?)`, 'dim')
      return
    case 'parameterChange': {
      const values = Array.from(s.data, (v) => addressValue(s.address, v)).join(' ')
      log(`${stamp()} <- Parameter Change dev ${s.device} ${formatAddress(s.address)} ${addressLabel(s.address)} = ${values}${after}${raw}`, 'ok')
      return
    }
    case 'dumpRequest':
    case 'parameterRequest':
      log(`${stamp()} <- ${s.kind} dev ${s.device} ${formatAddress(s.address)} (the DX asking?)${after}${raw}`, 'warn')
      return
    case 'bulk': {
      if (!quiet) log(`${stamp()} <- bulk dev ${s.device} ${formatAddress(s.address)} ${s.data.length} B ${s.checksumOk ? '✓' : '✗ checksum'}${after}${raw}`, s.checksumOk ? 'dim' : 'bad')
      if (sameAddress(s.address, ADDRESS.system)) {
        log(`   SYSTEM: ${formatSystem(s.data)}`, 'ok')
        const rx = s.data[1]
        const field = $<HTMLInputElement>('#channel')
        if (rx < 16 && Number(field.value) !== rx + 1) {
          field.value = String(rx + 1)
          localStorage.setItem('refacedx-probe#channel', field.value)
          log(`   MIDI ch set to ${rx + 1} (the DX's RV CH): notes and Program Changes go there`, 'warn')
        }
        return
      }
      const problems = assembler.problems.length
      const v = assembler.add(s)
      for (const p of assembler.problems.slice(problems)) log(`   ✗ ${p}`, 'bad')
      if (v) onVoice(v, s.device)
    }
  }
}

function onVoice(v: Voice, device: number) {
  lastVoiceDevice = device
  if (!quiet) {
    log(`   voice "${voiceName(v)}" (device byte ${device})`, 'ok')
    if (lastVoice) {
      const d = diffVoices(lastVoice, v)
      log(d.length ? `   changed since the last read:\n   ${d.join('\n   ')}` : '   unchanged since the last read', 'dim')
    }
    if ($<HTMLInputElement>('#showVoice').checked) log(formatVoice(v), 'dim')
    lastVoice = v
  }
  for (const w of [...voiceWaiters]) w(v)
}

// ---------- MIDI out ----------

function send(m: Uint8Array, label?: string) {
  if (!transport) throw new Error('not connected')
  transport.send(m)
  lastSendAt = performance.now()
  const raw = $<HTMLInputElement>('#showRaw').checked || m.length <= 12 ? `  [${hex(m)}]` : ''
  if (label !== '') log(`${stamp()} -> ${label ?? `${m.length} B`}${raw}`, 'dim')
}

const programChange = (p: number) => send(Uint8Array.of(0xc0 | channel(), p & 0x7f), `Program Change ${p} = ${locationName(p)}`)
const noteOn = (n = 60, v = 100) => send(Uint8Array.of(0x90 | channel(), n, v), '')
const noteOff = (n = 60) => send(Uint8Array.of(0x80 | channel(), n, 0), '')
const setParam = (a: Address, v: number, label = true) =>
  send(parameterChange(dev(), a, [v]), label ? `Parameter Change ${formatAddress(a)} ${addressLabel(a)} = ${addressValue(a, v)}` : '')

async function readVoice(quietly = false): Promise<Voice | null> {
  if (quietly) quiet++
  try {
    const reply = nextVoice()
    send(dumpRequest(dev(), ADDRESS.bulkHeader), quietly ? '' : 'Dump Request voice')
    const v = await reply
    if (!v && !quietly) log('✗ no voice within 1.5 s', 'bad')
    return v
  } finally {
    if (quietly) quiet--
  }
}

function sendVoice(v: Voice, label = `voice "${voiceName(v)}" (7 blocks)`) {
  voiceToMessages(dev(), v).forEach((m, i) => send(m, i === 0 ? label : ''))
}

/** The voice to work from: the last one read, or a fresh read. */
async function baseVoice(): Promise<Voice> {
  const v = lastVoice ?? (await readVoice())
  if (!v) throw new Error('no voice: check the connection and Read voice')
  return v
}

/** Marks a voice, sends part of it, reads back whether the mark landed, then sends the whole original back. */
async function partialTest(label: string, mark: (v: Voice) => void, messages: (v: Voice) => Uint8Array[]) {
  const base = await baseVoice()
  const changed = cloneVoice(base)
  mark(changed)
  const what = diffVoices(base, changed).join(', ')
  log(`${label}: ${what}`, 'head')
  const out = messages(changed)
  out.forEach((m, i) => send(m, i === 0 ? `${label} (${out.length} message${out.length > 1 ? 's' : ''})` : ''))
  await sleep(300)
  const back = await readVoice(true)
  if (!back) return log('✗ no voice read back', 'bad')
  const left = diffVoices(changed, back)
  if (!left.length) log('✓ landed: the read-back has the mark', 'ok')
  else if (!diffVoices(base, back).length) log('✗ ignored: the read-back is the voice as before', 'bad')
  else log(`? partly: ${left.join(', ')}`, 'warn')
  sendVoice(base, 'restore: original voice')
  await sleep(150)
}

async function holdNote(fn: () => Promise<void>) {
  const base = await baseVoice()
  noteOn(57, 100)
  log('holding A3 …', 'dim')
  try {
    await sleep(600)
    await fn()
    await sleep(600)
  } finally {
    noteOff(57)
    sendVoice(base, 'restore: original voice')
  }
}

// ---------- Q10 frequency steps ----------

type FreqStep = { mode: number; coarse: number; fine: number; detune: number }
const COARSE = [0, 1, 4, 7, 8, 15, 16, 31]
const FINE = [0, 50, 99]
const FREQ_STEPS: FreqStep[] = [
  ...[0, 1].flatMap((mode) => COARSE.flatMap((coarse) => FINE.map((fine) => ({ mode, coarse, fine, detune: 64 })))),
  ...[0, 32, 63, 65, 96, 127].map((detune) => ({ mode: 0, coarse: 1, fine: 0, detune })),
]
let freqIndex = -1

function setFreqStep(i: number) {
  freqIndex = (i + FREQ_STEPS.length) % FREQ_STEPS.length
  const s = FREQ_STEPS[freqIndex]
  setParam(at(ADDRESS.operator(0), 0x15), s.mode, false)
  setParam(at(ADDRESS.operator(0), 0x16), s.coarse, false)
  setParam(at(ADDRESS.operator(0), 0x17), s.fine, false)
  setParam(at(ADDRESS.operator(0), 0x18), s.detune, false)
  $('#freqstep').textContent = `step ${freqIndex + 1}/${FREQ_STEPS.length}: ${freqText(s)}`
  $<HTMLInputElement>('#freqshown').value = ''
  log(`Q10 step ${freqIndex + 1}: OP1 ${freqText(s)}`, 'dim')
}

const freqText = (s: FreqStep) =>
  `${s.mode ? 'fixed' : 'ratio'} coarse ${s.coarse} fine ${s.fine}${s.detune !== 64 ? ` detune ${s.detune - 64}` : ''}`

// ---------- operations ----------

const ops: Record<string, () => Promise<void>> = {
  async note() {
    noteOn(60, 100)
    await sleep(500)
    noteOff(60)
  },

  async identity() {
    send(identityRequest(dev()), 'Identity Request')
    if (!(await waitFor((s) => s.kind === 'identityReply'))) log('✗ no Identity Reply within 1 s', 'bad')
  },

  async readSystem() {
    send(dumpRequest(dev(), ADDRESS.system), 'Dump Request SYSTEM')
    if (!(await waitFor((s) => s.kind === 'bulk' && sameAddress(s.address, ADDRESS.system)))) log('✗ no SYSTEM dump within 1 s', 'bad')
  },

  async readVoice() {
    await readVoice()
  },

  async sweepDevice() {
    log('Q1: voice dump request with device no. 0–15', 'head')
    const answered: string[] = []
    for (let n = 0; n < 16 && !stopRequested; n++) {
      quiet++
      const reply = nextVoice(600)
      send(dumpRequest(n, ADDRESS.bulkHeader), '')
      const v = await reply
      quiet--
      log(v ? `   ${n}: answered "${voiceName(v)}", reply device byte ${lastVoiceDevice}` : `   ${n}: no answer`, v ? 'ok' : 'dim')
      if (v) answered.push(String(n))
      await sleep(100)
    }
    log(`answered: ${answered.join(', ') || 'none'}`, 'head')
  },

  async paramRequest() {
    const bytes = $<HTMLInputElement>('#paddr').value.trim().split(/\s+/).map((x) => parseInt(x, 16))
    if (bytes.length !== 3 || bytes.some((b) => !(b >= 0 && b < 128))) throw new Error('address: three hex bytes, e.g. 30 00 10')
    const a = bytes as unknown as Address
    send(parameterRequest(dev(), a), `Parameter Request ${formatAddress(a)} ${addressLabel(a)}`)
    if (!(await waitFor((s) => s.kind === 'parameterChange' || s.kind === 'bulk'))) log('✗ no reply within 1 s', 'bad')
  },

  async listen() {
    const seconds = num('#listen')
    const seen = new Map<string, number>()
    const count = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1)
    const tap = (m: Uint8Array) => {
      const status = m[0] & 0xf0
      if (m[0] === 0xf0) {
        const s = parseSysex(m)
        if (!s) count('SysEx (other)')
        else if (s.kind === 'identityReply') count('Identity Reply')
        else count(`${s.kind} ${formatAddress(s.address)}${s.kind === 'parameterChange' ? ` ${addressLabel(s.address)}` : ''}`)
      } else if (status === 0xb0) count(`CC ${m[1]} ${ccLabel(m[1], m[2])}`)
      else if (status === 0xc0) count(`Program Change ${m[1]}`)
      else if (status === 0x90 || status === 0x80) count('notes')
      else count(`other ${hex(m.slice(0, 1))}`)
    }
    log(`listening for ${seconds} s: do it on the DX now`, 'head')
    taps.add(tap)
    try {
      for (let i = 0; i < seconds * 10 && !stopRequested; i++) await sleep(100)
    } finally {
      taps.delete(tap)
    }
    log(seen.size ? `heard:\n   ${[...seen].map(([k, n]) => `${n}× ${k}`).join('\n   ')}` : 'heard nothing', seen.size ? 'ok' : 'warn')
  },

  async midiControlOn() { setParam(at(ADDRESS.system, 0x0e), 1) },
  async midiControlOff() { setParam(at(ADDRESS.system, 0x0e), 0) },
  async localOn() { setParam(at(ADDRESS.system, 0x06), 1) },
  async localOff() { setParam(at(ADDRESS.system, 0x06), 0) },

  async sendMarked() {
    log(`Q2: send a marked voice to ${locationName(program())}`, 'head')
    // Select the location first, so "PC away and back" returns to the voice that was marked.
    programChange(program())
    await sleep(num('#pcwait') + 300)
    const base = await readVoice()
    if (!base) return
    original = base
    marked = cloneVoice(base)
    setVoiceName(marked, `PROBE ${String(++markCount).padStart(2, '0')}`)
    marked.common[0x0c] = base.common[0x0c] < 0x58 ? base.common[0x0c] + 1 : base.common[0x0c] - 1
    marked.ops[0][0x18] = base.ops[0][0x18] !== 80 ? 80 : 48
    log(`   mark: ${diffVoices(base, marked).join(', ')}`, 'dim')
    sendVoice(marked)
    await sleep(1000)
    log('   (anything above within 1 s of the send is an echo or a reply, Q6)', 'dim')
    const back = await readVoice(true)
    if (!back) return log('✗ no voice read back', 'bad')
    if (!diffVoices(marked, back).length) log('✓ the DX now has the marked voice. Does its screen show the name PROBE? Next: PC away and back.', 'ok')
    else if (!diffVoices(base, back).length) log('✗ the read-back is the original: the bulk was ignored', 'bad')
    else log(`? read-back differs from the mark: ${diffVoices(marked, back).join(', ')}`, 'warn')
  },

  async pcAwayBack() {
    const p = program()
    const away = p ^ 1
    programChange(away)
    await sleep(num('#pcwait') + 300)
    programChange(p)
    await sleep(num('#pcwait') + 300)
    const back = await readVoice(true)
    if (!back) return log('✗ no voice read back', 'bad')
    log(`   ${locationName(p)} now: "${voiceName(back)}"`)
    if (marked && !diffVoices(marked, back).length) log('! the mark survived the Program Change: the bulk was STORED. Send the original back, then PC away and back again.', 'warn')
    else if (original && !diffVoices(original, back).length) log('✓ the stored voice is back: a bulk goes to the edit buffer only', 'ok')
    else log('? neither the mark nor the original (was "Voice on the DX" set right?)', 'warn')
  },

  async sendOriginal() {
    if (!original) throw new Error('no original yet: Send marked voice first')
    sendVoice(original, `original voice "${voiceName(original)}"`)
  },

  async partialCommon() {
    await partialTest('Common block alone', (v) => (v.common[0x0e] = v.common[0x0e] ^ 0x15), (v) => [bulkBlock(dev(), ADDRESS.common, v.common)])
  },

  async partialCommonFramed() {
    await partialTest('Header + Common + footer', (v) => (v.common[0x0e] = v.common[0x0e] ^ 0x2a), (v) => [
      bulkBlock(dev(), ADDRESS.bulkHeader, []),
      bulkBlock(dev(), ADDRESS.common, v.common),
      bulkBlock(dev(), ADDRESS.bulkFooter, []),
    ])
  },

  async partialOp() {
    await partialTest('OP3 block alone', (v) => (v.ops[2][0x11] = v.ops[2][0x11] ^ 0x15), (v) => [bulkBlock(dev(), ADDRESS.operator(2), v.ops[2])])
  },

  async rateTest() {
    const base = await baseVoice()
    const every = num('#rate')
    const target = cloneVoice(base)
    const sends: [Address, number][] = []
    for (let o = 0; o < 4; o++) {
      for (let off = 1; off <= 8; off++) {
        const v = (base.ops[o][off] + 37) & 0x7f
        target.ops[o][off] = v
        sends.push([[0x31, o, off], v])
      }
    }
    log(`Q7: 32 Parameter Changes (OP1–4 EG rates and levels), one every ${every} ms`, 'head')
    const start = performance.now()
    for (const [a, v] of sends) {
      setParam(a, v, false)
      if (every) await sleep(every)
    }
    log(`   sent in ${Math.round(performance.now() - start)} ms`, 'dim')
    await sleep(300)
    const back = await readVoice(true)
    if (!back) return log('✗ no voice read back', 'bad')
    const landed = sends.filter(([a, v]) => back.ops[a[1]][a[2]] === v).length
    log(`${landed === 32 ? '✓' : '✗'} ${landed} of 32 landed${landed < 32 ? `; missing: ${diffVoices(target, back).join(', ')}` : ''}`, landed === 32 ? 'ok' : 'bad')
    sendVoice(base, 'restore: original voice')
  },

  async heldAlgorithm() {
    await holdNote(async () => {
      for (let a = 0; a < 12; a++) {
        setParam(at(ADDRESS.common, 0x10), a)
        await sleep(400)
      }
    })
  },

  async heldOpOnOff() {
    await holdNote(async () => {
      for (let i = 0; i < 4; i++) {
        setParam(at(ADDRESS.operator(1), 0x00), i % 2 ? 1 : 0)
        await sleep(500)
      }
    })
  },

  async heldEffect() {
    await holdNote(async () => {
      for (let t = 0; t < 8; t++) {
        setParam(at(ADDRESS.common, 0x1d), t)
        await sleep(500)
      }
    })
  },

  async heldVoice() {
    const base = await baseVoice()
    await holdNote(async () => {
      for (let i = 0; i < 3; i++) {
        sendVoice(base, `resend ${i + 1}`)
        await sleep(600)
      }
    })
  },

  async readAll() {
    const wait = num('#pcwait')
    const back = program()
    log(`Q8: reading 1-1 … 4-8, ${wait} ms after each Program Change`, 'head')
    const names: string[] = []
    const start = performance.now()
    for (let p = 0; p < 32 && !stopRequested; p++) {
      programChange(p)
      await sleep(wait)
      const t = performance.now()
      const v = await readVoice(true)
      names.push(v ? voiceName(v) : '—')
      log(v ? `   ${locationName(p)} "${voiceName(v)}" (${Math.round(performance.now() - t)} ms)` : `   ${locationName(p)} ✗ no answer`, v ? '' : 'bad')
    }
    log(`${names.length} voices in ${((performance.now() - start) / 1000).toFixed(1)} s${stopRequested ? ' (stopped)' : ''}; back to ${locationName(back)}`, 'head')
    programChange(back)
  },

  async freqNext() { setFreqStep(freqIndex + 1) },
  async freqPrev() { setFreqStep(freqIndex - 1) },

  async freqLog() {
    if (freqIndex < 0) throw new Error('set a step first')
    const s = FREQ_STEPS[freqIndex]
    const expected = s.detune !== 64 ? `${describeFrequency(s.mode, s.coarse, s.fine)}, ${formatDetune(s.detune)}` : describeFrequency(s.mode, s.coarse, s.fine)
    log(`Q10 ${freqText(s)}: DX shows "${$<HTMLInputElement>('#freqshown').value}"; editor shows ${expected}`, 'ok')
  },

  async sendFileVoice() {
    const v = fileVoices[Number($<HTMLSelectElement>('#filevoices').value)]
    if (!v) throw new Error('open a .syx file first')
    sendVoice(v)
  },

  async sendRaw() {
    const bytes = $<HTMLInputElement>('#raw').value.trim().split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16))
    if (!bytes.length || bytes.some((b) => !(b >= 0 && b < 256))) throw new Error('hex bytes, e.g. f0 43 20 7f 1c 05 0e 0f 00 f7')
    send(Uint8Array.from(bytes), 'raw')
  },
}

// ---------- files (Q12) ----------

let fileVoices: Voice[] = []

$<HTMLInputElement>('#file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const { voices, problems } = voicesFromBytes(new Uint8Array(await file.arrayBuffer()))
  fileVoices = voices
  $<HTMLSelectElement>('#filevoices').replaceChildren(...voices.map((v, i) => new Option(`${i + 1}. ${voiceName(v)}`, String(i))))
  log(`${file.name}: ${file.size} B, ${voices.length} voice${voices.length === 1 ? '' : 's'}`, 'head')
  if (voices.length) log(`   ${voices.map((v, i) => `${i + 1}. ${voiceName(v)}`).join('  ')}`, 'dim')
  for (const p of problems) log(`   ✗ ${p}`, 'bad')
})

// ---------- wiring ----------

function fillPorts() {
  if (!access) return
  for (const [sel, ports] of [[inputSel, access.inputs], [outputSel, access.outputs]] as const) {
    const keep = sel.value
    sel.replaceChildren(...[...ports.values()].map((p) => new Option(p.name ?? p.id, p.id)))
    if (keep) sel.value = keep
  }
}

function attach() {
  if (!access) return
  const input = access.inputs.get(inputSel.value)
  const output = access.outputs.get(outputSel.value)
  unsubscribe?.()
  if (!input || !output) {
    transport = null
    statusEl.textContent = 'pick an input and an output'
    setEnabled(false)
    return
  }
  transport = webMidiTransport({ input, output })
  unsubscribe = transport.subscribe(onMessage)
  localStorage.setItem('refacedx-probe-ports', JSON.stringify({ input: input.name, output: output.name }))
  statusEl.textContent = `${input.name} ⇄ ${output.name}`
  setEnabled(true)
}

function setEnabled(on: boolean) {
  document.querySelectorAll<HTMLButtonElement>('button[data-op]').forEach((b) => (b.disabled = !on || busy))
}

$('#connect').addEventListener('click', async () => {
  try {
    access = await requestWebMidi()
  } catch (err) {
    statusEl.textContent = `no MIDI access: ${(err as Error).message}`
    return
  }
  fillPorts()
  let saved: { input?: string; output?: string } = {}
  try { saved = JSON.parse(localStorage.getItem('refacedx-probe-ports') ?? '{}') } catch { /* first visit */ }
  const pair = findPorts(access, saved)
  if (pair) { inputSel.value = pair.input.id; outputSel.value = pair.output.id }
  access.onstatechange = () => { fillPorts(); attach() }
  attach()
})
inputSel.addEventListener('change', attach)
outputSel.addEventListener('change', attach)

programSel.append(...Array.from({ length: 32 }, (_, p) => new Option(locationName(p), String(p))))
for (const id of ['#device', '#channel', '#program', '#pcwait', '#rate']) {
  const el = $<HTMLInputElement>(id)
  const stored = localStorage.getItem(`refacedx-probe${id}`)
  if (stored) el.value = stored
  el.addEventListener('change', () => localStorage.setItem(`refacedx-probe${id}`, el.value))
}

document.querySelectorAll<HTMLButtonElement>('button[data-op]').forEach((b) =>
  b.addEventListener('click', async () => {
    const run = ops[b.dataset.op!]
    busy = true
    stopRequested = false
    setEnabled(true)
    try {
      await run()
    } catch (err) {
      log(`✗ ${(err as Error).message}`, 'bad')
    } finally {
      busy = false
      setEnabled(!!transport)
    }
  }),
)
$('#stop').addEventListener('click', () => { stopRequested = true })

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
$('#saveSyx').addEventListener('click', () => {
  if (!captured.length) return log('no SysEx received yet', 'warn')
  const all = new Uint8Array(captured.reduce((n, m) => n + m.length, 0))
  captured.reduce((o, m) => (all.set(m, o), o + m.length), 0)
  download(`refacedx-probe-${fileStamp()}.syx`, all, 'application/octet-stream')
})
$('#saveLog').addEventListener('click', () => download(`refacedx-probe-${fileStamp()}.txt`, plainLog.join('\n'), 'text/plain'))
$('#clear').addEventListener('click', () => { logEl.replaceChildren(); plainLog.length = 0 })

log('Start with Connect, then Identity request, Read SYSTEM and Read voice.', 'dim')
