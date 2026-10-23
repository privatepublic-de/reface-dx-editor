import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../src/app/store'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { voiceName } from '../src/sysex/codec'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  useEditor.getState().disconnect()
  vi.useRealTimers()
})

const s = () => useEditor.getState()

async function demo() {
  const started = s().startDemo()
  await vi.advanceTimersByTimeAsync(500)
  await started
  expect(s().status).toBe('demo')
}

describe('editor store against the demo DX', () => {
  it('reads the voice on connect; the location stays unknown until the DX says', async () => {
    await demo()
    expect(s().voice).toEqual(DEMO_VOICES[0])
    expect(s().program).toBeNull()
    expect(s().version).toBe(3)
  })

  it('sends an edit, and undo/redo send the difference back', async () => {
    await demo()
    s().setValue([0x31, 1, 0x12], 99)
    await vi.advanceTimersByTimeAsync(50)
    expect(s().fake!.edit.ops[1][0x12]).toBe(99)
    expect(s().undoLabel).toBe('OP2 Output level')
    s().undo()
    await vi.advanceTimersByTimeAsync(50)
    expect(s().fake!.edit.ops[1][0x12]).toBe(DEMO_VOICES[0].ops[1][0x12])
    s().redo()
    await vi.advanceTimersByTimeAsync(50)
    expect(s().fake!.edit.ops[1][0x12]).toBe(99)
  })

  it('takes a FREQ step on the DX as one undo step, and lights it', async () => {
    await demo()
    s().fake!.turnFm(2, { freqMode: 0, coarse: 3, fine: 50 })
    await vi.advanceTimersByTimeAsync(20)
    expect(Array.from(s().voice!.ops[2].subarray(0x15, 0x18))).toEqual([0, 3, 50])
    expect(s().undoLabel).toBe('OP3 frequency on the DX')
    expect(s().touched).toEqual(['31.2.21', '31.2.22', '31.2.23'])
    s().undo()
    expect(s().undoLabel).toBeNull()
  })

  it('follows a voice chosen on the DX and keeps the edits it dropped', async () => {
    await demo()
    s().setValue([0x30, 0, 0x0e], 33)
    s().fake!.selectAtPanel(4)
    await vi.advanceTimersByTimeAsync(500)
    expect(s().program).toBe(4)
    expect(voiceName(s().voice!)).toBe(voiceName(DEMO_VOICES[4]))
    expect(s().replaced?.common[0x0e]).toBe(33)
    s().loadVoice(s().replaced!)
    expect(s().fake!.edit.common[0x0e]).toBe(33)
    expect(s().undoLabel).toBeNull()
  })

  it('selects a stored voice from the editor', async () => {
    await demo()
    const picked = s().selectProgram(6)
    await vi.advanceTimersByTimeAsync(500)
    await picked
    expect(s().program).toBe(6)
    expect(s().voice).toEqual(DEMO_VOICES[6])
  })

  it('names the voice as the DX stores it: ASCII, padded to 10', async () => {
    await demo()
    s().setValues([[[0x30, 0, 0], Array.from('Brass     ', (c) => c.charCodeAt(0))]], 'Name')
    await vi.advanceTimersByTimeAsync(50)
    expect(voiceName(s().fake!.edit)).toBe('Brass')
  })
})

describe('resync', () => {
  it('keeps Undo and Edited, and takes changes made on the DX as one undo step', async () => {
    await demo()
    s().setValue([0x31, 0, 0x12], 50)
    s().fake!.editAtPanel([0x31, 0, 0x01], 3)
    const read = s().resync()
    await vi.advanceTimersByTimeAsync(200)
    await read
    expect(s().voice!.ops[0][0x01]).toBe(3)
    expect(s().undoLabel).toBe('changes on the DX')
    expect(s().baseline).toEqual(DEMO_VOICES[0])
    s().undo()
    expect(s().undoLabel).toBe('OP1 Output level')
  })

  it('changes nothing when the DX has what the editor has', async () => {
    await demo()
    s().setValue([0x31, 0, 0x12], 50)
    await vi.advanceTimersByTimeAsync(50)
    const read = s().resync()
    await vi.advanceTimersByTimeAsync(200)
    await read
    expect(s().undoLabel).toBe('OP1 Output level')
  })
})

describe('init', () => {
  it('turns the voice into VOICE INIT as one undo step, without a bulk, and undo brings it back', async () => {
    await demo()
    const { initVoice } = await import('../src/params/init')
    const sent: Uint8Array[] = []
    const fake = s().fake!
    const send = fake.send.bind(fake)
    fake.send = (m) => (sent.push(m), send(m))
    s().init()
    await vi.advanceTimersByTimeAsync(200)
    expect(fake.edit).toEqual(initVoice())
    expect(s().undoLabel).toBe('Init voice')
    expect(sent.every((m) => m[2] >> 4 === 1)).toBe(true) // Parameter Changes only (43 1n …)
    s().undo()
    await vi.advanceTimersByTimeAsync(200)
    expect(fake.edit).toEqual(DEMO_VOICES[0])
  })
})
