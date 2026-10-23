import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeRefaceDx } from '../src/demo/fakeRefaceDx'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { RESET_OPERATOR } from '../src/params/init'
import { cloneVoice, setVoiceName, voiceName, voiceProblems, VoiceAssembler, voiceToMessages, type Voice } from '../src/sysex/codec'
import { ADDRESS, bulkBlock, dumpRequest, identityRequest, parameterChange, parameterRequest, parseSysex, type DxSysex } from '../src/sysex/messages'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function listen(fake: FakeRefaceDx) {
  const got: Uint8Array[] = []
  fake.subscribe((m) => got.push(m))
  return got
}

/** The voice in a list of received messages (the last complete one). */
function voiceIn(got: Uint8Array[]): Voice | null {
  const asm = new VoiceAssembler()
  let v: Voice | null = null
  for (const m of got) {
    const s = parseSysex(m)
    if (s?.kind === 'bulk') v = asm.add(s) ?? v
  }
  return v
}

async function readVoice(fake: FakeRefaceDx, device = 0) {
  const got = listen(fake)
  fake.send(dumpRequest(device, ADDRESS.bulkHeader))
  await vi.advanceTimersByTimeAsync(1000)
  return { voice: voiceIn(got), got }
}

describe('fake reface DX (behaves as Phase 0 found)', () => {
  it('takes any device number and answers with device 0 (Q1)', async () => {
    const fake = new FakeRefaceDx()
    const { voice, got } = await readVoice(fake, 9)
    expect(voice).toEqual(fake.edit)
    expect(got).toHaveLength(7)
    expect(got.every((m) => (parseSysex(m) as { device: number }).device === 0)).toBe(true)
  })

  it('answers the Identity Request with device byte 0n but not 7F, version 03 (Q11)', async () => {
    const fake = new FakeRefaceDx()
    const got = listen(fake)
    fake.send(identityRequest(0x7f))
    await vi.advanceTimersByTimeAsync(100)
    expect(got).toEqual([])
    fake.send(identityRequest(0))
    await vi.advanceTimersByTimeAsync(100)
    expect(parseSysex(got[0])).toMatchObject({ kind: 'identityReply', matchesManual: true, version: 3 })
  })

  it('sends SYSTEM, and SYSTEM Parameter Changes take effect (Q11)', async () => {
    const fake = new FakeRefaceDx({ rxChannel: 15 })
    fake.send(parameterChange(0, [0, 0, 0x0e], [0]))
    const got = listen(fake)
    fake.send(dumpRequest(0, ADDRESS.system))
    await vi.advanceTimersByTimeAsync(100)
    const s = parseSysex(got[0]) as Extract<DxSysex, { kind: 'bulk' }>
    expect(s.data[0x01]).toBe(15)
    expect(s.data[0x0e]).toBe(0)
  })

  it('returns the voice being edited, panel edits included (Q4)', async () => {
    const fake = new FakeRefaceDx()
    fake.editAtPanel([0x31, 0, 0x01], 0)
    const { voice } = await readVoice(fake)
    expect(voice!.ops[0][0x01]).toBe(0)
  })

  it('answers a Parameter Request with a Parameter Change (Q11 notes)', async () => {
    const fake = new FakeRefaceDx()
    const got = listen(fake)
    fake.send(parameterRequest(0, [0x30, 0x00, 0x10]))
    await vi.advanceTimersByTimeAsync(50)
    expect(parseSysex(got[0])).toEqual({ kind: 'parameterChange', device: 0, address: [0x30, 0, 0x10], data: Uint8Array.of(fake.edit.common[0x10]) })
  })

  it('takes a framed voice into the voice being edited, never into memory (Q2)', async () => {
    const fake = new FakeRefaceDx()
    const marked = cloneVoice(fake.edit)
    setVoiceName(marked, 'PROBE 01')
    for (const m of voiceToMessages(5, marked)) fake.send(m)
    expect(voiceName(fake.edit)).toBe('PROBE 01')
    fake.send(Uint8Array.of(0xc0 | 15, 1))
    fake.send(Uint8Array.of(0xc0 | 15, 0))
    expect(fake.edit).toEqual(DEMO_VOICES[0])
  })

  it('ignores a lone block and resets the blocks a framed voice leaves out (Q7)', () => {
    const fake = new FakeRefaceDx()
    const before = cloneVoice(fake.edit)
    const changed = cloneVoice(before)
    changed.common[0x0e] = 42
    fake.send(bulkBlock(0, ADDRESS.common, changed.common))
    expect(fake.edit).toEqual(before)
    fake.send(bulkBlock(0, ADDRESS.bulkHeader, []))
    fake.send(bulkBlock(0, ADDRESS.common, changed.common))
    fake.send(bulkBlock(0, ADDRESS.bulkFooter, []))
    expect(fake.edit.common[0x0e]).toBe(42)
    expect(fake.edit.ops.every((o) => o.every((b, i) => b === RESET_OPERATOR[i]))).toBe(true)
  })

  it('holds a dump request right after a Program Change until the voice has loaded (Q8)', async () => {
    const fake = new FakeRefaceDx({ loadMs: 200, replyMs: 15 })
    const got = listen(fake)
    fake.send(Uint8Array.of(0xc0 | 15, 3))
    fake.send(dumpRequest(0, ADDRESS.bulkHeader))
    await vi.advanceTimersByTimeAsync(100)
    expect(got).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    expect(voiceIn(got)).toEqual(DEMO_VOICES[3])
  })

  it('takes Program Changes on RV CH only, unless it is "all"', () => {
    const fake = new FakeRefaceDx({ rxChannel: 15 })
    fake.send(Uint8Array.of(0xc0, 2))
    expect(fake.program).toBe(0)
    const omni = new FakeRefaceDx({ rxChannel: 16 })
    omni.send(Uint8Array.of(0xc0, 2))
    expect(omni.program).toBe(2)
  })

  it('echoes nothing (Q6)', async () => {
    const fake = new FakeRefaceDx()
    const got = listen(fake)
    fake.send(parameterChange(0, [0x31, 0, 0x12], [3]))
    for (const m of voiceToMessages(0, fake.edit)) fake.send(m)
    fake.send(Uint8Array.of(0xb0 | 15, 85, 20))
    await vi.advanceTimersByTimeAsync(1000)
    expect(got).toEqual([])
  })

  it('sends a Program Change when a voice is chosen at the panel (Q9)', () => {
    const fake = new FakeRefaceDx({ txChannel: 15 })
    const got = listen(fake)
    fake.selectAtPanel(5)
    expect(got).toEqual([Uint8Array.of(0xcf, 5)])
  })

  it('sends FM-section moves as CCs only with MIDI Control on; FREQ as three (Q5)', () => {
    const fake = new FakeRefaceDx({ txChannel: 15 })
    const got = listen(fake)
    fake.turnFm(2, { freqMode: 0, coarse: 0, fine: 96 })
    fake.turnFm(undefined, { algorithm: 3 })
    expect(got).toEqual([Uint8Array.of(0xbf, 111, 0), Uint8Array.of(0xbf, 112, 0), Uint8Array.of(0xbf, 113, 96), Uint8Array.of(0xbf, 80, 35)])
    expect(fake.edit.ops[2].subarray(0x15, 0x18)).toEqual(Uint8Array.of(0, 0, 96))
    fake.send(parameterChange(0, [0, 0, 0x0e], [0]))
    got.length = 0
    fake.turnFm(2, { level: 50 })
    expect(got).toEqual([])
    expect(fake.edit.ops[2][0x12]).toBe(50)
  })

  it('applies received FM CCs with MIDI Control on (Data List, not probed)', () => {
    const fake = new FakeRefaceDx({ rxChannel: 15 })
    fake.send(Uint8Array.of(0xbf, 80, 117))
    fake.send(Uint8Array.of(0xbf, 104, 100))
    expect(fake.edit.common[0x10]).toBe(11)
    expect(fake.edit.ops[1][0x14]).toBe(1)
  })

  it('stores only from the panel, and sends nothing then (Q3)', () => {
    const fake = new FakeRefaceDx()
    const got = listen(fake)
    fake.editAtPanel([0x30, 0, 0x0e], 99)
    fake.storeAtPanel(7)
    expect(fake.stored[7].common[0x0e]).toBe(99)
    expect(got).toEqual([])
  })
})

describe('demo voices', () => {
  it('are all in range and named', () => {
    for (const v of DEMO_VOICES) {
      expect(voiceProblems(v)).toEqual([])
      expect(voiceName(v).length).toBeGreaterThan(0)
    }
  })
})
