# reface DX Editor

A voice editor and librarian for the Yamaha reface DX in the browser, over Web MIDI. Every parameter on one
screen, including everything behind the DX's Edit mode: the algorithm as the DX draws it, four operators with
their envelopes and keyboard scaling, LFO, pitch EG and effects.

**[Open the editor →](https://privatepublic-de.github.io/reface-dx-editor/)** (or
[try the demo](https://privatepublic-de.github.io/reface-dx-editor/?demo), with a simulated DX). Chrome, Edge or
Firefox, nothing to install.

[![The editor in demo mode: the algorithm, voice, LFO and pitch EG on the left, the four operators side by side
with their frequency, envelope and keyboard-scaling screens, the effects below](docs/screenshot.png)](https://privatepublic-de.github.io/reface-dx-editor/?demo)
<sub>Click the picture to open the editor in demo mode: a simulated DX, no synth needed.</sub>

## How it was made

This editor is vibe-coded with [Claude](https://claude.com/claude-code) by Anthropic: Peter Witzel designed
it and tested it on the DX, Claude wrote the code. Every commit says so in a `Co-Authored-By: Claude` line.
What it knows about the DX's MIDI comes from Yamaha's reface Data List, corrected by tests on a reface DX:
[docs/FINDINGS.md](docs/FINDINGS.md).

## Running it

Open https://privatepublic-de.github.io/reface-dx-editor/ in Chrome, Edge or Firefox (Safari has no Web MIDI),
allow MIDI access, click Connect. Firefox first offers a small *site permission add-on* for the page: that's how it
grants MIDI with SysEx. Add it; it covers this page only and can be removed under Add-ons and themes.

### Offline, from your own computer

Web MIDI only works on a served page, not on a file opened from disk, so offline the editor runs from a small
local server. It needs [Node.js](https://nodejs.org). Double-click the launcher for your system in `start/`:
`start-macos.command` (the first time: right-click, Open), `start-windows.bat` or `start.sh`. It installs what's
needed the first time, builds the editor and opens http://localhost:5185; the same from a terminal: `npm start`.
The port is fixed because the browser remembers the MIDI permission per address. Add `?demo` to the address to
try it with a simulated DX.

### On the DX

- Connect it by USB (or MIDI in and out). The editor finds it by itself; any device number works.
- Turn on MIDI Control (FUNCTION, MIDI page, or the checkbox in the editor's connection menu) so FREQ, LEVEL,
  ALGO and FB moves on the DX show up in the editor.

## What it does

- **Panel:** the voice on one screen. Edits go to the DX at once, into the voice it plays, as Parameter
  Changes, so sounding notes keep sounding. Feedback is one knob like the DX's FB slider (square to the left,
  saw to the right), keyboard scaling is drawn as on the DX's KSC-Level screen, and the envelopes can be
  dragged. Undo and redo; **Init** starts from the DX's VOICE INIT sound.
- **Style:** make a voice by how it should sound. Pins on a wheel of twelve tonalities (Noise, Metal, Bell, Glass,
  Tine, Wood, Organ, Sine, Reed, Brass, String, Breath; the same wheel as the
  [volca fm generator](https://github.com/privatepublic-de/volca-fm-generator)): the heaviest makes the voice, the
  others come in as a voice of their own or colour it. **Start from…** gives 41 classic DX7 instruments as the
  base instead (pianos, e-piano, guitars, mallets, basses, winds, brass, strings, drums, choirs), converted to the
  reface's four operators; pins colour them. Brightness, complexity, motion, envelope, register and play
  next to it; every change plays on the DX at once, **Apply** keeps it as one undo step. Every voice comes out about
  as loud as every other: it is measured with a probe engine tuned to the DX ([docs/SOUND.md](docs/SOUND.md)).
- **Following the DX:** FREQ, LEVEL, ALGO and FB moves on the DX light up in the editor; choosing a voice on
  the DX is followed (your edits are kept, with a button to send them back). Other edits on the DX send
  nothing: ↻ reads the voice again, and so does coming back to the window.
- **Store…** keeps the voice in one of the DX's 32 locations. The DX stores only from its own panel, so the
  editor guides you through STORE on the DX and then reads the location back to check.
- **Library:** the DX's 32 locations as last seen (**Read all 32**, about 7 s; click one to select it on the
  DX; export as a bank), and voices kept in this browser (keep, import and export `.syx`, search, rename). A
  click plays a voice on the DX; nothing is stored until you Store. **Store** always means the DX's memory,
  **Export** always means a `.syx` file. **DX7 voices:** importing a DX7 `.syx` (one voice or a 32-voice bank)
  opens a window with their names and converts them all to four operators in the background (a bank in under a
  minute; a voice you click goes first): click one to hear it on the DX, tick the ones you want, and they go into
  the library. **An imported DX7 voice is an approximation, not a copy.** The DX7 has six operators and 32
  algorithms, the reface four and 12, and its envelopes, feedback and pitch EG behave differently, so most voices
  lose something: a stack, a hammer's first click, a slowly opening brass swell. None will sound exactly as in
  Dexed or on a real DX7; listen before you keep one, and take it as a starting point to edit.
- **DX settings:** the DX's own settings (MIDI channels, MIDI Control, Local, master tune and transpose,
  tempo, pedal, speakers, auto power-off, contrast), live.
- **Keyboard:** three octaves to play the DX, soft at the top of a key and hard at the front, and a mod wheel.

## Also for the volca fm and volca fm2

Got a Korg volca fm or volca fm2 too? The **[volca fm generator](https://github.com/privatepublic-de/volca-fm-generator)**
([open it](https://privatepublic-de.github.io/volca-fm-generator/)) is this editor's Style wheel on six operators:
pin tonalities, shape them, hear the voice in the browser or on the volca, and export it as DX7 SysEx for Dexed,
a DX7 or anything DX7-compatible. Its 41 classic DX7 instruments are the ones Start from… offers here.

## Development

```sh
npm install
npm run dev          # the editor at http://localhost:5185 (?demo for the simulated DX)
npm run probe        # the Phase 0 protocol probe, /probe.html
npm test
npm run list-voices -- some.syx
```

Sound tools (the DX on the X18's inputs 1/2, `npx vite-node tools/<name>.ts`): `dxCurves.ts` measures the DX's
curves, `engineCurves.ts` puts the probe engine beside them, `voiceProbe.ts` plays whole voices on both.
`fromDx7.ts` converts the volca fm generator's DX7 instruments for Start from… (it needs that repository beside
this one); the converter itself (`src/dx7/`) also serves the import of DX7 voices.

The plan and its phases: [PLAN.md](PLAN.md). What the DX does over MIDI, as tested:
[docs/FINDINGS.md](docs/FINDINGS.md). The chrome (top bar, dialogs, knob gestures) follows the sibling
[editor for the ASM Hydrasynth](https://github.com/privatepublic-de/hydrasynth-editor).

Every push to `main` runs the tests, builds the editor and publishes `dist/` with GitHub Pages
(`.github/workflows/pages.yml`). Once per repository: Settings → Pages → Source: GitHub Actions. The build uses
relative paths (`base: './'`), so it works at any address.

## Privacy

Everything runs in your browser. No accounts, no cookies, no analytics or tracking, nothing loaded from other
sites; MIDI goes only between the browser and the DX. What the editor remembers (the MIDI ports, the library, the
Style settings) stays in your browser's storage. GitHub Pages, the host, logs your IP address when you open the
page. The full statement: [privacy.html](https://privatepublic-de.github.io/reface-dx-editor/privacy.html)
([source](public/privacy.html)).

## Credits

- **DX7 engine:** the DX7's tables, envelopes and algorithm routing, behind the DX7 import and the probe engine,
  follow [MSFA](https://github.com/google/music-synthesizer-for-android) (music-synthesizer-for-android, © Google,
  Apache License 2.0), the engine [Dexed](https://github.com/asb2m10/dexed) is built on.
- **Instruments:** classic DX7 voices by Yamaha (DX7 ROM and VRC cartridges, TX7, TX816, DX7II) and two pianos
  of unknown authorship from the cartridge collection that comes with Dexed, by way of the
  [volca fm generator](https://github.com/privatepublic-de/volca-fm-generator).
- **The DX:** Yamaha's reface Data List.
- **Type:** [Barlow](https://github.com/jpt/barlow) by Jeremy Tribby, SIL Open Font License.
- **Code:** [React](https://react.dev), [Zustand](https://github.com/pmndrs/zustand), [Vite](https://vite.dev),
  [Vitest](https://vitest.dev), [TypeScript](https://www.typescriptlang.org).

Details and licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Yamaha, reface and DX7 are trademarks of Yamaha Corporation; Korg and volca are trademarks of Korg Inc. This
editor is not affiliated with or endorsed by Yamaha or Korg.

[MIT License](LICENSE).
