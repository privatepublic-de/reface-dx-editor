import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportedVoice } from '../src/dx7/import'
import { initVoice as dx7Init, setVoiceName } from '../src/dx7/voice'
import { initVoice } from '../src/params/init'

// two workers, each finishing when the test says so
const jobs: { name: string; resolve(r: ImportedVoice): void }[] = []
vi.mock('../src/dx7/converter', () => ({
  canConvert: () => jobs.length < 2,
  convertDx7: (dx: Uint8Array) => new Promise<ImportedVoice>((resolve) => {
    const name = String.fromCharCode(...dx.subarray(145, 155)).trim()
    jobs.push({ name, resolve: (r) => { jobs.splice(jobs.findIndex((j) => j.name === name), 1); resolve(r) } })
  }),
  stopConverting: () => { jobs.length = 0 },
}))

const { useDx7 } = await import('../src/app/dx7Store')
const tick = () => new Promise((r) => setTimeout(r, 0))
const finish = async (name: string) => {
  jobs.find((j) => j.name === name)!.resolve({ voice: initVoice(), reduced: 'all', distance: 1 })
  await tick()
}
const bank = (n: number) => Array.from({ length: n }, (_, i) => {
  const v = dx7Init()
  setVoiceName(v, `V${i + 1}`)
  return { voice: v, source: `bank 1 / ${i + 1}` }
})

afterEach(() => useDx7.getState().close())

describe('the DX7 import converts in the background', () => {
  it('every voice in file order, as many at once as there are workers', async () => {
    useDx7.getState().open('test.syx', bank(5))
    expect(jobs.map((j) => j.name)).toEqual(['V1', 'V2'])
    expect(useDx7.getState().voices.map((v) => (typeof v.converted === 'string' ? v.converted : 'done'))).toEqual(['working', 'working', 'queued', 'queued', 'queued'])
    await finish('V1')
    expect(jobs.map((j) => j.name)).toEqual(['V2', 'V3'])
  })

  it('a voice clicked goes to the front of the queue', async () => {
    useDx7.getState().open('test.syx', bank(5))
    useDx7.getState().hear(4)
    expect(useDx7.getState().hearing).toBe(4)
    await finish('V2')
    expect(jobs.map((j) => j.name)).toEqual(['V1', 'V5'])
  })

  it('closing stops it: later results are dropped', async () => {
    useDx7.getState().open('test.syx', bank(3))
    useDx7.getState().close()
    expect(jobs).toEqual([])
    expect(useDx7.getState().voices).toEqual([])
  })
})
