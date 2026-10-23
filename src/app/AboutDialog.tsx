// Help and About: how to set up the DX, how the editor works, credits and license.
import { useEffect, useRef } from 'react'
import licenseText from '../../LICENSE?raw'
import { version } from '../../package.json'

const CREDITS: { what: string; who: string; license: string; href: string }[] = [
  { what: 'SysEx and CC protocol', who: 'the reface Data List, corrected by tests on the DX (docs/FINDINGS.md in the source)', license: '', href: '' },
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
        <li><b>Init</b> starts over from the DX’s VOICE INIT sound (a sine on OP1), as one undo step.</li>
        <li><b>Link</b> (in an operator’s EG) makes an envelope edit carry over to the other operators with the same role: carriers with carriers, modulators with modulators. Rates move by the same amount, levels by the same ratio. Hold Alt/Option to link one edit.</li>
      </ul>

      <h3>Store and Library</h3>
      <ul>
        <li><b>Store…</b> keeps the voice in one of the DX’s 32 locations. The DX stores only from its own panel, so the editor guides you: choose the location, press STORE on the DX and choose the same one, then <b>Check</b>. The editor reads the location back to make sure. A name you give on the DX’s Store Name screen comes over.</li>
        <li><b>On the DX</b> shows the 32 locations as last read; <b>Read all 32</b> reads them all (about 7 s). Click one to select it on the DX.</li>
        <li><b>In this browser</b> keeps voices you collect: the one you edit, the DX’s memory, .syx files you import. Click one to play it on the DX (the whole voice goes over, so sounding notes stop); it is one undo step and nothing is stored until you Store.</li>
        <li><b>Store</b> always means the DX’s memory, <b>Export</b> always means a .syx file on your computer.</li>
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
      <p className="dim">Yamaha and reface are trademarks of Yamaha Corporation. This editor is not affiliated with or endorsed by Yamaha.</p>
      <details>
        <summary>License</summary>
        <pre className="about-dialog__text">{licenseText}</pre>
      </details>
    </dialog>
  )
}
