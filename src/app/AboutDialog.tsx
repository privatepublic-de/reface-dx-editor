// Help and About: how to set up the DX, how the editor works, credits and license.
import { useEffect, useRef } from 'react'
import licenseText from '../../LICENSE?raw'
import { version } from '../../package.json'

const CREDITS: { what: string; who: string; license: string; href: string }[] = [
  { what: 'SysEx and CC protocol', who: 'the reface Data List, corrected by tests on the DX (docs/FINDINGS.md in the source)', license: '', href: '' },
  { what: 'DX7 engine (MSFA)', who: 'Google Inc., the DX7 tables, envelopes and algorithm routing behind the DX7 import and the probe engine', license: 'Apache License 2.0', href: 'https://github.com/google/music-synthesizer-for-android' },
  { what: 'Start from… instruments', who: 'classic DX7 voices by Yamaha, and two pianos of unknown authorship from the cartridges that come with Dexed, by way of the volca fm generator', license: '', href: 'https://github.com/privatepublic-de/volca-fm-generator' },
  { what: 'Fonts Barlow and Barlow Condensed', who: 'The Barlow Project Authors', license: 'SIL OFL 1.1', href: 'https://github.com/jpt/barlow' },
  { what: 'React, React DOM', who: 'Facebook, Inc. (Meta) and its affiliates', license: 'MIT', href: 'https://react.dev' },
  { what: 'Zustand', who: 'Paul Henschel', license: 'MIT', href: 'https://github.com/pmndrs/zustand' },
]

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])
  return (
    <dialog ref={ref} className="about-dialog" onClose={onClose} aria-label="Help and About">
      <form method="dialog" className="about-dialog__close">
        <button aria-label="Close">×</button>
      </form>
      <h2>reface DX Editor</h2>
      <p className="dim">
        Version {version} · © 2026 Peter Witzel · MIT License ·{' '}
        <a href="privacy.html" target="_blank" rel="noreferrer">Privacy</a>
      </p>
      <p>A voice editor for the Yamaha reface DX over Web MIDI: every parameter on one screen, including those behind the DX’s Edit mode.</p>

      <h3>On the DX</h3>
      <ul>
        <li>Connect it by USB, or MIDI in and out. The editor finds it by itself; any device number works.</li>
        <li>Turn on MIDI Control (FUNCTION, MIDI page, or in the editor’s connection menu) so FREQ, LEVEL, ALGO and FB moves on the DX show up here.</li>
      </ul>

      <h3>Controls</h3>
      <ul>
        <li>Drag up or down to turn; hold Shift for fine steps. The wheel and arrow keys work too (Page Up/Down for big steps, Home/End for the ends). Double-click or Delete for the default. Click a value to type one.</li>
        <li>On the DX only FREQ, LEVEL, ALGO and FB send their moves. After changing anything else there (in Edit mode, an effect, the name), press ↻ or come back to this window: the editor reads the voice again.</li>
      </ul>

      <h3>Editing</h3>
      <ul>
        <li>Every change goes to the DX at once, into the voice it is playing. Nothing is stored until you press STORE on the DX.</li>
        <li>The location menu next to the name selects a stored voice on the DX. Choosing a voice on the DX itself is followed here.</li>
        <li><b>Edited</b> means the voice differs from what was last read from the DX.</li>
        <li><b>Init</b> starts over with the DX’s VOICE INIT (a sine on OP1).</li>
        <li><b>Style</b> opens the tonality wheel in a window over the editor (the keyboard stays playable below it). Click the wheel to pin a tonality (up to three): towards the rim is more extreme, the ring around a pin is its weight (turn it, or scroll on the pin), drag a pin off the wheel to take it away. The sentence under the wheel says what the pins made. <b>Variation</b> moves the details, <b>Mutate</b> moves the pins, <b>New voice</b> (or the wheel’s centre) rolls new ones. <b>Start from…</b> offers 41 classic DX7 instruments (keys, plucked, mallets, bass, winds, brass, strings, percussion, voices), converted to the reface’s four operators, as the base: pins then colour it, and × beside its name goes back to the wheel alone. Where an instrument holds several originals, Variation moves between them. Brightness, complexity, motion and the envelope are next to it (each envelope drawn small; <i>Own</i> draws the one you hear, as the DX plays it); <i>Playing</i>, <i>More</i> and <i>Effects</i> open for the rest. You hear every change on the DX at once. <b>Mix</b> goes from your voice as it was to the wheel’s. <b>Apply</b> keeps what you hear as one undo step; <b>Cancel</b> or Escape goes back to the voice as it was.</li>
        <li><b>Link</b> (in an operator’s EG) makes an envelope edit carry over to the other operators with the same role: carriers with carriers, modulators with modulators. Rates move by the same amount, levels by the same ratio. Hold Alt/Option to link one edit.</li>
      </ul>

      <h3>Store and Library</h3>
      <ul>
        <li><b>Store…</b> keeps the voice in one of the DX’s 32 locations. The DX stores only from its own panel, so the editor guides you: choose the location, press STORE on the DX and choose the same one, then <b>Check</b>. The editor reads the location back to make sure. A name you give on the DX’s Store Name screen comes over.</li>
        <li><b>On the DX</b> shows the 32 locations as last read; <b>Read all 32</b> reads them all (about 7 s). Click one to select it on the DX.</li>
        <li><b>In this browser</b> keeps voices you collect: the one you edit, the DX’s memory, .syx files you import. Click one to play it on the DX (the whole voice goes over, so sounding notes stop); it is one undo step and nothing is stored until you Store.</li>
        <li><b>Store</b> always means the DX’s memory, <b>Export</b> always means a .syx file on your computer.</li>
        <li><b>DX7 voices:</b> Import .syx… with a DX7 file (one voice or a 32-voice bank) opens a window with their names, and every voice starts converting to the reface’s four operators in the background (a spinner turns on those in hand, a faint ring on those waiting; a bank takes under a minute). Click one to hear it on the DX: if it isn’t ready yet it goes first. “Close”, “fair” or “loose” says how near a conversion came, more on hover. Tick the ones you want and <b>Add</b> them to the library; Cancel or Escape gives the DX your voice back. <b>A converted voice is an approximation, not a copy:</b> the DX7 has six operators and 32 algorithms, the reface four and 12, and its envelopes, feedback and pitch EG work differently, so most voices lose something (a stack, a hammer’s first click, a slowly opening brass swell). None sounds exactly as in Dexed or on a real DX7: listen before you keep one, and treat it as a starting point.</li>
      </ul>

      <h3>How it was made</h3>
      <p>
        Vibe-coded with <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude</a> by Anthropic: Peter Witzel designed
        it and tested it on the DX, Claude wrote the code.
      </p>

      <h3>Built on</h3>
      <ul>
        {CREDITS.map((c) => (
          <li key={c.what}>
            {c.href ? <a href={c.href} target="_blank" rel="noreferrer">{c.what}</a> : c.what}: {c.who}
            {c.license && <span className="dim"> · {c.license}</span>}
          </li>
        ))}
      </ul>
      <p className="dim">
        Yamaha, reface and DX7 are trademarks of Yamaha Corporation. This editor is not affiliated with or endorsed by Yamaha.
        Details and licenses: THIRD_PARTY_NOTICES.md in the{' '}
        <a href="https://github.com/privatepublic-de/reface-dx-editor" target="_blank" rel="noreferrer">source on GitHub</a>.
      </p>
      <details>
        <summary>License</summary>
        <pre className="about-dialog__text">{licenseText}</pre>
      </details>
    </dialog>
  )
}
