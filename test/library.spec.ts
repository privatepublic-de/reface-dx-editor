import { describe, expect, it } from 'vitest'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { addEntries, deserialize, exportSyx, fileName, importSyx, makeEntry, sameVoice, serialize, voiceBytes, voiceFromBytes } from '../src/library/library'
import { cloneVoice, setVoiceName, VOICE_BYTES } from '../src/sysex/codec'

describe('library', () => {
  it('keeps a voice as 150 bytes and back', () => {
    const v = DEMO_VOICES[2]
    expect(voiceBytes(v)).toHaveLength(150)
    expect(voiceFromBytes(voiceBytes(v))).toEqual(v)
    expect(voiceFromBytes([1, 2, 3])).toBeNull()
  })

  it('exports the DX’s own format and imports it again', () => {
    const bytes = exportSyx(DEMO_VOICES.slice(0, 3))
    expect(bytes).toHaveLength(3 * VOICE_BYTES)
    const { entries, problems } = importSyx(bytes, 'three.syx', 5)
    expect(problems).toEqual([])
    expect(entries.map((e) => e.voice)).toEqual(DEMO_VOICES.slice(0, 3))
    expect(entries.every((e) => e.source === 'three.syx' && e.addedAt === 5)).toBe(true)
  })

  it('flags out-of-range values on the way in, without changing them', () => {
    const odd = cloneVoice(DEMO_VOICES[0])
    odd.common[0x10] = 20
    const e = makeEntry(odd, 'odd.syx')
    expect(e.problems).toEqual(['Algorithm: 20'])
    expect(e.voice.common[0x10]).toBe(20)
  })

  it('skips voices it already has (same bytes, name included)', () => {
    const a = makeEntry(DEMO_VOICES[0], 'x')
    const renamed = cloneVoice(DEMO_VOICES[0])
    setVoiceName(renamed, 'Other')
    const { library, skipped } = addEntries([a], [makeEntry(DEMO_VOICES[0], 'y'), makeEntry(renamed, 'y'), makeEntry(DEMO_VOICES[1], 'y')])
    expect(skipped).toBe(1)
    expect(library).toHaveLength(3)
    expect(sameVoice(library[2].voice, DEMO_VOICES[0])).toBe(true)
  })

  it('saves and loads entries and the DX memory', () => {
    const entries = [makeEntry(DEMO_VOICES[3], 'kept', 7)]
    const memory = Array.from({ length: 32 }, (_, i) => (i === 4 ? { voice: DEMO_VOICES[4], seenAt: 9 } : null))
    const back = deserialize(serialize(entries, memory))
    expect(back.entries).toEqual(entries)
    expect(back.memory[4]).toEqual({ voice: DEMO_VOICES[4], seenAt: 9 })
    expect(back.memory.filter(Boolean)).toHaveLength(1)
    expect(deserialize('not json').entries).toEqual([])
    expect(deserialize(null).memory).toHaveLength(32)
  })

  it('makes file names from voice names', () => {
    expect(fileName(DEMO_VOICES[0])).toBe('Tine Piano.syx')
    expect(fileName('a/b: c')).toBe('a_b_ c.syx')
    expect(fileName('   ')).toBe('voice.syx')
  })
})
