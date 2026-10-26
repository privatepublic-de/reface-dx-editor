# reface DX Editor

A voice editor and librarian for the Yamaha reface DX in the browser, over Web MIDI. Every parameter on one
screen, including everything behind the DX's Edit mode: the algorithm as the DX draws it, four operators with
their envelopes and keyboard scaling, LFO, pitch EG and effects.

![The editor in demo mode: the algorithm, voice, LFO and pitch EG on the left, the four operators side by side
with their frequency, envelope and keyboard-scaling screens, the effects below](docs/screenshot.png)

## How it was made

This editor is vibe-coded with [Claude](https://claude.com/claude-code) by Anthropic: Peter Witzel designed
it and tested it on the DX, Claude wrote the code. Every commit says so in a `Co-Authored-By: Claude` line.
What it knows about the DX's MIDI comes from Yamaha's reface Data List, corrected by tests on a reface DX:
[docs/FINDINGS.md](docs/FINDINGS.md).

## Running it

Double-click `start/start-macos.command` (or `start/start-windows.bat`, `start/start.sh`). It installs, builds
and opens http://localhost:5185. You need [Node.js](https://nodejs.org). Add `?demo` to the address to try it
with a simulated DX.

Use Chrome or Edge (Web MIDI with SysEx; Safari has none), allow MIDI access, click Connect. Everything runs
in the browser, see the [privacy statement](public/privacy.html). `.github/workflows/pages.yml` publishes it
with GitHub Pages once the repository is on GitHub.

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
  others come in as a voice of their own or colour it. Brightness, complexity, motion, envelope, register and play
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
  **Export** always means a `.syx` file.
- **DX settings:** the DX's own settings (MIDI channels, MIDI Control, Local, master tune and transpose,
  tempo, pedal, speakers, auto power-off, contrast), live.
- **Keyboard:** three octaves to play the DX, soft at the top of a key and hard at the front, and a mod wheel.

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

The plan and its phases: [PLAN.md](PLAN.md). What the DX does over MIDI, as tested:
[docs/FINDINGS.md](docs/FINDINGS.md). The chrome (top bar, dialogs, knob gestures) follows the sibling editors
for the ASM Hydrasynth, Expert Sleepers disting EX, MFB Dominion 1 and Clavia Nord Lead 2X.

Yamaha and reface are trademarks of Yamaha Corporation. This editor is not affiliated with or endorsed by
Yamaha.

MIT License.
