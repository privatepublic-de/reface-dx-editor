# Third-party notices

reface DX editor is MIT-licensed (see [LICENSE](LICENSE)). It builds on the work below.

## MSFA (music-synthesizer-for-android)

The DX7 engine used to convert DX7 voices (`src/dx7/tables.ts`, `src/dx7/synth.ts`, the algorithm routing table in
`src/dx7/algorithms.ts`) follows MSFA's `env.cc`, `dx7note.cc`, `pitchenv.cc`, `lfo.cc` and `fm_core.cc`,
translated to TypeScript (by way of the volca fm generator, same author). The reface DX probe engine
(`src/engine/`) was adapted from it and refitted to measurements of the reface DX.

> Copyright 2012–2013 Google Inc.
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in
> compliance with the License. You may obtain a copy of the License at
> https://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software distributed under the License is
> distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See
> the License for the specific language governing permissions and limitations under the License.

Source: https://github.com/google/music-synthesizer-for-android. The translation's changes are described in the
files' own comments (per-sample floats instead of 64-sample integer blocks, an amplitude-modulation model of its
own, the feedback loops of algorithms 4 and 6).

## Classic DX7 voices

The instruments in **Start from…** (`src/wheel/instrumentVoices.ts`) are conversions of the volca fm generator's
instruments, which reproduce classic DX7 voices, each named with its source: Yamaha's factory voices (DX7 ROM
cartridges 1–4, the VRC cartridges, the TX7, TX816 and DX7II/DX7IIFD sets) and two pianos, GOOD PIANO and PianoBo 7\,
from cartridges of unknown authorship in the collection distributed with [Dexed](https://github.com/asb2m10/dexed).
