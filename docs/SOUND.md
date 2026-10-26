# How the reface DX sounds, measured

Recorded from the DX's line out (X18 inputs 1/2, 48 kHz) by `tools/dxCurves.ts` and `tools/styleProbe.ts`, 2026-10-23.
The style templates were tuned to these curves; the tonality wheel (`src/wheel/`, PLAN §8) took over their numbers and
the measured transforms left in `src/style/`. Re-run `tools/dxCurves.ts` after changing them.

The family/character style editor and its probes (`tools/styleProbe.ts`, `tools/styleCompare.ts`, `tools/noiseProbe.ts`)
were removed on 2026-10-26, when the wheel replaced it. Their sections below stay as the record of what was measured;
the commands in them no longer run.

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

*Removed with the style editor (see the top); kept as history.*

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

*Removed with the style editor (see the top); kept as history.*

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

*Removed with the style editor (see the top); kept as history. The noise family's numbers live on in the wheel's Noise tonality.*

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
| Feedback | alone, **no noise**: saw feedback turns the sine into a saw (H2 −6.3, H3 −10, H4 −12.6 dB at 127, nearly 1/n), square feedback into a square (odd harmonics only). From ~96 the shape hardly changes, the wave only gets quieter (−6.6 dB at 127). **The same at any output level** (unlike the DX7, where feedback follows the operator's level) | real feedback: the operator's wave (not its output), smoothed by a one-pole low-pass (0.2 a sample at 48 kHz), moves its own phase; square feeds back its absolute value. The saw's quieter top is an offset the loop builds up, which the output blocks (a 5 Hz high-pass, as the DX's output). H2–H5 within 1 dB, loudness within 0.6 dB |
| Feedback under modulation | a carrier with feedback, **modulated fast and inharmonically (3 kHz), is as loud as a sine** and gets noisy (flatness 0.03–0.10); modulated 1 : 1 it keeps its quieter level. A shaped modulator brightens its carrier more than a sine: at level 50 a saw to 15 harmonics, a square to 9 | the same from the loop: the modulation scrambles it, the offset goes (within 1 dB); less noise (0.002–0.014). Shaped modulators 12.6 and 7 harmonics |
| Velocity | full sensitivity takes **0.375 dB (one output level step) per velocity step** below 127, half sensitivity half that | the same; within 0.3 dB |
| Carriers | **the output is divided by the number of carriers**: two carriers 6 dB, four 12 dB quieter than one at the same levels | the same |
| Attack | the amplitude **approaches 1.5 × its target exponentially** and stops there: fast at first, slowing into the top | the same; within 1–3 dB along the way, times within 3 % |
| Modulator depth | (2026-10-23) | 0.7 dB mean error on H2–H5 at 0.375 dB a step and 2.0 cycles at full level |

