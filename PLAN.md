# reface DX Web Editor: Plan

A browser-based WebMIDI editor for the Yamaha reface DX. The first version edits **the current Voice** (all 38 common and 4 × 28 operator parameters, including everything that sits behind Edit mode's small touch screen) and keeps a **library of Voices** in the browser and as `.syx` files.

Sources: *reface Data List* (MIDI data format and tables for the DX, pp. 6–10), *reface Owner's Manual* (DX panel, Function pages, Store, pp. 19–23, 40–43), *reface DX Reference Manual* (Edit mode pages, frequency ranges, KSC, EG, LFO, Pitch EG), *v1.30 Supplementary Manual* (Master Tune / Master Transpose pages, Quantize; nothing voice-related). Page numbers are the printed ones.

---

## 0. Prior art (read 2026-10-23)

Facts below are taken from these projects; **no code is copied** (most are GPL/AGPL, one has no license). They confirm the Data List in practice and answer part of §3.

| Project | What it is | What we learn |
|---|---|---|
| [mikatahara/RefaceDX](https://github.com/mikatahara/RefaceDX) (MIT, 2018–2024, code on `gh-pages`) | Plain JS + jQuery Web MIDI editor: one form per operator, a "sync" button, text-file save. No CC follow, no Save, no algorithm drawing. | Device number **0** works for Dump Request (`43 20 …`) and Parameter Change (`43 10 …`). Replies come back as **one Web MIDI message per block** with device byte `00`. Editing = one Parameter Change per control, unthrottled. |
| [christofmuc/MidiKraft-yamaha-refacedx](https://github.com/christofmuc/MidiKraft-yamaha-refacedx) (AGPL, KnobKraft Orm adapter) | Librarian | **Detects the synth with a SYSTEM Dump Request** (`00 00 00`), which gives TR/RV channel, Local and MIDI Control in one reply (warns when RV CH is omni). Bank read = **PC n + header Dump Request**, 32 times; a voice is sent as 7 blocks to the edit buffer. **No remote store**: it can send a voice, not write a location. Checksum includes the Model ID, as the Data List says. |
| [SpotlightKid/reface-dx-lib](https://github.com/SpotlightKid/reface-dx-lib) (GPL-3, Python/Qt) | Librarian with tags, Soundmondo download tool | Waits **100 ms between PC and Dump Request**. Also only sends voices to the edit buffer. |
| [copych/RDX-Reface-DX-emu](https://github.com/copych/RDX-Reface-DX-emu) (no license, ESP32 emulator; author never had a real DX) | Emulator that Soundmondo accepts | Ships a 32-voice factory dump: **32 × 241 = 7712 bytes, voices simply concatenated**. Candidate formulas for Q10: ratio = coarse 0 → 0.5 + fine × 0.005, else coarse + fine × 0.01; fixed = 10^(coarse >> 3) × 9.772^(fine/99) (both confirmed on the DX, FINDINGS Q10); detune ≈ 1.00034^(dt−64) (not visible on the DX). Its carrier table for the 12 algorithms is a cross-check only; the manual's chart is the source. |
| [Yamaha Synth Forum thread](https://yamahasynth.com/community/reface-1/system-exclusives-to-send-a-voice-to-the-dx-reface/) | Users sending voices by hand | 241 bytes per voice; a real header block is `F0 43 00 7F 1C 00 04 05 0E 0F 00 5E F7`. Yamaha's own answer: locations are only overwritten with **[STORE] on the panel**; VOICE RECALL restores a factory voice. |
| Patch Base (Coffeeshopped, commercial, macOS/iPad) | The only full editor/librarian | Has an "FM visualizer", copy/paste of envelopes and operators, a 32-voice bank editor and a randomizer. How it writes a bank isn't documented. Its synth-data repo has no reface entry. |

Consequences, used below: device number 0 is the default (any works, FINDINGS Q1); connect = SYSTEM request (FINDINGS Q11: it also gives the channels; Identity answers only with device byte `0n`); Read all = PC + request (reface-dx-lib waits 100 ms; FINDINGS Q8 shows no wait is needed); Save is the guided [STORE] flow unless Q3 finds something nobody else has; `.syx` = any number of 241-byte voices back to back.

---

## 1. Setup facts that shape the design

| Fact | Consequence |
|---|---|
| **Every voice and system parameter has a SysEx address** (Parameter Change, `F0 43 1n 7F 1C 05 aH aM aL dd F7`, 11 bytes). Control Changes exist only for the FM section's panel controls (Algorithm and per-operator Level, Feedback level/type, Freq mode, Coarse, Fine: 25 CCs) and only when **MIDI Control is on** (factory default: off). EGs, LFO, Pitch EG, KSC, velocity, AMD/PMD switches, effects, name, transpose, part mode, portamento and PB range are **SysEx only**. | Unlike the Nord Lead editor, the one write path for live editing is **Parameter Change SysEx**, coalesced per address (latest value wins), as `nrpnQueue` does in hydrasynth-editor. CCs are only *listened to* (panel moves in the FM section). |
| A Voice is **7 bulk blocks**: Bulk Header (`0E 0F 00`), Common (`30 00 00`, 38 bytes), Operator 1–4 (`31 0p 00`, 28 bytes each), Bulk Footer (`0F 0F 00`). A Dump Request to the Bulk Header address returns all of them. | Whole-voice send/receive = 7 messages, 241 bytes, ~77 ms over 5-pin DIN, ~18 ms over USB. Only for loading a Voice: a bulk **cuts sounding notes**, and a voice with missing blocks gets them reset to init values (FINDINGS Q7). |
| The voice map has **no location address** and the Data List documents **no store message**. A received voice bulk most likely lands in the **edit buffer** of the selected Voice. Saving into 1-1 … 4-8 is the panel's **[STORE]** (with name). | **Save can't be done by the editor alone** (confirmed 2026-10-23, FINDINGS Q2/Q3). Design: send the voice to the edit buffer, then a guided dialog "press STORE on the DX, choose 2-5, YES", then verify by Program Change away and back + dump request. |
| **Program Change 0–31** = Bank 1-1 … 4-8, no Bank Select. | Selecting a stored Voice is one message. Reading the 32 Voices = 32 × (PC + dump request); this **replaces the edit buffer**, so the reader warns when the DX has unstored edits; EDIT RECALL on the DX brings the last edit back afterwards (FINDINGS Q8). |
| Values are **plain 7-bit**, no nybblization in the voice data. Offsets: Transpose and PB range `28–58` (−24…+24, centre `40`), Pitch EG levels `10–70` (−48…+48), Detune `00–7F` (−64…+63). The 10-char ASCII name is `20–7E`. | A simple table-driven codec. Master Tune (SYSTEM) is the only 4-nybble value (−102.4…+102.3 cents in 0.1-cent steps); Tempo is 2 × 7 bits. |
| Bulk byte count = data size + 4 (Model ID + 3 address bytes). Checksum makes (Model ID + address + data + checksum) ≡ 0 mod 128. | Unit-tested from day one; fixtures from the real synth confirm it. |
| **The DX takes SysEx with any device number** and answers with `00` (FINDINGS Q1). The SYSTEM Dump Request answers in 3 ms. The Identity Request answers only as `F0 7E 0n 06 01 F7` (not the all-call `7F`), with byte 10 = `03`, probably firmware 1.30 (Q11). | Connect check = SYSTEM Dump Request, which also gives the channels, MIDI Control and Local; Identity (`0n`) adds the firmware version for the About dialog. No device-ID setting in the editor. |
| The DX sends **Active Sensing** every 200 ms and has a built-in **USB-MIDI** port plus 5-pin MIDI via the breakout cable. | Filter `FE` (and clock `F8`) at the transport, as in the siblings. Prefer USB; DIN works the same. |
| WebMIDI SysEx needs a secure context and a permission prompt. | Same as the siblings: `localhost` dev server and `start/` launchers, or GitHub Pages over https. Chrome or Edge. Fixed port **5185** (5179–5184 are taken by the siblings and their alternate configs). |

---

## 2. Protocol reference (what we'll implement)

Header bytes: `43` Yamaha, `7F 1C` group, `05` reface DX. The high nibble of the third byte says the message kind; the low nibble `n` is the device number (Q1).

| Message | Bytes |
|---|---|
| Parameter Change | `F0 43 1n 7F 1C 05 aH aM aL dd… F7` |
| Bulk Dump | `F0 43 0n 7F 1C bH bL 05 aH aM aL dd… ck F7` |
| Dump Request | `F0 43 2n 7F 1C 05 aH aM aL F7` |
| Parameter Request | `F0 43 3n 7F 1C 05 aH aM aL F7` |
| Identity Request / Reply | `F0 7E 0n 06 01 F7` (not `7F`) → `F0 7E 7F 06 02 43 00 41 53 06 vv 00 00 7F F7`, vv = `03` on this DX (version?) |

### 2.1 Address map

| Block | Address | Size | Bulk byte count |
|---|---|---|---|
| SYSTEM | `00 00 00` | 32 (15 used) | 36 (`00 24`) |
| Bulk Header | `0E 0F 00` | 0 | 4 |
| VOICE Common | `30 00 00` | 38 | 42 (`00 2A`) |
| VOICE Operator 1–4 | `31 0p 00`, p = 0–3 | 28 | 32 (`00 20`) |
| Bulk Footer | `0F 0F 00` | 0 | 4 |

**SYSTEM** (`00 00 xx`): 00 TR CH (0–15, `7F` off) · 01 RV CH (0–15, `10` all) · 02–05 Master Tune (4 nybbles) · 06 Local · 07 Master Transpose (`34–4C`) · 08–09 Tempo 30–300 · 0A Contrast · 0B Sustain pedal (FC3, FC4/5) · 0C Auto Power-Off · 0D Speaker · 0E MIDI Control · 0F–1F reserved.

**Common** (`30 00 xx`): 00–09 Name · 0A–0B reserved · 0C Transpose · 0D Part Mode (poly, mono-full, mono-legato) · 0E Portamento · 0F PB Range · 10 Algorithm (0–11) · 11 LFO Wave (sin, tri, saw up, saw down, square, S&H8, S&H) · 12 LFO Speed · 13 LFO Delay · 14 LFO PMD · 15–18 Pitch EG Rates 1–4 · 19–1C Pitch EG Levels 1–4 · 1D Effect 1 Type (thru, dist, t.wah, cho, fla, pha, dly, rev) · 1E–1F Effect 1 Param 1/2 · 20–22 Effect 2 Type/Param 1/2 · 23–25 reserved.

**Operator** (`31 op xx`): 00 On · 01–04 EG Rates · 05–08 EG Levels · 09 Rate Scaling · 0A/0B KSC L/R Depth · 0C/0D KSC L/R Curve (−lin, −exp, +exp, +lin) · 0E LFO AMD · 0F LFO PMD on · 10 Pitch EG on · 11 Velocity Sens · 12 Output Level · 13 Feedback Level · 14 Feedback Type (saw, square) · 15 Freq Mode (ratio, fixed) · 16 Coarse 0–31 · 17 Fine 0–99 · 18 Detune · 19–1B reserved.

Effect parameter labels depend on the type: Drive/Tone (dist), Sens/Rez (t.wah), Depth/Rate (cho, fla, pha), Depth/Time (dly, rev).

### 2.2 Control Change (receive channel; only with MIDI Control on)

| Parameter | OP1 | OP2 | OP3 | OP4 |
|---|---|---|---|---|
| Level | 85 | 102 | 108 | 114 |
| Feedback level | 86 | 103 | 109 | 115 |
| Feedback type (0–63 saw, 64–127 square; sends 0/127) | 87 | 104 | 110 | 116 |
| Freq mode (0–63 ratio, 64–127 fixed; sends 0/127) | 88 | 105 | 111 | 117 |
| Coarse 0–31 | 89 | 106 | 112 | 118 |
| Fine 0–99 | 90 | 107 | 113 | 119 |

Algorithm = CC 80; sent as 0, 12, 23, 35, 46, 58, 69, 81, 92, 104, 115, 127 and recognized in ranges (0–11 → 1, 12–21 → 2, …, 117–127 → 12). Also received: 1 mod wheel, 7 volume, 11 expression, 64 sustain; sent: 64 only.

---

## 3. Open questions (Phase 0, needs the synth)

| # | Question | Why it matters |
|---|---|---|
| Q1 | ~~Do other `n` work too?~~ **Answered 2026-10-23: all 16 work, replies carry `00`.** | Message builder. |
| Q2 | ~~Where does a voice bulk go?~~ **Answered 2026-10-23: into the voice being edited; a Program Change brings the stored voice back unchanged.** | **Save design:** guided STORE. |
| Q3 | Is there any way to store remotely? **STORE on the panel sends nothing (2026-10-23)**, so Save confirms by reading the location back. Remote store: none (Q2). | Whether Save can be one click or must be the guided panel flow. |
| Q4 | ~~Edited or stored voice?~~ **Answered 2026-10-23: the edited voice.** An Edit-mode change on the panel sends nothing (Q5, partly), so Resync = one dump request. | Resync after panel edits, and the library read. |
| Q5 | ~~Panel edits sent?~~ **Answered 2026-10-23: only FM-section moves, as CCs (FREQ sends mode + coarse + fine together), only with MIDI Control on; never SysEx.** | Live follow for the FM section, Resync for the rest. |
| Q6 | ~~Echo?~~ **Answered 2026-10-23: none.** | No echo suppression needed for our own sends. |
| Q7 | **Mostly answered 2026-10-23:** a lone block is ignored; a framed voice with missing blocks gets them **reset to init values**; 32 Parameter Changes back to back (2 ms) all land; Parameter Changes under held notes are clean, but a **whole-voice bulk cuts sounding notes**. | Coalescing unit and send rate; whether edits are fully live. |
| Q8 | ~~Read all?~~ **Answered 2026-10-23: ~7.3 s for 32; a dump request right after a PC is held until the Voice is loaded (~210 ms), so no wait is needed; the current edit is lost, EDIT RECALL brings it back.** | Library read UX and its warning. |
| Q9 | ~~Voice select?~~ **Answered 2026-10-23: one Program Change on TR CH, with MIDI Control on or off.** | Following panel Voice changes. |
| Q10 | ~~Frequency display?~~ **Answered 2026-10-23: ratio = coarse + fine/100 (coarse 0 = 0.5 + fine × 0.005); fixed = 10^(coarse ÷ 8) × 10^(fine/100); detune shown as raw − 64.** | Showing the same numbers as the DX's screen (`params/display.ts`, tested). |
| Q11 | **Answered 2026-10-23:** SYSTEM Dump Request and Identity (`0n` only) work; SYSTEM Parameter Changes (MIDI Control, Local) take effect at once. Byte 10 of the Identity Reply = `03`, probably firmware 1.30. | Settings tab and the "turn on MIDI Control" helper. |
| Q12 | **Partly 2026-10-23:** single 241-byte voice files and 32-voice banks parse. Soundmondo's old API is gone and a download from its UI wasn't found, so its files stay unverified; import accepts any number of 7-block voices. | Library import compatibility. |
| Q13 | ~~The 12 algorithm topologies?~~ **Answered 2026-10-23: all 12 as in `params/algorithms.ts`, pinned in a test against the reface DX algorithm chart.** | Algorithm view, "level = volume or mod depth", demo voices. |
| Q14 | ~~VOICE INIT?~~ **Answered 2026-10-23: read from the DX, now `initVoice()`, pinned in a test.** | New voice, and what a voice with missing blocks is completed with. |

Probe results go to `docs/FINDINGS.md` (date + firmware on each answer); raw `.syx` and logs go to `test/fixtures/`. They feed the codec tests and `?demo` mode.

---

## 4. Architecture

**Stack: the same as the siblings.** Vite 6, TypeScript, React 18, zustand, vitest, `@fontsource/barlow`, no backend. Code is **copied and adapted**, not shared as a package.

| Taken from | Used here for |
|---|---|
| `hydrasynth-editor/src/midi/` (transport, incoming, channel) | Port pick and persist, hot-plug, SysEx and CC in/out, Active Sensing filter |
| `hydrasynth-editor/src/sync/nrpnQueue.ts` | Coalesced Parameter Change sends (per address, latest wins, trailing send) |
| `hydrasynth-editor/src/app/controls/`, `Pads.tsx`, `ErrorBoundary`, dialogs, `probe.html` + `src/probe.ts` | Knobs, steppers, keyboard, probe page |
| `nord-lead-2-editor/src/sync/` (session, history), `src/library/`, `src/demo/` | Request-in-flight handling (one at a time, drop late replies), undo/redo, localStorage library, fake synth for `?demo` and tests |
| `start/` launchers, GitHub Pages workflow, `public/privacy.html` + its test | Running it offline and hosting it |

```
src/
  midi/        transport.ts, incoming.ts
  sysex/
    messages.ts   header bytes, kinds, device number, block framing, byte count, checksum, parser
    codec.ts      7-block Voice assembly/parsing, Voice <-> bytes, .syx files, voice diff/format
  params/
    common.ts     38 common params: offset, name, range, encoding (offset-64 etc.), labels
    operator.ts   28 operator params
    system.ts     SYSTEM params
    cc.ts         CC <-> param mapping, ALGO value ranges
    display.ts    ratio/fixed Hz, detune, signed values as the DX shows them (Q10)
    algorithms.ts the 12 topologies: carriers, modulators, connections, feedback
  sync/
    paramSender.ts  coalesced Parameter Changes
    session.ts      connect (identity), resync (dump request), echo suppression, CC follow
    history.ts      undo/redo
  library/      voiceStore.ts (browser), syxFile.ts, readAll.ts (32 × PC + request, with Stop)
  demo/         fakeRefaceDx.ts, factory voices from fixtures
  app/          App, store, ConnectionBar, VoicePanel, OperatorStrip, AlgorithmView, EgView, Library, Keyboard, controls/
test/           bulk/checksum, codec round trip, param tables, cc mapping, sender pacing, fixtures
```

### Connect
1. Open the port and send a SYSTEM Dump Request (as KnobKraft does): its reply is the presence check and gives TR/RV channel, MIDI Control and Local. Notes and Program Changes go to the RV channel; warn when RV CH is "All".
2. Send a Dump Request for the Bulk Header; decode the 7 blocks (one Web MIDI message each) into the store and draw the panel.
3. If MIDI Control is off, a note in the top bar offers to turn it on (one SYSTEM Parameter Change), so FM-section moves on the panel show up live.

### Edit and sync
- **Control in the editor** → store update → coalesced Parameter Change for that address. Name edits send the 10 name bytes.
- **CC from the synth** (FM section, MIDI Control on) → param update marked "from synth", not sent back. FREQ arrives as mode + coarse + fine CCs within ~2 ms: apply them as one change (one undo step).
- **Panel edits outside the FM section** send nothing (FINDINGS Q5), but the dump returns them (Q4): a **Resync** button, plus resync on window focus, re-reads the voice (~18 ms).
- **Program Change from the synth** → dump request for the new Voice, with a guard if the editor has unsaved edits ("the DX switched Voice; your edits are kept in the editor, Send to put them back").
- **Undo/redo, paste, any multi-value change** → the changed values as Parameter Changes (they don't cut notes; 32 back to back all land, FINDINGS Q7).
- **Load a voice** (library, import, Send) → whole 7-block bulk; it cuts sounding notes.

### Save and library
- **Save** (if Q3 finds no remote store): send the voice to the edit buffer → dialog: "On the DX press STORE, choose 1-1…4-8, edit the name if needed, press STORE and YES" → **Verify**: PC to the target (and back) + dump request, compare with what was sent.
- **Library** in the browser: any number of Voices with tags, plus a "DX memory" view of the 32 locations as last read. **Read all** = 32 × (PC + dump request, no wait) with progress and Stop (~7 s, FINDINGS Q8), then the originally selected Voice is selected again.
- **Write a bank** to the DX = 32 × guided Store, so it isn't offered in v1; a Voice from the library is opened (sent to the edit buffer) and stored by the user.
- `.syx` import/export of single Voices and 32-Voice sets in the DX's own 7-block format (Q12).

---

## 5. UI concept

- **Top bar:** port, connection state, firmware, Voice name and location (e.g. "2-5 E.PIANO 1"), Undo/Redo, Resync, Send, Save, ⋯ menu (import/export, settings, demo, help).
- **Algorithm view:** the 12 topologies drawn as operator boxes with arrows and each operator's own feedback loop (the reface's twist: every operator has feedback, saw or square). Carriers on the bottom row. Clicking an operator selects it; the box shows level, ratio/Hz and on/off. Algorithm picker as thumbnails.
- **Operator strips (4 side by side):** On, Freq mode, Coarse/Fine with the DX's ratio or Hz readout, Detune, Level, Feedback level + type, Velocity, AMD, PMD on, PEG on, Rate scaling, **KSC** as a small curve around the fixed C3 break point (L/R depth and curve).
- **EG editor per operator:** the 4-rate/4-level envelope drawn as a graph with draggable points (rates on X, levels on Y), as the DX's EG level/rate pages but all four at once; ghost lines for the other operators. Shape as the DX's chart draws it (FINDINGS Q13): from L4 at key-on, R1 → L1, R2 → L2, R3 → L3, hold at L3, R4 → L4 after key-off.
- **Common:** Pitch EG (graph, ±48 semitones), LFO (wave, speed, delay, PMD), Part mode, Portamento, Transpose, PB range, two Effect slots whose knob labels follow the type, Name.
- **Clipboard:** copy/paste an operator, an envelope, or the effects between operators and Voices (Patch Base has this; it is the most useful shortcut in 4-op FM).
- **Keyboard:** three octaves with velocity by click position, mod wheel and pitch bend strips, as in the siblings.
- **Library:** list with search, the 32-slot "DX memory" grid, click to audition (send to edit buffer), double-click to edit.
- **Settings tab (SYSTEM):** TR/RV channel, MIDI Control, Local, Master Tune/Transpose, Sustain pedal, Speaker, Auto Power-Off. Each change is one Parameter Change, so this is cheap to offer.

---

## 6. Phases

**Phase 0: probe (hardware needed).** Scaffold with the siblings' stack, `probe.html` with a port picker, raw SysEx/CC log, buttons for Identity, Voice dump request, SYSTEM dump request, Parameter Request for a chosen address, Parameter Change with editable address/value, partial-block send, "send this .syx", PC sweep over 0–31 with dump requests, a rate test, and Download log / received SysEx. Answer Q1–Q12 in `docs/FINDINGS.md`; save a dump of all 32 factory Voices as a fixture (our own capture; the emulator's 7712-byte dump has no license and is only used locally to try the parser early). **Probe built 2026-10-23** (with `messages.ts`, `codec.ts`, the param tables and 22 tests, which already round-trip that dump byte for byte); **first hardware session 2026-10-23: Q1–Q11 answered, Q12 partly. **Phase 0 done**; the 32-voice capture stays in `local/` (user's own voices, not committed)** (FINDINGS).

**Phase 1: codec and tables. Done 2026-10-23.** Voice addressing by Parameter Change address, validation for imports, SYSTEM encoders (Master Tune, Tempo), CC ↔ parameter mapping both ways, display formulas checked on the DX (Q10), algorithm topologies (`params/algorithms.ts`, all 12 confirmed, Q13), init voice (`params/init.ts`, read from the DX's VOICE INIT, Q14). `demo/fakeRefaceDx.ts` behaves as FINDINGS Q1–Q11 describe, with panel actions (select, FM knob, Edit-mode edit, STORE) for tests; `demo/demoVoices.ts` holds 8 voices written for this project. 108 tests. `?demo` gets wired up with the app shell in Phase 2.

**Phase 2: editing. Built 2026-10-23 against the fake DX; not yet tried on the hardware.** `sync/`: request queue (one in flight, late replies dropped), `ParamSender` (Parameter Changes coalesced per address at ~60 Hz), `History` (voice snapshots; undo/redo send only the difference, as Parameter Changes), `Session` (connect = SYSTEM + Identity + voice; Program Change and FM CCs from the DX followed, a FREQ step gathered into one change; notes and Program Changes on RV CH). `app/`: the shared chrome (wordmark, Resync/Undo/Redo, Help, connection button with Demo pill, per synth-editors/DESIGN-ui-consistency.md), the voice title (location menu, name on a "screen", Edited), the panel (algorithm drawn like the DX's chart with a 12-thumbnail picker; Voice, LFO, Pitch EG, Effects; four operator strips with the DX's frequency readout, Feedback as one bipolar saw/square knob like the DX's FB slider, draggable EG graph with the other operators as ghosts, LFO/PEG switches, keyboard scaling as on the DX's KSC-Level screen: a small graph with the break point at C3, then L Depth · L Curve · R Curve · R Depth with the depths −127…+127 and the curves LIN/EXP, the sign kept in the curve byte as the data has it), keyboard and mod wheel. **Init** (top bar) turns the voice into the DX's VOICE INIT as one undo step, as Parameter Changes; batches over 32 (Init, a far undo) go out in chunks of 32, 10 ms apart, in order. Feedback shows square and saw glyphs at its ends. Resync on returning to the window; a voice change on the DX keeps the dropped edits with a "Send back" button. 137 tests; checked in the browser in `?demo` (desktop and phone width).
  Tried on the DX 2026-10-23 (Peter): everything clicked through worked. Still to try: Init on the DX (up to ~150 Parameter Changes in paced chunks; the DX has been tested with 32 at once).
  First list of checks: knob drags (send rate, no stuck values), FREQ/LEVEL/ALGO/FB on the DX lighting up here, a voice chosen on the DX, Resync after Edit-mode changes, the MIDI Control checkbox, Undo under held notes.
  Look (Peter, 2026-10-23): the interface reflects the DX7's metallic brown panel (dark warm browns with a brushed sheen); the signature colour is a light bronze `#c9a07a` from the same family (wordmark and the favicon's FM wave, on the shared dark tile). The screens (name, frequencies, algorithm, envelopes) look like the reface DX's inverse LCD: white graphics on black with a blue backlight shimmer. Layout: algorithm, voice, LFO and pitch EG in a column as tall as the operator strips, the effects in a row under both; below 1500 px the column becomes a row along the top, below 1040 px the operators go 2 × 2, on a phone one by one.

**Phase 3: Store and library. Built 2026-10-23; tried on the DX the same day (Peter): worked as expected.** **Store…** (top bar) guides the DX's own STORE (Q2, Q3): choose the location (what it holds now is shown when known), everything waiting goes out, the DX's steps are listed, then **Check** selects another location and the chosen one again, reads it, and compares everything but the name (a name given on the DX's Store Name screen comes over as one undo step). If it doesn't match, the editor's voice is sent back into the DX and nothing is lost. **On the DX**: the 32 locations as last seen, learnt from every read after a Program Change, a Store or **Read all 32** (PC + request each, ~7 s, Stop; the editor's edits are sent back after, Q8); click one to select it; Export bank once all 32 are known (7712 bytes). **In this browser**: voices kept (this voice, the DX's memory, imported .syx files; duplicates skipped, out-of-range values flagged), search, rename (10 characters), export one/shown/all, delete with a second click; a click plays a voice on the DX (the whole voice, one undo step, Edited until stored). In localStorage (`reface-dx-editor.library`); the demo has its own (`…library.demo`), so its pretend DX never touches the real picture. 151 tests.

**Phase 4: polish and release. Done 2026-10-23 except publishing (the repository isn't on GitHub yet).** **DX settings** dialog (⚙ in the top bar): every SYSTEM value live (RV/TR CH, MIDI Control, Local, Master tune in Hz as the DX shows it, Master transpose, Tempo, Sustain pedal, Speakers, Auto power-off, LCD contrast), read again on opening. README with a screenshot of the demo, Help/About with the Controls text and a Privacy link, `public/privacy.html` (a test checks it names every storage key), an error boundary that offers the voice as a .syx before reloading, MIT LICENSE, `start/` launchers, `.github/workflows/pages.yml`. 153 tests.

**Phase 5: linked envelopes. Built 2026-10-23 against the fake DX** (§7.1): `params/envelope.ts` (same-role operators, rates by delta, levels by ratio, from the drag's start), `setEgValue` in the store, a **Link carriers / Link modulators** toggle in every operator's EG heading, Alt/Option for one edit, the following knobs light up. EG graph drags now count from where the point was grabbed (no jump when grabbed off-centre). 161 tests.

**Phase 6: style-based Init, Adjust and Randomize (planned 2026-10-23, decisions by Peter the same day).** See §7.2.

**Later, not in this plan:** DX7 (6-op) voice import with a lossy 4-op conversion, Looper control (MIDI only exposes clock and tempo).

---

## 7. Linked envelopes and styles

### 7.1 Linked envelopes (Phase 5)

One drag changes the same envelope stage in several operators.

| Decision | |
|---|---|
| Trigger | A sticky **Link** toggle in the EG area, and **Alt/Option** held while dragging for a one-off. Not Shift: Shift is "fine drag" on every knob in all the sibling editors. |
| Scaling | **Rates move by the same delta** (a DX rate already maps to time on a curve, so +10 is "all a bit faster"). **Levels scale by the same ratio** (OP1 L2 90 → 60 sets every other L2 to ⅔ of its value), so the balance between operators stays. A level dragged from 0 has no ratio: the others then follow by the delta. |
| Which operators | **Same role**: carriers follow carriers (loudness), modulators follow modulators (timbre), by the current algorithm (`params/algorithms.ts`). |
| Controls | The EG graph points and the R1–R4 / L1–L4 knobs. Not the Pitch EG. |

- **From a snapshot.** A drag computes every linked value from the voice as it was when the drag began, not step by step: an operator that hits 0 or 127 clamps on its own, and dragging back restores all of them exactly. Wheel and arrow keys (no drag) link one step at a time from the current values.
- **One undo step** per drag (the existing history gesture). The linked values go out as Parameter Changes, coalesced per parameter as now.
- **Seen:** while linked, the following operators' EG graphs and knobs light up as panel moves do.
- **Code:** `params/envelope.ts`, pure: `linkedEgChanges(start, algorithm, op, kind, stage, value) → changes`, plus the transforms Phase 6 reuses (`scaleTimes`, `scaleLevels`). The store keeps the voice at gesture start; `Knob` and `EgGraph` report Alt with the gesture. Tests: deltas, ratios, the zero case, clamping and return, same-role selection for all 12 algorithms.

### 7.2 Styles: Init, Adjust, Randomize (Phase 6)

**Init ▾** in the top bar becomes a popover: the style choices, then **Init**, **Adjust** and **Randomize**. Each action is one undo step, sent as Parameter Changes (paced batches), so sounding notes keep sounding.

**The choices, by axis:**

| Axis | Kind | Values |
|---|---|---|
| Family | pick one (or none) | bass, organ, strings, plucked string, bell / mallet, e-piano / keys, brass, lead, percussion |
| Character | combinable, each with an amount | analogue, classic FM, metallic, hollow, noisy, gritty |
| Brightness | slider | mellow ↔ bright |
| Treble | slider | the high register: tamer ↔ brighter up the keyboard (keyboard scaling and rate scaling) |
| Envelope shape | pick one | pluck, struck (keyboard), bowed, pad, reverse, organ / gate, brass swell, atmo (= pad + long + hall) |
| Envelope modifiers | sliders | length (short ↔ long), evolving, expressive |
| Space | pick one, or **keep my effects** | dry, ensemble, room, hall, echo |

**What each does on the DX (sound design):**

- **Families** set the skeleton: algorithm, ratios, which operators are timbre and which loudness.

  | Family | Algorithm and ratios (starting points) |
  |---|---|
  | bass | 1 or 3: a stack, carrier 0.5–1, modulators 1–2, some feedback |
  | organ | 12 (or 9–11): carriers at drawbar ratios 0.5, 1, 2, 3 (4, 6), level as the drawbars |
  | strings | 6–8 or 12: two detuned carriers with soft modulators at 1–2, slow modulator attack |
  | plucked string | 1 or 2: modulator at 1–3 with a fast decay, rate scaling up |
  | bell / mallet | 8: pairs at inharmonic ratios (1 : 3.5, 1 : 1.41, 2 : 7), long decay; mallet: short |
  | e-piano / keys | 8: a 1 : 1 pair for the body, a high-ratio (14) fast-decaying pair for the tine |
  | brass | 1 or 5: modulator at 1, modulator EG slightly slower than the carrier's, a small pitch EG blip |
  | lead | 1 or 2, mono with portamento, saw feedback, vibrato after a delay |
  | percussion | fixed-frequency modulators, very fast envelopes, noisy feedback |

- **Characters** reshape the spectrum: **analogue** saw or square feedback on carriers, whole-number ratios, slight detune, chorus; **classic FM** high modulation depth, contrasting ratios, velocity on modulators; **metallic** pulls ratios off whole numbers; **hollow** odd harmonics (ratios like 1 : 2, 1 : 3, square feedback); **noisy** fixed-frequency modulators, a lot of feedback, S&H LFO; **gritty** distortion, square feedback, a little inharmonicity. "harsh" is the bright end with gritty.
- **Brightness** scales the modulators' levels (and their velocity); **treble** sets keyboard scaling (right side) and rate scaling on the modulators.
- **Shapes** set the envelopes per role: carriers the loudness, modulators the timbre (usually a bit faster or shorter, for an opening and closing "filter"). Reverse: slow R1 to L1, then R2 instant to L2 = 0.
- **Modifiers:** length scales all times (`scaleTimes`); evolving gives the operators different slow rates and stage levels and a slow AMD; expressive sets velocity on modulators and carriers and rate scaling.
- **Effects:** slot 1 comes from the character (gritty → distortion, analogue → chorus, hollow → phaser), slot 2 from the space (ensemble → chorus, room / hall → reverb, echo → delay). Both stay as they are with **keep my effects**.

**The three actions:**

- **Init:** the family's template, then character, brightness, treble, shape, modifiers and space, with a little randomness inside the style. **Roll again** gives another variation. The name comes from the style, in 10 characters ("Mellow Bass", "Hollow Pad").
- **Adjust:** the same transforms on the current voice, by an **amount**; each click applies it once (clicking again goes further). Without a family, the voice keeps its algorithm and ratios.
- **Randomize:** **within the style** (Init with wider randomness) or **mutate the current voice by N %** (small random changes that respect the roles; the algorithm only changes from about 50 %).

**Code:** `style/` with pure functions `(voice, choices, random) → voice`: `templates.ts` (families), `transforms.ts` (characters, brightness, treble, shapes, modifiers, effects; using `params/envelope.ts`), `random.ts` (a seeded generator, so tests are exact and Roll again is a new seed), `name.ts`. The store gets one `applyVoice(voice, label)` (the difference as Parameter Changes, one undo step), and the popover `StyleMenu.tsx` replaces the Init button. Tests: every result is a valid voice (`voiceProblems` empty, at least one carrier audible), the name fits 10 characters, the same seed gives the same voice, amount 0 and mutate 0 % change nothing, keep my effects keeps both slots.
- **On the DX:** the templates are starting points to tune by ear: a listening session per family and shape, as with the demo voices.
