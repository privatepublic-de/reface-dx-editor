import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../src/app/store'
import { useLibrary } from '../src/app/libraryStore'
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
    // sent back as one undo step; the baseline stays 1-5 as stored, so it shows as Edited
    expect(s().undoLabel).toBe('Load “Tine Piano”')
    expect(s().baseline).toEqual(DEMO_VOICES[4])
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

describe('library flows against the demo DX', () => {
  const lib = () => useLibrary.getState()
  beforeEach(() => useLibrary.setState({ entries: [], memory: Array(32).fill(null), job: null, notice: null }))

  async function run<T>(p: Promise<T>, ms = 12000): Promise<T> {
    await vi.advanceTimersByTimeAsync(ms)
    return p
  }

  it('reads all 32, keeps reading true throughout, and puts the editor’s edits back', async () => {
    await demo()
    await run(s().selectProgram(2), 500)
    s().setValue([0x31, 0, 0x12], 11)
    const job = s().readAll()
    await vi.advanceTimersByTimeAsync(1000)
    expect(s().reading).toBe(true)
    expect(lib().job!.done).toBeGreaterThan(0)
    await run(job)
    expect(lib().job).toBeNull()
    expect(lib().memory.every((m, i) => m && voiceName(m.voice) === voiceName(DEMO_VOICES[i % DEMO_VOICES.length]))).toBe(true)
    expect(s().program).toBe(2)
    expect(s().voice!.ops[0][0x12]).toBe(11)
    expect(s().fake!.edit.ops[0][0x12]).toBe(11)
    expect(s().undoLabel).toBe('OP1 Output level')
  })

  it('stops a Read all', async () => {
    await demo()
    const job = s().readAll()
    await vi.advanceTimersByTimeAsync(2100)
    s().stopReadAll()
    await run(job)
    expect(lib().memory.filter(Boolean).length).toBeLessThan(32)
    expect(lib().notice).toMatch(/^Stopped/)
  })

  it('checks a store: stored, as the DX reads back', async () => {
    await demo()
    s().setValue([0x31, 0, 0x12], 42)
    s().beginStore()
    s().fake!.storeAtPanel(5)
    expect(await run(s().checkStore(5), 1000)).toBe('ok')
    expect(s().program).toBe(5)
    expect(s().baseline).toEqual(s().voice)
    expect(lib().memory[5]!.voice.ops[0][0x12]).toBe(42)
  })

  it('takes a name given on the DX’s Store Name screen as one undo step', async () => {
    await demo()
    s().setValue([0x31, 0, 0x12], 42)
    s().fake!.editAtPanel([0x30, 0, 0], 'X'.charCodeAt(0))
    s().fake!.storeAtPanel(5)
    expect(await run(s().checkStore(5), 1000)).toBe('ok')
    expect(voiceName(s().voice!)).toBe('Xine Piano')
    expect(s().undoLabel).toBe('Name given on the DX')
  })

  it('says when nothing was stored, and puts the editor’s voice back into the DX', async () => {
    await demo()
    s().setValue([0x31, 0, 0x12], 42)
    expect(await run(s().checkStore(5), 1000)).toBe('differs')
    expect(s().voice!.ops[0][0x12]).toBe(42)
    expect(s().fake!.edit.ops[0][0x12]).toBe(42)
    expect(s().fake!.stored[5]).toEqual(DEMO_VOICES[5])
  })

  it('loads a voice as one undo step and keeps the baseline (so it shows as Edited)', async () => {
    await demo()
    s().loadVoice(DEMO_VOICES[3])
    expect(s().fake!.edit).toEqual(DEMO_VOICES[3])
    expect(s().baseline).toEqual(DEMO_VOICES[0])
    expect(s().undoLabel).toBe(`Load “${voiceName(DEMO_VOICES[3])}”`)
    s().undo()
    await vi.advanceTimersByTimeAsync(100)
    expect(s().fake!.edit).toEqual(DEMO_VOICES[0])
  })

  it('remembers what a location holds when the DX selects it', async () => {
    await demo()
    s().fake!.selectAtPanel(7)
    await vi.advanceTimersByTimeAsync(500)
    expect(lib().memory[7]!.voice).toEqual(DEMO_VOICES[7])
  })
})

describe('the demo’s own library', () => {
  // The test environment has no localStorage; the library needs one to come back after the demo.
  const store = new Map<string, string>()
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps what the demo does apart from the real library', async () => {
    const lib = () => useLibrary.getState()
    lib().useStorage('reface-dx-editor.library')
    useLibrary.setState({ entries: [], memory: Array(32).fill(null) })
    lib().keep(DEMO_VOICES[1], 'real')
    await demo()
    expect(lib().entries).toHaveLength(0)
    s().fake!.selectAtPanel(3)
    await vi.advanceTimersByTimeAsync(500)
    expect(lib().memory[3]).not.toBeNull()
    s().disconnect()
    expect(lib().entries.map((e) => e.source)).toEqual(['real'])
    expect(lib().memory[3]).toBeNull()
  })
})

describe('DX settings', () => {
  it('change the DX at once, several bytes for Master Tune and Tempo', async () => {
    const { masterTuneBytes, masterTuneCents, tempoBpm, tempoBytes } = await import('../src/params/system')
    await demo()
    s().setSystemValue(0x02, masterTuneBytes(-12.5))
    s().setSystemValue(0x08, tempoBytes(140))
    s().setSystemValue(0x01, 3)
    await vi.advanceTimersByTimeAsync(50)
    const sys = s().fake!.system
    expect(masterTuneCents(sys)).toBeCloseTo(-12.5)
    expect(tempoBpm(sys)).toBe(140)
    expect(sys[0x01]).toBe(3)
    // the editor now plays on the new receive channel
    const sent: Uint8Array[] = []
    const fake = s().fake!
    const send = fake.send.bind(fake)
    fake.send = (m) => (sent.push(m), send(m))
    s().noteOn(60, 90)
    expect(sent.at(-1)).toEqual(Uint8Array.of(0x93, 60, 90))
  })
})
