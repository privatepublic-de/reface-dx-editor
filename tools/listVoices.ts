// Lists the Voices in a .syx file with every value out of its documented range: npm run list-voices -- file.syx
import { readFileSync } from 'node:fs'
import { COMMON_PARAMS } from '../src/params/common'
import { OPERATOR_PARAMS } from '../src/params/operator'
import { describeFrequency } from '../src/params/display'
import { voiceName, voicesFromBytes } from '../src/sysex/codec'

const file = process.argv[2]
if (!file) throw new Error('usage: list-voices <file.syx>')
const { voices, problems } = voicesFromBytes(readFileSync(file))
for (const p of problems) console.log(`! ${p}`)
voices.forEach((v, i) => {
  const odd = [
    ...COMMON_PARAMS.filter((p) => v.common[p.offset] < p.min || v.common[p.offset] > p.max).map((p) => `${p.label}=${v.common[p.offset]}`),
    ...v.ops.flatMap((op, n) => OPERATOR_PARAMS.filter((p) => op[p.offset] < p.min || op[p.offset] > p.max).map((p) => `OP${n + 1} ${p.label}=${op[p.offset]}`)),
  ]
  const freqs = v.ops.map((op) => `${op[0x15] ? 'fixed ' : ''}${describeFrequency(op[0x15], op[0x16], op[0x17])}`).join(' | ')
  console.log(`${String(i + 1).padStart(2)} ${voiceName(v).padEnd(10)} algo ${v.common[0x10] + 1}  ${freqs}${odd.length ? `  OUT OF RANGE: ${odd.join(', ')}` : ''}`)
})
