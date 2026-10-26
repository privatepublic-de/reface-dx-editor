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

### The rise, and right after the attack (measured 2026-10-26)

Found when the converted hi-hat was silent on the DX. A carrier's level follows its envelope up with a time
constant of ~10.5 ms and down at once (`RISE_S`); a modulator's depth doesn't: a 1 : 1 modulator at R1 127 is as
bright in the first 5 ms as later on the DX (4.1 harmonics at C2 from the onset), where the engine with the rise on
every operator started 25 % darker, and the converted grands swelled into their brightness over 30–60 ms like a
wah. So: no note gets louder faster than ~24 ms to 90 % (the measured
attack floor, 26 ms), and a fast first decay starts before the rise is done, so it takes the peak down. The attack
table now holds the envelope's own time (near instant from R1 100); with the rise the measured attack times come out
within 2 ms.

Right after the attack the DX is erratic. A sine, R1 127, L1 127, then R2 to 0, five takes each at C3 and C4 (peak
against a held note, `local/aa_repeat.ts`): each take either loses a little or a lot, about half and half, as if the
envelope ran in ticks and the decay started a tick early or late by where the key-on falls.

| R2 | DX, a little | DX, a lot | Engine |
|---|---|---|---|
| 70 | −1.8 … −3.1 dB | | −1.6 |
| 75 | −2.3 … −3.9 | | −2.0 |
| 80 | −3.0 … −3.2 | −5.6 (2 of 10) | −2.7 |
| 85 | −3.7 … −4.0 | −7.6 … −7.9 | −3.5 |
| 90 | −4.4 … −5.2 | −10.8 … −11.1 | −4.4 |
| 95 | −5.0 … −5.9 | −14.7 … −15.0 | −5.6 |
| 100 | −6.0 … −7.1 | −20.8 … −21.2 | −7.2 |
| 105–115 | | −8 … silent | |

The engine follows the "little" outcome. Above R2 80 a voice's peak is a coin toss on the DX, so the converted
instruments keep their first decay at R2 ≤ 80. With L2 at 64 instead of 0 the note rises straight to L2 from R2 100.
The decay table, measured from the peak to −20 dB, still holds: the engine's decay probes come out as the DX's.

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

## Instruments from the DX7 (PLAN §8.6)

**What to expect.** A converted DX7 voice is an approximation, not a copy. Six operators become four and 32
algorithms 12; where a voice needs all six (two 3-operator stacks, a hammer beside a body) something goes. The
reface's own behaviour differs too: no carrier rises faster than ~24 ms (the first click of a hammer or a pluck
goes), a fast first decay is a coin toss, envelopes rise in amplitude where the DX7's climb evenly in dB (a slow
brass swell opens early), feedback never turns to noise on its own, and the pitch EG starts at L1. The distances
below are measured against the volca's DX7 engine; most voices land between 1 and 5 dB, none at 0. Nothing imported
sounds exactly as in Dexed or on a real DX7: listen, keep what works, and edit from there.

Start from… offers the volca fm generator's 41 instruments: Yamaha's DX7, TX7, TX816 and VRC voices, its own drums,
choirs and whistle. `tools/fromDx7.ts` converts each original once into `src/wheel/instrumentVoices.ts`, with both
engines as oracles: the volca's DX7 engine (MSFA's arithmetic) plays the original, the probe engine each candidate.