**Noise** comes from feedback operators modulating and modulated deep: the FM noise voice measures a flatness of
0.81 and −24.8 dB on the DX, 0.83 and −24.0 dB in the engine (with the earlier wave-table feedback 0.75 and ~5 dB
quieter: the loop's offset had been taken as a fixed loss). A square modulator grafted into Metal 0.012 at level 80
and 0.045 at 112 (engine 0.010, 0.061).

**Whole voices** (one pin per tonality and two-pin mixes): loudness within ~1–2 dB, brightness and envelope close.
Still off: a saw modulator at 110 is ~3 dB louder in the engine, a carrier with feedback under fast modulation less
noisy, and after an instant release (R4 127) a bright voice leaves a low thump on the DX (−13 dB, centred ~135 Hz,
ringing out over ~0.3 s; none after a pure sine): the DX's output stage, not its envelope, and not in the engine.

### Release, LFO, pitch EG, detune and scaling, measured 2026-10-26

`tools/dxCurves.ts release lfospeed amd pmd lfodelay lfowave peglevel pegrate detune ksc kscplus ratescaling`; the
engine has each as a table (`src/engine/tables.ts`) and `test/engine.spec.ts` checks it against the takes.

| | Measured |
| --- | --- |
| Release (R4) | like the decay up to 80 (to −20 dB: 3.5 s at 40, 0.84 s at 60, 0.16 s at 80), faster above (16 ms at 100), instant from 110 |
| LFO speed | 0.036 Hz at 0 (a cycle of ~28 s), 0.7 at 16, 1.3 at 32, 2.0 at 48, 2.7 at 64, 4.4 at 80, 8.4 at 96, 17.5 at 112, 39.7 at 127 |
| LFO delay | waits, then fades in within 0.1–0.5 s: starts at 0.05 s (32), 0.35 s (64), 1.05 s (96), 1.75 s (112), 2.95 s (127) |
| LFO waves | sine, triangle, saw up, saw down, square as named; S&H a new value each cycle, **S&H 8 eight values a cycle** |
| PMD | **quadratic and deep**: the pitch swings ±0.4 semitones at 16, ±1.5 at 32, ±6 at 64, ±13.6 at 96, **±24 at 127** |
| AMD | quadratic in dB: the level swings 1.9 dB at 16, 6.4 at 32, 24.7 at 64, 56 at 96 (127 below the takes' floor, ~98 by the same curve) |
| Pitch EG level | 1 semitone a step (0x40 none, ±48) |
| Pitch EG start | **each note starts at L1, not L4** as on the DX7: R1 never sounds from a key-down. The style editor's brass blip and the wheel's pitch accent set L4 and so never sounded; they now start at L1 and fall back at R2 |
| Pitch EG rate | a fall of 12 semitones takes 0.8 s at 20, 0.19 s at 40, 26 ms at 60; instant from 80 |
| Detune | 0.59 cents a step: −37.6 … +36.9 cents |
| Keyboard level scaling | break point C3 (MIDI 60); linear 18 dB an octave at depth 127, exponential 9 dB × octaves² (9, 36, 81), both in proportion to the depth; up (+lin, +exp) the same, but never above full level |
| Rate scaling | centred on C3: slower below, faster above; at 127 twice as fast an octave up (64: 1.38 ×) |

PMD being quadratic made the tonalities' and the style families' vibratos (PMD 5–8: ±0.03–0.07 semitones) too
small to hear; they are now PMD 10–13 (±0.15–0.25 semitones) at speeds 82–95 (4.8–7.6 Hz).

With these, the engine has no estimates left: every table is a measurement (the lowest output and EG levels, 1–7,
extend the measured slope).

## Loudness levelling (PLAN §8.4)

`src/wheel/loudness.ts` renders every voice from the wheel (a held C4 at velocity 100, slow rates made quick, the
loudest 20 ms) and moves all its carriers by the same steps (0.375 dB each, kept between 32 and 127) to a full-level
sine minus 10 dB; a voice still not heard gets its first carrier at full level. Before levelling the wheel's voices
came out 0–12 dB below that sine in the engine; the four-carrier organ can only just reach the target, since the DX
divides by the carriers.

On the DX (`tools/voiceProbe.ts tonalities mixes`, 2026-10-26, the loudest 20 ms): the 12 tonalities and 6 two-pin
mixes from −28.8 to −32.0 dB, a spread of 3.2 dB (before: about 10 dB). With the wave-table feedback FM noise had
stood out at −26.2 dB; with the feedback loop it is in line.

## The controls (PLAN §8.4 step 4)

`src/wheel/controls.ts`. Brightness, treble and length are the style editor's (measured above); complexity, motion,
register and play are new for the reface. On the DX against the probe engine (`tools/voiceProbe.ts controls`,
2026-10-26; brightness as the spectral centroid in harmonics, levelled voices):

| Control | DX | Engine |
| --- | --- | --- |
| Brightness −1 / 0 / +1, brass | 1.4 / 4.2 / 15.5 | 1.3 / 4.1 / 13.2 |
| Brightness −1 / 0 / +1, bell | 2.0 / 3.4 / 8.7 | 1.9 / 3.5 / 8.2 |
| Treble −1, brass at C1 → C5 | 11.0 → 1.7 | 9.4 → 1.8 |
| Treble +1, brass at C1 → C5 | 2.5 → 6.7 | 2.5 → 6.6 |
| Length −1 / +1, bell 0.9 s in | −16.2 / −6.5 dB | −19.3 / −6.9 dB |
| Complexity 0 / ½ / 1, Sine | 1.48 / 1.23 / 1.41 | 1.40 / 1.16 / 1.35 |
| Motion 0 / 1, brass: how much a held note moves | 0.1 / 2.6 dB | 0.3 / 3.0 dB |
| Velocity 0 / 1, e-piano: velocity 120 against 40 | 0 / 6.5 dB | 0 / 6.5 dB |

Complexity moves Sine's brightness only a little (it has two light modulators to add or take away); pure is fewer
operators, not always darker (the e-piano keeps its 1 : 1 body, brighter than body and tine together). The pitch
accent and the register are checked in the engine only (pitch EG rates are still an estimate).
