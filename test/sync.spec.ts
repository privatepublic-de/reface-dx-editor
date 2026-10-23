import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeRefaceDx } from '../src/demo/fakeRefaceDx'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { cloneVoice, setVoiceName, voiceChanges, setVoiceValues } from '../src/sysex/codec'
import { parseSysex } from '../src/sysex/messages'
import { History } from '../src/sync/history'
import { INTERVAL_MS, ParamSender } from '../src/sync/paramSender'
import { Session } from '../src/sync/session'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Runs a promise to the end on fake timers. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false
  let value: T
  p.then((v) => ((done = true), (value = v)))
  for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(20)
  if (!done) throw new Error('did not settle')
  return value!
}

describe('ParamSender', () => {
  it('sends the first change at once and the latest one when the interval is up', () => {
    const sent: Uint8Array[] = []
    let t = 0
    const s = new ParamSender({ send: (m) => sent.push(m), now: () => t })
    s.push([0x31, 0, 0x12], [10])
    s.push([0x31, 0, 0x12], [11])
    s.push([0x31, 0, 0x12], [12])
    s.push([0x31, 1, 0x12], [50])
    expect(sent.map((m) => parseSysex(m))).toMatchObject([{ address: [0x31, 0, 0x12], data: Uint8Array.of(10) }, { address: [0x31, 1, 0x12] }])
    t = INTERVAL_MS
    vi.advanceTimersByTime(INTERVAL_MS)
    expect(sent).toHaveLength(3)
    expect(parseSysex(sent[2])).toMatchObject({ address: [0x31, 0, 0x12], data: Uint8Array.of(12) })
    expect(s.recentlySent([0x31, 0, 0x12])).toBe(true)
    expect(s.recentlySent([0x31, 2, 0x12])).toBe(false)
  })
})

describe('History and voiceChanges', () => {
  it('undoes to the voice before, and the difference goes out as Parameter Changes only', () => {
    const h = new History()
    const a = cloneVoice(DEMO_VOICES[0])
    const b = cloneVoice(a)
    h.record(a, 'op1.level', 'OP1 level')
    b.ops[0][0x12] = 3
    setVoiceName(b, 'Renamed')
    h.record(b, 'name', 'Name')
    const c = cloneVoice(b)
    setVoiceName(c, 'Again')
    expect(h.undoLabel).toBe('Name')
    const back = h.undo(c)!
    expect(voiceChanges(c, back)).toEqual([[[0x30, 0, 0], Array.from('Renamed   ', (x) => x.charCodeAt(0))]])
    const first = h.undo(back)!
    expect(voiceChanges(back, first)).toEqual([[[0x30, 0, 0], Array.from(a.common.subarray(0, 10))], [[0x31, 0, 0x12], [a.ops[0][0x12]]]])
    expect(h.redoLabel).toBe('OP1 level')
  })
})

describe('Session against the fake DX', () => {
  it('connects: SYSTEM, version and the voice being edited', async () => {
    const fake = new FakeRefaceDx({ rxChannel: 15, txChannel: 15 })
    const session = new Session(fake)
    const c = await settle(session.connect())
    expect(c!.version).toBe(3)
    expect(c!.voice).toEqual(fake.edit)
    expect(session.playChannel).toBe(15)
    expect(session.listenChannel).toBe(15)
  })

  it('finds nothing when nothing answers', async () => {
    const silent = { send() {}, subscribe: () => () => {} }
    expect(await settle(new Session(silent).connect())).toBeNull()
  })

  it('sends edits as Parameter Changes that reach the voice', async () => {
    const fake = new FakeRefaceDx()
    const session = new Session(fake)
    await settle(session.connect())
    session.sendValue([0x31, 2, 0x12], [77])
    session.sendValue([0x30, 0, 0x10], [7])
    expect(fake.edit.ops[2][0x12]).toBe(77)
    expect(fake.edit.common[0x10]).toBe(7)
  })

  it('applies an undo diff without a bulk', async () => {
    const fake = new FakeRefaceDx()
    const session = new Session(fake)
    const sent: Uint8Array[] = []
    const send = fake.send.bind(fake)
    fake.send = (m) => (sent.push(m), send(m))
    const { voice } = (await settle(session.connect()))!
    const target = cloneVoice(voice)
    setVoiceValues(target, [0x31, 1, 0x01], [5])
    setVoiceName(target, 'Undone')
    sent.length = 0
    for (const [a, d] of voiceChanges(voice, target)) session.sendValue(a, d)
    expect(fake.edit).toEqual(target)
    expect(sent.every((m) => parseSysex(m)?.kind === 'parameterChange')).toBe(true)
  })

  it('selects a stored voice and reads it once loaded', async () => {
    const fake = new FakeRefaceDx({ loadMs: 200 })
    const session = new Session(fake)
    await settle(session.connect())
    expect(await settle(session.selectProgram(4))).toEqual(DEMO_VOICES[4])
    expect(fake.program).toBe(4)
  })

  it('follows a voice chosen on the DX: Program Change, then the voice', async () => {
    const fake = new FakeRefaceDx()
    const onProgram = vi.fn()
    const onVoice = vi.fn()
    const session = new Session(fake, { onProgram, onVoice })
    await settle(session.connect())
    fake.selectAtPanel(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(onProgram).toHaveBeenCalledWith(2)
    expect(onVoice).toHaveBeenCalledWith(DEMO_VOICES[2])
  })

  it('gathers a FREQ step on the DX into one panel change', async () => {
    const fake = new FakeRefaceDx()
    const onPanel = vi.fn()
    const session = new Session(fake, { onPanel })
    await settle(session.connect())
    fake.turnFm(2, { freqMode: 1, coarse: 9, fine: 40 })
    await vi.advanceTimersByTimeAsync(50)
    expect(onPanel).toHaveBeenCalledTimes(1)
    expect(onPanel).toHaveBeenCalledWith([[[0x31, 2, 0x15], 1], [[0x31, 2, 0x16], 9], [[0x31, 2, 0x17], 40]])
  })

  it('ignores a panel CC for a parameter the editor is sending (a knob turned on both sides)', async () => {
    const fake = new FakeRefaceDx()
    const onPanel = vi.fn()
    const session = new Session(fake, { onPanel })
    await settle(session.connect())
    session.sendValue([0x31, 0, 0x12], [90])
    fake.turnFm(0, { level: 20 })
    await vi.advanceTimersByTimeAsync(50)
    expect(onPanel).not.toHaveBeenCalled()
  })

  it('plays notes on RV CH', async () => {
    const fake = new FakeRefaceDx({ rxChannel: 4 })
    const sent: Uint8Array[] = []
    const send = fake.send.bind(fake)
    fake.send = (m) => (sent.push(m), send(m))
    const session = new Session(fake)
    await settle(session.connect())
    session.noteOn(60, 100)
    expect(sent.at(-1)).toEqual(Uint8Array.of(0x94, 60, 100))
  })
})
