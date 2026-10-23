# Phase 0 findings: reface DX over MIDI

Answers to the open questions Q1–Q12 in [PLAN.md §3](../PLAN.md). Each answer comes from `probe.html` against the real synth. Put the date and firmware version on each one. Save logs and `.syx` captures in `test/fixtures/`.

## Setup

First hardware session: 2026-10-23.

- reface DX firmware: probably 1.30 (Identity Reply byte 10 = `03`, see Q11)
- Connection: ? (replies within 3–19 ms, so most likely USB)
- TR CH 16 · RV CH 16 · MIDI Control on · Local on · Speaker off · Master tune 0.0 · Master transpose 0 · Tempo 120 (from Read SYSTEM)
- Browser: ?

## Run order

Run `npm run probe` (or `start/start-macos.command`, then open `/probe.html`). Click **Connect** and pick the ports. Set **MIDI ch** to the DX's RV CH and **Voice on the DX** to the Voice it's on.

1. **Link test**, then play a key on the DX: a note line in the log means both directions work.
2. **Read SYSTEM** first: it sets MIDI ch to the DX's RV CH. **Identity request** (Q11; the DX answers device byte 00, not 7F). **Read voice**. Save this first voice as a fixture.
3. **Device no. sweep** (Q1).
4. **Parameter request** for `30 00 10`, `31 00 12`, `00 00 0e`: what form does the answer take?
5. **Listen** (Q5) with MIDI Control off: turn an FM-section knob, then change an EG rate in Edit mode, then an effect. Then **MIDI Control on** and repeat. Then **Read voice**: the read lists the panel edits if the dump returns the edited voice (Q4).
6. **Listen** (Q9): select another Voice on the DX. Set "Voice on the DX" back afterwards if needed.
7. **Partial sends** (Q7): the three block tests, then **32 Parameter Changes** at 5 ms, 1 ms and 0 ms. Then the four hold-note tests (listen).
8. **Voice send** (Q2, Q6) on a Voice you could lose: **Send marked voice** (does the DX's screen show PROBE?), **PC away and back, read**, then **Send the original back**.
9. **Listen** (Q3) while doing STORE on the DX to the Voice's own location (no change to the sound).
10. **Read all 32** (Q8), timing per voice. First make an edit on the DX without storing it; afterwards try FUNCTION → Job → EDIT RECALL.
11. **Frequency display** (Q10): step through, open OP1 in Edit mode on the DX and type what the screen shows for each step, Log.
12. **Files** (Q12): open a Soundmondo download and a bank file; send one voice.

Finally, **Download received SysEx** and **Download log** into `test/fixtures/`.

## Other observations

- **Parameter Request** answers with a **Parameter Change** (`F0 43 10 7F 1C 05 aH aM aL dd F7`) in 3 ms: `30 00 10` → algorithm raw 10 = ALGO 11 (2026-10-23).
- **Voice dump timing:** the 7 blocks arrive 13–19 ms after the request, each as its own Web MIDI message, all checksums good.

## Results

| # | Question | Result |
|---|---|---|
| Q1 | Device numbers accepted, device byte in replies | **Any device number works; replies always carry 0** (2026-10-23). A voice dump request with device no. 0–15 (`F0 43 2n …`) got the same voice "Softouch" every time, and every reply block had device byte `00`. So the DX listens omni for SysEx. The editor sends `n` = 0 and accepts any `n` in replies. |
| Q2 | Where a received voice bulk lands | **Into the voice being edited only; the stored location is untouched** (2026-10-23). The probe selected 1-6 ("Inchoiry"), read it, and sent a marked copy (name PROBE 01, Transpose +1, OP1 Detune +16): the read-back was exactly the mark, and **the DX's screen showed the name PROBE 01**. After PC 1-5 and back to 1-6, the DX had "Inchoiry" again, unchanged. So sending a voice never writes memory, and **Save = the guided STORE on the panel**, confirmed by PC away and back + read. (Earlier try on 2026-10-23 went back to the wrong location; superseded by this one.) |
| Q3 | Remote store; what STORE on the panel sends | **STORE on the panel sends nothing** (2026-10-23: a Listen with MIDI Control on, STORE to the Voice's own location, heard nothing). So the editor can't see a store happen; it confirms one by reading the location back. Remote store: none; a voice bulk only ever reaches the edit buffer (Q2). |
| Q4 | Dump request returns the edited or the stored voice | **The edited voice** (2026-10-23). Read "Softouch", changed OP1 EG rate 1 in Edit mode on the DX, read again: the dump listed `OP1 EG rate 1: 92 → 0` and nothing else. So Resync = one dump request, and Read all must count on losing an unstored edit (Q8). |
| Q5 | Parameter Change SysEx / CCs sent for panel edits; MIDI Control gating | **Only the FM section sends anything, as CCs, and only with MIDI Control on; the DX never sends Parameter Change SysEx** (2026-10-23, on TR CH 16). MIDI Control on: OP3 FREQ sent **all three CCs per step**, mode + coarse + fine (111/112/113: 0/1/1 → 0/0/96 → 0/0/0, about 30 ms apart); OP3 LEVEL sent CC 108 per step (89, 55, 33). An Edit-mode EG rate change and an effect change sent nothing (the EG change showed up in the next dump, Q4). MIDI Control off: the FM knobs sent nothing either. So: the editor follows FM-section moves live from CCs (treating a mode/coarse/fine triple as one change) and everything else by Resync. ALGO (2026-10-23): CC 80 with exactly the documented values, 127, 115, 104 … 12, 0 for algorithms 12 … 1. FB not turned yet. |
| Q6 | Echo of received messages | **No echo** (2026-10-23): 32 Parameter Changes, 4 held-note runs and 10 whole-voice sends brought nothing back on MIDI OUT (only the requested replies, and the notes played on the DX's keys). |
| Q7 | Partial blocks; Parameter Change rate; clicks under held notes | **Always send all 7 blocks; edit live with Parameter Changes** (2026-10-23, voice "Softouch"). **Common block alone** and **OP3 block alone** (no header/footer): ignored, the voice unchanged. **Header + Common + footer**: the Common landed (Portamento 0 → 42), but **all 4 operators were reset to defaults** (EG rates 127/127/–/100, EG levels 2–3 127, Output level 100, ratio 1.00, LFO PMD on, KSC curves −lin/+lin, velocity 0, feedback 0/saw…). So a framed voice with missing blocks is completed from the init voice: never send a partial voice. **Rate:** 32 Parameter Changes all landed 5 ms apart (198 ms), 1 ms apart (147 ms) and back to back (2 ms over USB), so no pacing is needed on USB. **Held notes** (A3 from the probe plus a chord on the keys): stepping algorithms 1–12, toggling OP2 on/off and stepping Effect 1 types gave **no dropouts or clicks**; **resending the whole voice (7 blocks) stopped the sounding notes**. So: knob edits, undo/redo and paste go out as Parameter Changes; a whole-voice bulk only when loading a Voice. |
| Q8 | Read all: timing, lost edit, EDIT RECALL | **Works, ~8 s for 32; the edit is lost but EDIT RECALL brings it back** (2026-10-23). PC n, 100 ms, dump request, for 1-1 … 4-8: all 32 answered, 7.9 s in all. After a Program Change the dump takes **109–232 ms** (mostly ~130 ms) instead of the usual ~18 ms: the DX is still loading the Voice. An unstored edit made before the run was gone afterwards, and FUNCTION → Job → EDIT RECALL restored it. So Read all warns about unstored edits and points to EDIT RECALL. **No wait is needed:** with the dump request sent right after the PC (0 ms), every request got the new Voice (same 32 names in order), after 184–318 ms (mostly ~210 ms); 7.3 s in all. The DX holds the request until the Voice is loaded. |
| Q9 | What the DX sends on Voice select | **A Program Change 0–31 on TR CH, nothing else** (2026-10-23): 1-2 → PC 1, 1-3 → PC 2, 1-1 → PC 0 on ch 16. No Bank Select, no dump. Sent with MIDI Control on **and off**. The editor follows it with a dump request. |
| Q10 | Coarse/fine → ratio / fixed Hz, detune → cents | **Formulas confirmed, all 53 readings match** (2026-10-23, OP1 via Parameter Change, read off the Edit-mode screen). **Ratio:** coarse 0 → 0.5 + fine × 0.005 (0.500–0.995, shown with 3 decimals), else coarse + fine / 100 (1.00–31.99, 2 decimals). **Fixed:** 10^(coarse ÷ 8, rounded down) × 10^(fine / 100): coarse 0–7 = 1.000–9.772 Hz, 8–15 = 10.00–97.72, 16–23 = 100.0–977.2, 24–31 = 1000–9772 (4 significant digits). So 8 coarse values share each decade: coarse 0 and 7 sound the same. (The DX7-style "coarse & 3" guess was wrong.) **Detune:** shown as the raw value − 64 (−64…+63), no unit; its pitch effect in cents isn't on the screen. The readings are tests in `test/display.spec.ts`. |
| Q11 | Firmware version; SYSTEM dump; SYSTEM Parameter Changes live | **SYSTEM dump works. The Identity Request works only with device byte `0n`, not with the all-call `7F`** (2026-10-23). `F0 7E 7F 06 01 F7` was ignored 4 times; `F0 7E 00 06 01 F7` got, in 4 ms, `F0 7E 7F 06 02 43 00 41 53 06 03 00 00 7F F7`. That is the Data List's reply except **byte 10 = `03` instead of `00`**: most likely the firmware version (1.30, the current one with Master Tune and Quantize; the Data List is from 1.00). To confirm: the version the DX shows on its screen. `F0 43 20 7F 1C 05 00 00 00 F7` answered in 3 ms with one 32-byte block: TR/RV CH, Local, MIDI Control, Master tune, Tempo etc. decode as documented. **MIDI Control off took effect at once** (set with the probe's button; the FM knobs went silent right after it). **Local on/off took effect at once too** (2026-10-23). So the editor's Settings tab can change SYSTEM values live with Parameter Changes. |
| Q12 | Soundmondo / bank file format | **Partly** (2026-10-23). Single-voice files of 241 bytes (33 from the RDX emulator repo) and a 32-voice bank of 7712 bytes (32 voices back to back) parse with no problems and all values in range. Soundmondo itself: its old JSON API (`/api/v1/voices/<id>/`, used by reface-dx-lib) now returns only the web app's HTML, and downloading a voice through its web UI wasn't found. Soundmondo sends voices straight to the DX over Web MIDI, so its format is the DX's own bulk. Not verified: a file saved from Soundmondo. |
