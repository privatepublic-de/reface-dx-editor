# reface DX Editor

A voice editor and librarian for the Yamaha reface DX in the browser, over Web MIDI. Work in progress: see [PLAN.md](PLAN.md).

Phase 0 (now): a protocol probe that answers the open questions against the real synth.

```sh
npm install
npm run probe        # http://localhost:5185/probe.html
npm test
npm run list-voices -- some.syx
```

Web MIDI with SysEx needs Chrome or Edge and a served page (`localhost` or https). Results go to [docs/FINDINGS.md](docs/FINDINGS.md).

MIT License.
