# How the reface DX sounds, measured

Recorded from the DX's line out (X18 inputs 1/2, 48 kHz) by `tools/dxCurves.ts` and `tools/styleProbe.ts`, 2026-10-23.
The style templates (`src/style/`) are tuned to these curves. Re-run the tools after changing them.

## Envelope rates

OP1 alone, a sine, C4. **Attack** is R1 from L4 0 to L1 127, time to 90 %. **Decay** is R2 from L1 127 to L2 0.

| Rate | Attack (to 90 %) | Decay to −20 dB | Decay to −40 dB |
| ---: | ---: | ---: | ---: |
| 10 | 5.2 s | > 8 s | > 8 s |
| 20 | 4.9 s | > 8 s | > 8 s |
| 30 | 2.4 s | 6.7 s | > 8 s |
| 40 | 1.3 s | 3.4 s | 3.9 s |
| 50 | 0.63 s | 1.7 s | 3.3 s |
| 60 | 0.31 s | 0.84 s | 1.4 s |
| 70 | 0.14 s | 0.42 s | 0.78 s |
| 80 | 42 ms | 0.18 s | 0.34 s |
| 90 | 32 ms | 82 ms | 0.15 s |
| 100–120 | ~30 ms (the floor) | ≤ 36 ms | ≤ 0.22 s |

Between 40 and 90, the time roughly **halves for every +10**. Rates above 80 are effectively instant for an attack.
A ±15 change in rate makes a time about 3× longer or shorter.

## Modulator level (depth)

OP2 modulates OP1 at 1 : 1 (algorithm 1, OP3/4 off), C3. The harmonics are given relative to the fundamental (H1).

| OP2 level | H2 | H3 | H4 | H5 |
| ---: | ---: | ---: | ---: | ---: |
| 40 | −17 dB | −39 | −66 | −82 |
| 60 | −8 | −23 | −42 | −64 |
| 70 | −2.5 | −16 | −28 | −37 |
| 80 | +12 | +3 | −6 | −20 |
| 90 | +3 | −3 | −7 | −17 |
| 100 | −6 | −16 | −3 | −11 |
| 110+ | the spectrum spreads out: H3 to H5 match the fundamental |

The curve is steep. A level of about 50 adds a touch, 65 adds it clearly, 75 is strong, and from 80 the harmonics outgrow the fundamental.
That's why the brightness and character steps are small (±15–20 levels).

## Style probe

`npx vite-node tools/styleProbe.ts [families brightness characters shapes length]` plays each style and measures it:

- the peak level
- attack, the level at 0.5 s and 100 ms before note-off, and the release
- the spectral centroid 20–220 ms after onset, in harmonics
- periodicity, as the autocorrelation over a few cycles
- even against odd harmonics

It then checks what each style promises. Shapes are measured on brass, which has one carrier and no detune, so detune beating doesn't pass as envelope movement. Result on 2026-10-23: **46/46** with the first set; **41/41** after the trim below.

| Check | Measured |
| --- | --- |
| All families, brightness steps, characters, shapes, lengths audible, not clipping | −24 … −13 dBFS |
| Brightness raises the centroid: bass −1/0/+1 | 1.04 < 1.19 < 1.88 H |
| Metallic, noisy less periodic than plain bass | 0.90, 0.87 < 1.00 |
| Hollow: fewer even harmonics | −0.4 against 9.8 dB |
| Analogue, classic FM, gritty brighter than plain | 1.98, 1.36, 1.43 > 1.24 H |
| Pluck decays, pad holds (at note-off) | −35 against −2 dB |
| Pad attack against gate | 1.2 s against 30 ms |
| Gate holds to note-off | −0.2 dB |
| Reverse swells, then stops | 0.8 s, −47 dB |
| Keyboard (struck) decays while held | −11 dB at 1.4 s |
| Long pluck against short at 0.5 s | −6 against −48 dB |

The first tuning (from feel, before measuring) failed these:

- **The length −1 pluck was nearly silent.** Its rates were too fast.
- **Brightness barely changed the sound.** The modulators decayed before the measurement window.
- **Classic FM wasn't brighter.** Its velocity sensitivity took back the added depth at velocity 100, so it now adds +20 levels.

The fix was the curves above. Still to do: tune by ear. These numbers say each style moves in the right direction, not that it sounds good.

## How different the options are (`tools/styleCompare.ts`)

Each take gets a fingerprint:

