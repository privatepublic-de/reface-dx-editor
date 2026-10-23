// reface DX SysEx framing (reface Data List pp. 6–7). One place for the header bytes and addresses, so
// Phase 0 findings change only this file.

export const YAMAHA = 0x43
export const GROUP_HIGH = 0x7f
export const GROUP_LOW = 0x1c
export const MODEL_DX = 0x05

/** High nibble of the third byte: what the message is. The low nibble is the device number (0–15). */
export const KIND = { bulk: 0x00, parameterChange: 0x10, dumpRequest: 0x20, parameterRequest: 0x30 } as const

export type Address = readonly [high: number, mid: number, low: number]

export const ADDRESS = {
  system: [0x00, 0x00, 0x00],
  bulkHeader: [0x0e, 0x0f, 0x00],
  common: [0x30, 0x00, 0x00],
  operator: (op: number): Address => [0x31, op, 0x00],
  bulkFooter: [0x0f, 0x0f, 0x00],
} as const satisfies Record<string, Address | ((op: number) => Address)>

/** Data sizes of the bulk blocks (the Data List's byte counts minus Model ID and address). */
export const SIZE = { system: 32, common: 38, operator: 28 } as const

/** `F0 7E 0n 06 01 F7`. The DX answers device byte 0n but ignores the all-call 7F (FINDINGS Q11). */
export const identityRequest = (device: number) => Uint8Array.of(0xf0, 0x7e, device & 0x7f, 0x06, 0x01, 0xf7)
/** The reply as the Data List prints it (firmware 1.00). Byte 10 is `03` on a DX with firmware 1.30: the version. */
export const IDENTITY_REPLY = Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x43, 0x00, 0x41, 0x53, 0x06, 0x00, 0x00, 0x00, 0x7f, 0xf7)

const header = (kind: number, device: number) => [0xf0, YAMAHA, kind | (device & 0x0f), GROUP_HIGH, GROUP_LOW]

export const parameterChange = (device: number, address: Address, data: ArrayLike<number>) =>
  Uint8Array.from([...header(KIND.parameterChange, device), MODEL_DX, ...address, ...Array.from(data, (b) => b & 0x7f), 0xf7])

export const dumpRequest = (device: number, address: Address) =>
  Uint8Array.from([...header(KIND.dumpRequest, device), MODEL_DX, ...address, 0xf7])

export const parameterRequest = (device: number, address: Address) =>
  Uint8Array.from([...header(KIND.parameterRequest, device), MODEL_DX, ...address, 0xf7])

/** Checksum of a bulk block: makes Model ID + address + data + checksum ≡ 0 (mod 128). */
export const checksum = (bytes: ArrayLike<number>) => -Array.from(bytes).reduce((s, b) => s + b, 0) & 0x7f

/** One bulk dump message. Byte count = data + 4 (Model ID and the 3 address bytes). */
export function bulkBlock(device: number, address: Address, data: ArrayLike<number>): Uint8Array {
  const body = [MODEL_DX, ...address, ...Array.from(data, (b) => b & 0x7f)]
  const count = body.length
  return Uint8Array.from([...header(KIND.bulk, device), (count >> 7) & 0x7f, count & 0x7f, ...body, checksum(body), 0xf7])
}

export type DxSysex =
  | { kind: 'bulk'; device: number; address: Address; data: Uint8Array; checksumOk: boolean }
  | { kind: 'parameterChange'; device: number; address: Address; data: Uint8Array }
  | { kind: 'dumpRequest' | 'parameterRequest'; device: number; address: Address }
  | { kind: 'identityReply'; bytes: Uint8Array; matchesManual: boolean; version: number }

/** A reface DX message (or the Identity Reply), or null for anything else, including bulks whose length
 *  doesn't match their byte count. */
export function parseSysex(m: ArrayLike<number>): DxSysex | null {
  const b = Uint8Array.from(m)
  if (b[0] !== 0xf0 || b[b.length - 1] !== 0xf7) return null
  if (b[1] === 0x7e && b[3] === 0x06 && b[4] === 0x02) {
    // Byte 2 is the device, byte 10 the version: the rest must be the Data List's reply.
    const matchesManual = b.length === IDENTITY_REPLY.length && b.every((x, i) => i === 2 || i === 10 || x === IDENTITY_REPLY[i])
    return { kind: 'identityReply', bytes: b, matchesManual, version: b[10] }
  }
  if (b[1] !== YAMAHA || b[3] !== GROUP_HIGH || b[4] !== GROUP_LOW) return null
  const kind = b[2] & 0x70
  const device = b[2] & 0x0f
  if (kind === KIND.bulk) {
    const count = (b[5] << 7) | b[6]
    if (b.length !== count + 9 || b[7] !== MODEL_DX) return null
    const body = b.subarray(7, 7 + count)
    return { kind: 'bulk', device, address: [b[8], b[9], b[10]], data: b.slice(11, 7 + count), checksumOk: checksum(body) === b[7 + count] }
  }
  if (b[5] !== MODEL_DX || b.length < 10) return null
  const address: Address = [b[6], b[7], b[8]]
  if (kind === KIND.parameterChange) return { kind: 'parameterChange', device, address, data: b.slice(9, -1) }
  if (kind === KIND.dumpRequest) return { kind: 'dumpRequest', device, address }
  if (kind === KIND.parameterRequest) return { kind: 'parameterRequest', device, address }
  return null
}

export const sameAddress = (a: Address, b: Address) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
export const formatAddress = (a: Address) => a.map((x) => x.toString(16).padStart(2, '0')).join(' ')

/** Splits a .syx file (or any byte stream) into F0…F7 messages; bytes outside them are dropped. */
export function splitSysex(bytes: ArrayLike<number>): Uint8Array[] {
  const out: Uint8Array[] = []
  let start = -1
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i
    else if (bytes[i] === 0xf7 && start >= 0) {
      out.push(Uint8Array.from(Array.prototype.slice.call(bytes, start, i + 1)))
      start = -1
    }
  }
  return out
}
