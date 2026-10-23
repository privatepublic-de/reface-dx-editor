import { describe, expect, it } from 'vitest'
import { ADDRESS, bulkBlock, checksum, dumpRequest, IDENTITY_REPLY, identityRequest, parameterChange, parameterRequest, parseSysex, splitSysex } from '../src/sysex/messages'

const hex = (s: string) => Uint8Array.from(s.trim().split(/\s+/).map((x) => parseInt(x, 16)))

describe('message builders', () => {
  it('builds the dump request the forum and every librarian use', () => {
    expect(dumpRequest(0, ADDRESS.bulkHeader)).toEqual(hex('f0 43 20 7f 1c 05 0e 0f 00 f7'))
  })

  it('puts the device number in the low nibble of each kind', () => {
    expect(parameterChange(3, [0x31, 0x01, 0x12], [100])).toEqual(hex('f0 43 13 7f 1c 05 31 01 12 64 f7'))
    expect(parameterRequest(15, ADDRESS.system)[2]).toBe(0x3f)
    expect(dumpRequest(0x12, ADDRESS.common)[2]).toBe(0x22)
    expect(identityRequest(0)).toEqual(hex('f0 7e 00 06 01 f7'))
  })

  it('frames the bulk header exactly as captured from a real DX', () => {
    expect(bulkBlock(0, ADDRESS.bulkHeader, [])).toEqual(hex('f0 43 00 7f 1c 00 04 05 0e 0f 00 5e f7'))
  })

  it('sizes the voice blocks as the Data List says (byte count + 9 = message length)', () => {
    expect(bulkBlock(0, ADDRESS.common, new Uint8Array(38)).length).toBe(51)
    expect(bulkBlock(0, ADDRESS.operator(2), new Uint8Array(28)).length).toBe(41)
    const common = bulkBlock(0, ADDRESS.common, new Uint8Array(38))
    expect((common[5] << 7) | common[6]).toBe(42)
  })

  it('checksum makes model + address + data + checksum a multiple of 128', () => {
    const body = [0x05, 0x30, 0x00, 0x00, 65, 66, 67, 127, 0]
    expect((body.reduce((s, b) => s + b, 0) + checksum(body)) % 128).toBe(0)
  })
})

describe('parseSysex', () => {
  it('reads a bulk block back, with its checksum checked', () => {
    const data = Uint8Array.from({ length: 28 }, (_, i) => i * 3)
    const parsed = parseSysex(bulkBlock(0, ADDRESS.operator(3), data))
    expect(parsed).toEqual({ kind: 'bulk', device: 0, address: [0x31, 3, 0], data, checksumOk: true })
  })

  it('flags a wrong checksum', () => {
    const m = bulkBlock(0, ADDRESS.common, new Uint8Array(38))
    m[m.length - 2] ^= 1
    expect(parseSysex(m)).toMatchObject({ kind: 'bulk', checksumOk: false })
  })

  it('rejects a bulk whose length does not match its byte count', () => {
    const m = bulkBlock(0, ADDRESS.common, new Uint8Array(38))
    expect(parseSysex(Uint8Array.from([...m.slice(0, -2), 0, ...m.slice(-2)]))).toBeNull()
  })

  it('reads parameter changes (what a Parameter Request may answer with)', () => {
    expect(parseSysex(hex('f0 43 10 7f 1c 05 30 00 10 03 f7'))).toEqual({ kind: 'parameterChange', device: 0, address: [0x30, 0, 0x10], data: Uint8Array.of(3) })
  })

  it('recognizes the Identity Reply and reads its version byte', () => {
    expect(parseSysex(IDENTITY_REPLY)).toMatchObject({ kind: 'identityReply', matchesManual: true, version: 0 })
    // As a DX with firmware 1.30 sent it on 2026-10-23.
    expect(parseSysex(hex('f0 7e 7f 06 02 43 00 41 53 06 03 00 00 7f f7'))).toMatchObject({ kind: 'identityReply', matchesManual: true, version: 3 })
    const other = IDENTITY_REPLY.slice()
    other[8] = 0x54
    expect(parseSysex(other)).toMatchObject({ kind: 'identityReply', matchesManual: false })
  })

  it('ignores other models and makers', () => {
    expect(parseSysex(hex('f0 43 20 7f 1c 03 0e 0f 00 f7'))).toBeNull()
    expect(parseSysex(hex('f0 33 0f 04 0e 00 f7'))).toBeNull()
  })
})

describe('splitSysex', () => {
  it('splits a stream into messages and drops stray bytes', () => {
    expect(splitSysex(hex('fe f0 01 f7 90 40 f0 02 03 f7'))).toEqual([hex('f0 01 f7'), hex('f0 02 03 f7')])
  })
})