- loudness in 7 time windows
- the spectrum in third-octave bands, 20–220 ms and 0.8–1.2 s after the onset

A distance is the mean dB difference between two fingerprints, for the spectrum and for the loudness over time. The yardstick is **Another**: the same family with another seed differs by **1–6 dB** in spectrum. An option that moves less than that can't be told apart from a reroll.

### First run: the original set (6 characters, 8 shapes)

| Option | Measured | Verdict |
| --- | --- | --- |
| Strings against brass | 4.2 dB | too close |
| Brightness ±1 | 0.1–4.6 dB; organ 0.1 (algorithm 12 has no modulators) | below the yardstick |
| Classic FM against plain | 2.6–7.4 dB | too small |
| Gritty | mostly the distortion effect | an effect, not a character |
| Noisy | level −10 … −18 dB (S&H amplitude LFO) | level drop |
| Bowed against Swell | 1.3–2.4 dB | duplicate |
| Pad against Atmo | 2.8–3.7 dB | duplicate |
| Evolving | brass 0.75 dB per 100 ms, organ 0 | too weak |
| Expressive | 16–19 dB louder at velocity 120 than 40, brightness barely following | loudness only |
| Treble ±1 | nothing below C3; brass at C5 went from 1.0 to 6.2 harmonics | one-sided, too strong |

### What changed

- **FM noise is a tenth family.** Every operator modulates OP1, two of them at fixed frequencies, with square feedback near the top.
- **Characters:**
  - Classic FM went into **Expressive**.
  - Gritty became **Drive**, in More.
  - Noisy no longer has the amplitude LFO.
  - Analogue (saw feedback, quieter modulators) and Hollow (square feedback, modulators at 2:1) are pushed apart.
- **Shapes:** Swell is now only the brass family's own envelope, and Atmo is gone (Pad, long Length and Hall make it).
- **Families:**
  - The strings are two detuned saws.
  - The brass is brighter.
  - The e-piano's body and tine have real depth.
- **Brightness** moves the modulators by +22/−38, scales the feedback, and moves the carriers' feedback too. On algorithm 12 it acts on the upper carriers, like drawbars.
- **Evolving** has slower drifting modulator stages and a triangle LFO on the modulators' amplitude. On the organ it acts on the upper carriers.
- **Expressive** puts velocity on the modulators (deeper) and 45–60 on the carriers.
- **Treble** uses linear keyboard scaling on both sides of C3, depth 30 on the left and 40 on the right.

### After

| Option | Measured |
| --- | --- |
| Families, every pair | ≥ 6.9 dB; FM noise ≥ 19 dB from all |
| Strings against brass | 11.7 dB |
| Characters against plain (bass, brass, e-piano) | 7.5–22 dB; Drive 11–14 dB |
| Characters pairwise | ≥ 4.7 dB (brass analogue against noisy is the closest) |
| Shapes pairwise | brass ≥ 5.0 dB; e-piano ≥ 2.6 dB in spectrum, 5–19 dB in envelope |
| Brightness +1 | 5.5–15.6 dB |
| Brightness −1 | brass 10.5, strings 20, noise 19 dB; bass 4.7, pluck 3.0, e-piano 3.4 |
| Evolving | brass 0.16 → 1.1 dB per 100 ms; organ 0.2 → 0.9 dB, with a 7 dB level swing |
| Expressive, velocity 40 against 120 | +12–16 dB, and brightness 1.0 → 2.7 harmonics on the e-piano |
| Treble +1 | e-piano: 1.01 at C1 and 2.92 at C5 (flat 1.08–1.11 at 0) |

Brightness −1 is still small on bass, pluck and e-piano. They're close to a sine at 0, so there's little left to take away.

### FM noise, noisier (`tools/noiseProbe.ts`)

Spectral flatness is the geometric mean of the power spectrum over its arithmetic mean, from 200 Hz to 12 kHz. 1 is white noise; near 0 means a few clear partials.

| | C1 | C3 | C5 |
| --- | ---: | ---: | ---: |
| First FM noise | 0.50 | 0.59 | 0.79 |
| Now: every level and square feedback near the top, OP2–OP4 at fixed frequencies | 0.87 | 0.86 | 0.86 |

The noise is now the same all over the keyboard. Brightness +1 has nothing left to add (1.4 dB), but −1 takes the modulators down and brings back some pitch (12.9 dB).

### Wind, Glassy, and Colour + Space