**Parameters by what they do.** Ratios and fixed frequencies by the number (the DX7's fine multiplies, the reface's
adds). Output and EG levels by dB (0.75 dB a step on the DX7, 0.375 and the EG table on the reface). Envelope rates
fitted to the DX7 envelope's curve at C3, its rate scaling there included. A carrier's attack is set by when it
arrives at the top: the DX7 climbs evenly in dB from −50, the reface's amplitude rushes up and slows into the top,
so early in a slow swell the reface is louder (a pad: −23 dB at 5 ms against −48) whatever the rate. Nothing on the
reface starts faster than ~26 ms, so the DX7's instant attacks (hammers, plucks, drums) lose their first click.
Velocity: the reface's straight line closest to the DX7's curve over velocities 20–127, the difference at velocity
100 added to the output level. Keyboard level scaling: the break point moves to C3, the output level is set where
the DX7's level is at C3, each side's depth and curve fitted over C1–C3 and C3–C6. Rate scaling 2^(s/8) an octave on
the DX7, 2^(x/127) on the reface. Detune 0.90 cents a step against 0.59. The LFO: speed and delay by Hz and seconds,
the waves by name, pitch depth by semitones, an operator's amplitude sensitivity by the dip in dB. The pitch EG: the
DX7 starts at L4 and moves through L1 and L2 to L3; the reface starts at L1, so one move goes, the one whose pitch
curve is closer. The LFO's pitch modulation and the pitch EG are switched on for every operator, as the DX7 moves
them all.

**Feedback** by the harmonics: a lone fed-back operator at the operator's loudest in both engines, H2–H8 against
the fundamental. The DX7's feedback 7 at level 99 turns to noise (flatness 0.26); the reface's never does, it makes
noise from square waves at the top modulating deep. So a noisy DX7 voice is also tried rebuilt the reface way: what
its noise source modulated, now under three square waves at fixed frequencies (algorithm 5), or under one beside its
loudest other carrier (algorithm 10). The hi-hat comes out as noisy as the original that way (flatness 0.53 against
0.51); converted operator by operator it had 0.004.

**Six operators to four.** Every choice of three or four sounding operators, the modulations among them as they are
or passed through a dropped operator; also with two carriers at the same frequency merged into one, or two such
modulators into the same operators (their amplitudes add). Each is placed on every reface algorithm and numbering
where the kept operators keep their roles (some modulations may go). Every candidate is played beside the original
at C2, C3 and C4, held 1 s and released: loudness over time (from −30 dB up) and the spectrum's share in bands of
harmonics (1, 2, 3–4, 5–8, 9–16, 17–32, above), at eight moments from 5 ms to 0.25 s after the release. The
distance is the mean difference in dB. The three closest are fine-tuned (each operator's level, attack and first
decay, feedback) and the best kept.

Checked on simple voices first: a held 1 : 1 stack with the modulator at level 70 or 90 converts within 0.3–0.6 dB;
a plucked sine within 0.4 dB.

### The losses (2026-10-26)

Distance in dB (above); brightness as the spectral centroid in harmonics, early (20 ms) and in the body (0.5 s);
decay as the time to −20 dB within the 1 s held (∞: not within it). Original → reface, with the engine's rise
(above) in. A first decay faster than R2 80 right after the attack is a coin toss on the DX, so where the original
falls faster and its third stage only holds (drums, plucks), the converted one falls at R2 80 for a moment to a
level a little lower, then fast at R3: on the DX that peak varies by 3 dB from hit to hit, not 18.

