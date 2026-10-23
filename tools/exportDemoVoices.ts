// Writes the demo voices as one .syx (7-block voices back to back): npm run export-demo -- out.syx
import { writeFileSync } from 'node:fs'
import { DEMO_VOICES } from '../src/demo/demoVoices'
import { voiceToBytes } from '../src/sysex/codec'

const file = process.argv[2] ?? 'local/demo-voices.syx'
writeFileSync(file, Uint8Array.from(DEMO_VOICES.flatMap((v) => [...voiceToBytes(0, v)])))
console.log(`${DEMO_VOICES.length} voices → ${file}`)
