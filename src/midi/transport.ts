/** What the session needs from MIDI: whole messages out, whole messages in. */
export interface MidiTransport {
  send(message: Uint8Array): void
  subscribe(listener: (message: Uint8Array) => void): () => void
}

export interface MidiPortPair {
  input: MIDIInput
  output: MIDIOutput
}

/** Why this page can't use Web MIDI at all, or null when it can (permission is asked later, on Connect). */
export function webMidiUnavailable(): string | null {
  if ('requestMIDIAccess' in navigator) return null
  // Browsers only offer Web MIDI on secure pages: a file opened from disk or a plain-http host has none.
  if (!window.isSecureContext) return 'Web MIDI needs the served page: open the editor with the start script, not from disk.'
  return 'This browser doesn\u2019t support Web MIDI. Use Chrome, Edge or Firefox.'
}

export async function requestWebMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI')
  return navigator.requestMIDIAccess({ sysex: true })
}

/** Port names tried first: the synth via a USB interface; the probe offers all ports anyway. */
export const DEFAULT_PORT = /reface/i

export function portNames(access: MIDIAccess) {
  return {
    inputs: [...access.inputs.values()].map((p) => p.name ?? ''),
    outputs: [...access.outputs.values()].map((p) => p.name ?? ''),
  }
}

/** The input/output pair by name (a saved choice), else the first matching `fallback`, else the first port
 *  (so Connect always picks something the port menus can then change). */
export function findPorts(access: MIDIAccess, names: { input?: string; output?: string } = {}, fallback = DEFAULT_PORT): MidiPortPair | null {
  const pick = <P extends MIDIPort>(ports: Iterable<P>, name?: string) => {
    const list = [...ports]
    return list.find((p) => name && p.name === name) ?? list.find((p) => fallback.test(p.name ?? '')) ?? list[0]
  }
  const input = pick(access.inputs.values(), names.input)
  const output = pick(access.outputs.values(), names.output)
  return input && output ? { input, output } : null
}

export function webMidiTransport({ input, output }: MidiPortPair): MidiTransport {
  const listeners = new Set<(message: Uint8Array) => void>()
  input.onmidimessage = (e) => {
    if (!e.data || e.data[0] >= 0xf8) return
    for (const l of listeners) l(e.data)
  }
  return {
    // A port that has gone throws on send; skip it (the store notices the port is gone).
    send: (message) => {
      if (output.state === 'connected') output.send(message)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