| Instrument | Original | Algorithm | Reduced | Distance dB | Bright early C2 | Body C2 | Decay C2 s | Early C4 | Decay C4 s |
|---|---|---|---|---|---|---|---|---|---|
| Grand | STEINWAY | 13 → 8 | without OP4, OP5 | 3.4 | 25.81→17.88 | 16.98→10.90 | ∞→∞ | 13.23→10.51 | ∞→∞ |
| Grand | Bosendorfr | 4 → 3 | OP1 into OP4, without OP6 | 4.2 | 39.17→29.66 | 23.49→18.06 | ∞→∞ | 14.29→13.35 | 0.88→0.88 |
| Upright | UPRIGHT | 3 → 6 | without OP5, OP6 | 1.9 | 27.02→29.09 | 15.16→15.58 | ∞→∞ | 6.73→7.40 | ∞→∞ |
| Upright | AC.PNO 1.1 | 16 → 3 | without OP2, OP6 | 1.0 | 5.89→5.38 | 5.25→5.13 | ∞→∞ | 1.78→1.90 | ∞→∞ |
| Upright | GOOD PIANO | 4 → 6 | without OP5, OP6 | 1.7 | 27.27→29.60 | 13.89→18.32 | ∞→∞ | 6.87→6.09 | ∞→∞ |
| Upright | PianoBo 7\ | 9 → 6 | without OP2, OP4 | 1.8 | 7.91→7.49 | 5.95→5.88 | ∞→∞ | 2.44→2.93 | 0.93→0.96 |
| E.Piano | E.PIANO 1 | 5 → 8 | without OP5, OP6 | 2.4 | 4.60→4.33 | 2.98→2.60 | ∞→∞ | 3.30→4.05 | ∞→∞ |
| Harpsichrd | HARPSICH 1 | 5 → 8 | without OP5, OP6 | 2.3 | 9.11→8.21 | 9.19→9.44 | ∞→∞ | 8.94→7.67 | ∞→∞ |
| Clavinet | CLAV    1 | 18 → 5 | spliced without OP4, OP5 | 2.6 | 10.13→9.00 | 8.35→9.61 | ∞→∞ | 6.42→5.43 | ∞→∞ |
| Nylon Gtr | SPANISHGTR | 14 → 2 | without OP1, OP2 | 0.5 | 4.88→4.86 | 3.27→3.35 | ∞→∞ | 4.80→4.72 | ∞→∞ |
| Steel Gtr | FOLK GUIT | 14 → 2 | without OP1, OP2 | 1.0 | 10.34→10.42 | 7.16→7.32 | ∞→∞ | 10.11→10.00 | ∞→∞ |
| Harp | HARP    1 | 3 → 6 | without OP5, OP6 | 1.3 | 5.51→4.87 | 1.53→1.57 | ∞→∞ | 3.12→2.84 | ∞→∞ |
| Koto | KOTO | 2 → 1 | without OP1, OP2 | 1.3 | 15.57→15.47 | 3.13→3.00 | 0.98→0.90 | 5.41→5.53 | 0.46→0.41 |
| Sitar | SITAR | 8 → 3 | without OP1, OP2 | 3.9 | 24.17→24.35 | 8.45→6.09 | ∞→∞ | 21.86→21.94 | ∞→∞ |
| Pizzicato | PIZZ STGS | 2 → 8 | without OP5, OP6 | 0.9 | 1.93→1.90 | 0.00→21.24 | 0.08→0.07 | 2.10→2.07 | 0.06→0.05 |
| Vibraphone | VIBE    1 | 23 → 11 | without OP3, OP5 | 3.0 | 2.61→2.44 | 1.08→1.11 | 0.61→0.95 | 2.17→2.20 | 0.18→0.21 |
| Xylophone | XYLOPHONE | 7 → 8 | without OP4, OP6 | 1.3 | 0.99→1.64 | 1.09→0.62 | 0.18→0.18 | 0.57→0.73 | 0.13→0.12 |
| Glocken | GLOCKEN  1 (Original Yamaha/DX7 VRC Cartridges/VRC-101/VRC-101 KEYBORD,PLUCKD & TUNED PERCUSSION GROUP (B) #27) | 23 → 11 | all | 2.6 | 5.19→4.97 | 2.59→2.55 | ∞→∞ | 4.15→4.75 | ∞→∞ |
| Steel Drum | STEEL DRUM | 15 → 8 | without OP5, OP6 | 1.7 | 3.18→2.42 | 1.20→1.25 | ∞→∞ | 2.79→2.15 | 0.64→0.62 |
| FM Bass | BASS    1 | 16 → 3 | without OP5, OP6 | 1.6 | 9.50→8.24 | 1.66→1.68 | ∞→∞ | 6.79→6.08 | ∞→∞ |
| Slap Bass | Slap.Bass (Original Yamaha/DX7II VRC Cartridges/VRC-1001_DECAY group_A(33-64) #22) | 17 → 3 | without OP3, OP4 | 2.2 | 13.28→13.08 | 2.93→3.10 | ∞→∞ | 4.64→5.24 | ∞→∞ |
| Upright | JazzBass | 15 → 6 | without OP2, OP5 | 4.1 | 2.75→1.18 | 2.75→2.89 | 0.67→0.21 | 1.57→1.34 | 0.60→0.96 |
| Synth Bass | SYN-BASS 1 | 3 → 6 | without OP5, OP6 | 1.5 | 4.55→4.02 | 2.16→2.12 | 0.69→∞ | 4.68→4.24 | ∞→∞ |
| Oboe | OBOE | 3 → 8 | spliced without OP3, OP5 | 2.2 | 6.30→7.32 | 6.32→7.10 | ∞→∞ | 6.46→7.05 | ∞→∞ |
| Bassoon | BASSOON | 2 → 1 | OP1 into OP3, without OP2, OP6 | 2.1 | 2.66→3.09 | 2.82→2.63 | ∞→∞ | 2.68→3.13 | ∞→∞ |
| Sax | SAXOPHONE3 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (A) #20) | 18 → 1 | without OP2, OP3 | 1.4 | 6.42→6.04 | 7.45→6.60 | ∞→∞ | 6.87→6.73 | ∞→∞ |
| Harmonica | HARMONICA1 | 1 → 1 | all | 1.7 | 1.23→1.24 | 1.87→1.82 | ∞→∞ | 1.23→1.24 | ∞→∞ |
| Accordion | ACCORDION | 4 → 6 | without OP2, OP3 | 3.1 | 3.66→3.89 | 3.31→2.98 | ∞→∞ | 3.15→3.18 | ∞→∞ |
| Trumpet | BR TRUMPET | 18 → 3 | without OP2, OP6 | 4.9 | 1.40→3.52 | 10.09→9.78 | 0.20→0.44 | 7.23→4.15 | ∞→∞ |
| Trombone | TROMBONE 1 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (B) #6) | 18 → 5 | without OP5, OP6 | 5.3 | 1.58→3.76 | 14.92→13.17 | ∞→0.51 | 2.36→2.89 | ∞→∞ |
| Horn | HORN     1 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (A) #22) | 10 → 3 | without OP1, OP2, OP3 | 2.0 | 1.60→1.45 | 2.60→1.70 | ∞→∞ | 1.25→1.34 | ∞→∞ |
| Tuba | TUBA (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (B) #11) | 18 → 3 | without OP4, OP5, OP6 | 4.2 | 1.06→2.38 | 2.11→3.45 | ∞→∞ | 4.52→2.91 | ∞→∞ |
| Brass Sect | BRASS   1 | 22 → 8 | without OP3, OP5 | 4.5 | 9.35→5.80 | 3.90→5.95 | ∞→∞ | 7.60→4.31 | ∞→∞ |
| Violin | VIOLIN   4 (Original Yamaha/DX7 VRC Cartridges/VRC-103/VRC-103 SUSTAIN GROUP (A) #4) | 18 → 3 | spliced without OP3, OP5 | 4.7 | 65.95→41.01 | 16.52→22.12 | ∞→∞ | 37.97→38.55 | ∞→∞ |
| Cello | CELLO  7.4 | 16 → 3 | spliced without OP2, OP3 | 5.1 | 8.99→12.29 | 5.57→5.30 | ∞→∞ | 7.81→6.82 | ∞→∞ |
| Kick | our own | 5 → 1 | all | 1.5 | 0.55→0.53 | 0.39→0.39 | 0.17→0.16 | 0.14→0.13 | 0.17→0.16 |
| Snare | our own | 5 → 10 | noise rebuilt: one square wave into its carrier, OP1 for the tone | 1.9 | 76.50→80.54 | 7.53→63.49 | 0.12→0.12 | 19.42→20.37 | 0.12→0.12 |
| Tom | our own | 5 → 1 | all | 1.2 | 1.40→1.25 | 1.03→1.03 | 0.28→0.27 | 1.33→1.23 | 0.31→0.30 |
| Hi-Hat | our own | 5 → 5 | noise rebuilt: three square waves into its carrier | 0.8 | 88.82→88.82 | 0.00→0.21 | 0.05→0.04 | 22.63→22.67 | 0.04→0.04 |
| Cymbal | our own | 5 → 8 | without OP1, OP2 | 7.7 | 89.79→81.87 | 86.28→76.89 | 0.96→0.89 | 22.80→22.64 | 0.98→0.91 |
| Cowbell | our own | 32 → 6 | all | 3.5 | 4.86→4.92 | 4.91→4.93 | 0.10→0.18 | 1.22→1.23 | 0.10→0.18 |
| Timpani | TIMPANI | 16 → 3 | without OP3, OP4 | 1.5 | 2.01→2.35 | 1.30→1.30 | 0.38→0.29 | 1.70→1.64 | 0.50→0.45 |
| Choir | our own | 32 → 12 | without OP2, OP3 | 5.1 | 2.82→2.41 | 1.32→1.43 | ∞→∞ | 2.81→2.39 | ∞→∞ |
| Ooh | our own | 32 → 9 | all | 4.0 | 1.31→1.25 | 1.04→1.05 | ∞→∞ | 1.32→1.26 | ∞→∞ |
| Whistle | our own | 5 → 6 | all | 1.5 | 9.58→4.60 | 8.36→5.45 | ∞→∞ | 3.03→1.82 | ∞→∞ |

Most land within 3 dB: the pianos but the two grands, the e-piano, harpsichord, clavinet, guitars, harp, koto,
pizzicato, mallets, basses, winds, horn, the drums but the cymbal, and the whistle. Further off: the grands (STEINWAY
3.4, Bösendorfer 4.2: two 3-operator stacks and a hammer in four operators), the brass (4–5: the DX7's slow-opening
modulators climb evenly in dB, the reface's rush), the strings, choirs, sitar and the cymbal (4–7). Every hammer's
and pluck's first click goes: the reface rises no faster than ~24 ms. Merging two operators at the same frequency
comes out closest for the sax, bassoon, horn, FM bass and the Bösendorfer; for the rest, dropping one or passing
through it does.

**The pianos, fixed 2026-10-26.** The TX7 UPRIGHT came out five times darker (7.8 dB): its hammer (OP3) jumps to a
quiet L1 and opens at R2, and the rate fit had set R1 to 0, so the hammer never got past its first stage. A curve
that never rises above the fit's −40 dB floor scored a little better than one decaying too slowly, and coordinate
descent can't leave that. The Bösendorfer released far too slowly: held 3 s for the fit, the note had died before
the key went, so its release never counted. Now each envelope is fitted on two holds (3 s and 0.3 s), descending
from three starts (the DX7's rates scaled; each stage as long as the DX7's; that with the release's speed from the
short hold), no trial that stays silent where the original sounds, the best kept. UPRIGHT 7.8 → 2.2 dB (brightness
at C2 27.0 → 28.3 harmonics, was 5.2), Bösendorfer 6.2 → 4.2; the rest the same or closer but the upright bass
(2.6 → 3.6).

**The grands' attack, fixed 2026-10-26.** By ear on the DX the grands began like a wah, without a hammered attack:
their modulators' attacks came out at R1 83–96 (the curve fit, as for a slow swell) and the engine let modulators
rise with the carriers' ~10 ms. Now a modulator that gets to its top within 30 ms on the DX7 (a hammer, a pick) has
its attack set by when it arrives, as a carrier's, the fine-tune leaves instant attacks alone, and the engine's rise
is on carriers only. Brightness in the first 200 ms at C2 on the DX, every 0/10/20/40/80/200 ms: STEINWAY 24.9 25.1
24.9 22.0 21.4 17.8, Bösendorfer 31.6 30.4 28.1 30.5 27.4 24.1 harmonics: brightest from the start, as the originals
(34.4 … 21.3 and 41.9 … 33.2). Before, the conversion started at 4–6 and got bright after 30–60 ms.

### On the DX (2026-10-26, `tools/voiceProbe.ts instruments`)

The converted voices as the wheel plays them alone, DX against the engine (loudness aligned on the first take; peak
over 20 ms; brightness in harmonics):

| Instrument | Peak DX / engine | Brightness DX / engine |
|---|---|---|
| E.Piano | −29.4 / −29.3 dB | 3.02 / 3.11 |
| Grand (STEINWAY) | −26.6 / −25.9 | 10.9 / 11.2 |
| Trumpet | −31.2 / −29.0 | 8.0 / 6.8 |
| Vibraphone | −30.9 / −29.4 | 1.50 / 1.45 |
| FM Bass | −20.4 / −20.6 | 3.33 / 3.54 |
| Kick | −30.7 / −29.7 | |
| Snare | −31.9 … −32.4 / −31.7 | (flatness 0.20 / 0.02) |
| Hi-Hat | −27.7 … −51 / −29.8 | (flatness 0.24–0.35 / 0.45) |
| Tom | −31.8 / −29.1 | |
| Xylophone | −36.0 / −33.5 | 3.41 / 2.54 |
| Pizzicato | −32.8 / −30.0 | 2.31 / 1.74 |

Before the decay was understood the drums came out 4–13 dB quieter on the DX (the first conversion's hi-hat, with
its carrier falling at R2 123, was silent). Now they're within about 3 dB, the hi-hat varying from hit to hit (one
take in three much quieter). The snare is noisier on the DX than in the engine, as the engine's fed-back carriers
under fast modulation are (above).

The pianos on the DX (`local/pianos_dx.ts`, each original by the seed that picks it), peak and brightness:

| Original | C2 DX / engine | C4 DX / engine |
|---|---|---|
| STEINWAY | −30.2 / −29.9 dB, 8.7 / 8.3 H | −31.9 / −31.5, 4.9 / 5.0 |
| Bösendorfer | −29.7 / −29.4, 14.0 / 13.5 | −30.4 / −29.2, 5.6 / 5.4 |
| TX7 UPRIGHT | −29.3 / −28.6, 22.6 / 24.0 | −29.2 / −29.4, 5.0 / 5.2 |
| AC.PNO 1.1 | −28.1 / −27.9, 5.4 / 5.4 | −31.2 / −30.1, 1.9 / 1.9 |
| GOOD PIANO | −30.6 / −30.6, 13.4 / 13.5 | −32.5 / −31.8, 2.5 / 2.5 |
| PianoBo 7 | −28.7 / −29.0, 6.2 / 6.3 | −30.4 / −29.4, 2.5 / 2.4 |

### The quick conversion, for importing (2026-10-26)

Import .syx… converts DX7 voices one at a time while you listen, so the full search (~30 s a voice) is too slow.
Quick: every candidate is screened on one short note (C3, held 0.6 s, at 16 kHz), the closest eight are heard in
full, and the best is fine-tuned once on levels and feedback. Six of Yamaha's ROM1A voices, distance (full hearing)
and time in node:

| Voice | Quick | Full |
|---|---|---|
| BRASS 1 | 5.9 dB, 3.8 s | 5.0 dB, 38.5 s |
| BRASS 2 | 4.0, 3.2 | 3.8, 27.3 |
| PIANO 1 | 1.9, 3.3 | 1.6, 24.5 |
| E.PIANO 1 | 3.2, 3.2 | 2.4, 27.0 |
| BASS 1 | 2.1, 2.8 | 1.6, 28.6 |
| VIBE 1 | 3.1, 3.4 | 2.6, 30.7 |

Screening with fewer notes at a lower rate first picked other reductions for the brass and the vibraphone; hearing
the closest eight in full brought back the full search's choice. Fine-tuning at the low rate didn't help. In the
browser's worker a voice takes about 2 s.

