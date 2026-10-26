// Plays a voice on the reface DX and records it, for the sound tools (after nord-lead-2-editor's nordTake): the voice
// into the DX's edit buffer (all 7 blocks; never stored, FINDINGS Q2), one held note on its receive channel, recorded
// from the X18 (the default audio input) with sox. DX_INPUTS picks the X18 inputs the DX is on (default "1,2").
// The voice the DX had when the tool started is sent back at the end.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Voice } from '../src/sysex/codec'
import { Session } from '../src/sync/session'
import { connectHelper } from './coremidiTransport'
import { RATE } from './dxAudio'

export { RATE }
export const INPUTS = (process.env.DX_INPUTS ?? '1,2').split(',').map(Number)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Records `seconds` of the X18's inputs `inputs` (1-based) into a 24-bit WAV. */
export function record(file: string, seconds: number, inputs = INPUTS): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = ['-t', 'coreaudio', '-c', '18', '-r', String(RATE), 'default']
    const rec = spawn('sox', ['-q', ...input, '-c', String(inputs.length), '-b', '24', file, 'remix', ...inputs.map(String), 'trim', '0', String(seconds)], {
      stdio: 'inherit',
    })
    rec.on('error', reject)
    rec.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sox exited with ${code}`))))
  })
}

/** A 24-bit WAV, one Float64Array per channel. */
export function readWavChannels(file: string): Float64Array[] {
  const buf = readFileSync(file)
  let pos = 12
  let channels = 2
  let bits = 24
  while (pos < buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(pos + 10)
      bits = buf.readUInt16LE(pos + 22)
    } else if (id === 'data') {
      const bytes = bits / 8
      const frames = Math.floor(size / (bytes * channels))
      const out = Array.from({ length: channels }, () => new Float64Array(frames))
      for (let f = 0; f < frames; f++)
        for (let c = 0; c < channels; c++) out[c][f] = buf.readIntLE(pos + 8 + (f * channels + c) * bytes, bytes) / 2 ** (bits - 1)
      return out
    }
    pos += 8 + size + (size & 1)
  }
  throw new Error(`${file}: no data`)
}

/** The channels' mean. */
export function readWav(file: string): Float64Array {
  const ch = readWavChannels(file)
  const out = new Float64Array(ch[0].length)
  for (const c of ch) for (let i = 0; i < out.length; i++) out[i] += c[i] / ch.length
  return out
}

export interface TakeOptions {
  velocity?: number
  /** seconds recorded after note-off (the release) */
  tailS?: number
}

export async function openDx() {
  const transport = await connectHelper()
  const session = new Session(transport)
  const connected = await session.connect()
  if (!connected) throw new Error('the DX didn’t answer')
  const before = connected.voice
  const ch = session.playChannel
  const send = (bytes: number[]) => transport.send(Uint8Array.from(bytes))
  let held: number[] = []
  const restore = () => {
    for (const n of held) send([0x80 | ch, n, 0])
    send([0xb0 | ch, 123, 0])
    session.sendVoice(before)
  }
  // A killed run mustn't leave a note hanging, or the DX on a test voice.
  const stop = () => {
    restore()
    setTimeout(() => process.exit(130), 200)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  /** Plays `voice` with `note` (or a chord) held `holdS`; the recording (in `file`) from just before note-on. */
  async function take(file: string, voice: Voice, note: number | number[], holdS: number, o: TakeOptions = {}): Promise<Float64Array> {
    send([0xb0 | ch, 123, 0])
    session.sendVoice(voice) // a bulk cuts what still sounds (FINDINGS Q7)
    await sleep(150)
    const tail = o.tailS ?? 0.6
    const done = record(file, holdS + tail + 0.3)
    await sleep(300)
    held = Array.isArray(note) ? [...note] : [note]
    for (const n of held) send([0x90 | ch, n, o.velocity ?? 100])
    await sleep(holdS * 1000)
    for (const n of held) send([0x80 | ch, n, 0])
    held = []
    await done
    return readWav(file)
  }

  function close() {
    restore()
    // Let the last messages leave before the helper's stdin closes.
    setTimeout(() => transport.close(), 200)
  }

  return { take, send, session, system: connected.system, close }
}
