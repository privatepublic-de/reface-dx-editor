// What lives at a Parameter Change address: the param, its label and how its value reads.
import type { Address } from '../sysex/messages'
import { COMMON_PARAMS, NAME_LENGTH } from './common'
import { OPERATOR_PARAMS } from './operator'
import { formatValue, type Param } from './param'
import { SYSTEM_PARAMS } from './system'

export const isSystem = (a: Address) => a[0] === 0x00 && a[1] === 0x00
export const isCommon = (a: Address) => a[0] === 0x30 && a[1] === 0x00
export const isOperator = (a: Address) => a[0] === 0x31 && a[1] < 4

export function paramAt(a: Address): Param | undefined {
  if (isSystem(a)) return SYSTEM_PARAMS.find((p) => p.offset === a[2])
  if (isCommon(a)) return COMMON_PARAMS.find((p) => p.offset === a[2])
  if (isOperator(a)) return OPERATOR_PARAMS.find((p) => p.offset === a[2])
}

/** "OP2 Output level", "Algorithm", "Name char 3", "TR CH". */
export function addressLabel(a: Address): string {
  if (isCommon(a) && a[2] < NAME_LENGTH) return `Name char ${a[2] + 1}`
  const p = paramAt(a)
  const where = isSystem(a) ? 'SYSTEM' : isCommon(a) ? 'Common' : isOperator(a) ? `OP${a[1] + 1}` : 'address'
  if (!p) return `${where} byte 0x${a[2].toString(16)}`
  return isOperator(a) ? `OP${a[1] + 1} ${p.label}` : p.label
}

export function addressValue(a: Address, v: number): string {
  if (isCommon(a) && a[2] < NAME_LENGTH) return `'${String.fromCharCode(v)}'`
  const p = paramAt(a)
  return p ? formatValue(p, v) : String(v)
}

/** A stable string for an address: history keys, the "touched" highlight. */
export const addressKey = (a: Address) => `${a[0].toString(16)}.${a[1]}.${a[2]}`