| Addition | Measured |
| --- | --- |
| **Wind** family: breath at the start (a fixed-frequency noise modulator that dies away), a reedy body, delayed vibrato | ≥ 9.6 dB from every other family (brass is the closest); reroll 2.7 dB |
| **Glassy** character: a 7 : 1 or 14 : 1 modulator at level 90+, ringing for ~0.6 s over the start | bass 5.2, brass 6.9, e-piano 2.6 dB from plain (the e-piano already has its tine). At level 72–84 and ~0.3 s it measured only 1.7–3.9 dB |
| **Colour** (effect slot 1): drive, wah, chorus, flanger, phaser | drive 11 dB; wah 4 dB in spectrum and 9–15 dB in the envelope |
| Chorus, flanger, phaser | barely change the averaged spectrum (2–4 dB) but move it: 1.2–1.7 dB per 100 ms on a held organ note, against 0.26 clean |
| **Space** (slot 2) | dry, room, hall, echo; Ensemble is now Chorus under Colour |

With no colour chosen, the characters bring one: analogue chorus, hollow phaser, noisy wah. The style probe passes 21/21 for families and characters.

## The probe engine (PLAN §8, step 1)

`src/engine/` plays a reface DX voice offline (four operators, the 12 algorithms, feedback on every operator, the
envelopes, keyboard scaling, velocity, LFO and pitch EG; no effects). Two probes keep it honest, each playing the
same voices on the DX and in the engine and measuring both with the same code:

- `tools/curves.ts` (`dxCurves.ts` on the DX, `engineCurves.ts` for the engine): one parameter at a time.
- `tools/voices.ts` (`voiceProbe.ts`): whole voices. `--compare` replays the voices the DX played (every take keeps
  its voice as a `.syx` beside the WAV) without the DX.

`test/engine.spec.ts` checks the engine against the curves (`test/fixtures/dx-curves.json`).

### What the DX does, measured 2026-10-26

| | Measured | In the engine |
| --- | --- | --- |
| Output level | **0.375 dB a step** from 127 down to 32 (−35.6 dB), steeper below (8: −59.6 dB) | the same table; within 0.1 dB |
| EG level | **gentler than the output level**: 112 −2.6 dB, 96 −5.7, 64 −13, 32 −22.4, 8 −36 | the same table |
| Feedback | **a wave shape, not noise**: saw feedback turns the sine into a saw (H2 −6.3, H3 −10, H4 −12.6 dB at 127, nearly 1/n), square feedback into a square (odd harmonics only). From ~96 the shape hardly changes, the wave only gets quieter (−6.6 dB at 127). **The same at any output level** (unlike the DX7, where feedback follows the operator's level) | the measured harmonics per value, H2–H8 within 0.5 dB |
| Feedback as a modulator | a shaped modulator modulates **as if its fundamental keeps a sine's full strength**, the harmonics on top: at level 50 a saw modulator brightens its carrier to 15 harmonics, a square to 9 | the same; 10 and 8 harmonics (closer above) |
| Velocity | full sensitivity takes **0.375 dB (one output level step) per velocity step** below 127, half sensitivity half that | the same; within 0.3 dB |
| Carriers | **the output is divided by the number of carriers**: two carriers 6 dB, four 12 dB quieter than one at the same levels | the same |
| Attack | the amplitude **approaches 1.5 × its target exponentially** and stops there: fast at first, slowing into the top | the same; within 1–3 dB along the way, times within 3 % |
| Modulator depth | (2026-10-23) | 0.7 dB mean error on H2–H5 at 0.375 dB a step and 2.0 cycles at full level |

**Noise** comes from square (or saw) waves modulating deep, not from feedback alone: the FM noise voice measures a
flatness of 0.81 on the DX (0.75 in the engine); a square modulator grafted into Metal 0.013 at level 80, 0.032 at
100, 0.045 at 112 and no more above (engine 0.020, 0.031, 0.027).

**Whole voices** (one pin per tonality): loudness within ~1–2 dB, brightness and envelope close for most. Still off:
String is twice as bright in the engine (centroid 9.0 against 4.6 harmonics), FM noise ~5 dB quieter, a saw
modulator at 110 9 dB louder, and the DX's release after key-off at rate 127 isn't instant (−15 … −60 dB 100 ms
later, depending on the voice). Still estimates: keyboard and rate scaling, detune, LFO, pitch EG rates, AMD.
