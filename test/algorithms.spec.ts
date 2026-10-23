import { describe, expect, it } from 'vitest'
import { ALGORITHMS, isCarrier, modulatedBy, modulates } from '../src/params/algorithms'

describe('algorithms', () => {
  it('has 12', () => {
    expect(ALGORITHMS).toHaveLength(12)
  })

  it('algorithm 8 is as the Owner’s Manual draws it: 2 → 1, 4 → 3, carriers 1 and 3', () => {
    expect(ALGORITHMS[7]).toEqual({ carriers: [0, 2], modulations: [[1, 0], [3, 2]] })
  })

  it('matches the reface DX algorithm chart (Q13)', () => {
    // Carriers, and "modulator → modulated" as the chart draws them (1-based).
    const chart: [number[], string][] = [
      [[1], '4→3 3→2 2→1'],
      [[1], '4→2 3→2 2→1'],
      [[1], '3→2 2→1 4→1'],
      [[1], '4→2 4→3 2→1 3→1'],
      [[1], '2→1 3→1 4→1'],
      [[1, 2], '4→3 3→2'],
      [[1, 2], '4→3 3→2 3→1'],
      [[1, 3], '2→1 4→3'],
      [[1, 2, 3], '4→1 4→2 4→3'],
      [[1, 2, 3], '4→2 4→3'],
      [[1, 2, 3], '4→3'],
      [[1, 2, 3, 4], ''],
    ]
    const edges = (s: string) => s.split(' ').filter(Boolean).sort()
    ALGORITHMS.forEach((a, i) => {
      expect(a.carriers.map((c) => c + 1), `algorithm ${i + 1} carriers`).toEqual(chart[i][0])
      expect(a.modulations.map(([f, t]) => `${f + 1}→${t + 1}`).sort(), `algorithm ${i + 1} routing`).toEqual(edges(chart[i][1]))
    })
  })

  it.each(ALGORITHMS.map((a, i) => [i + 1, a] as const))('algorithm %i is a well-formed graph', (_, a) => {
    for (const [from, to] of a.modulations) {
      expect([from, to].every((op) => op >= 0 && op < 4)).toBe(true)
      expect(from).not.toBe(to) // self-modulation is the feedback, not an edge
    }
    // Carriers modulate nothing; every other operator modulates something (else it would be silent).
    for (let op = 0; op < 4; op++) {
      const out = a.modulations.filter(([from]) => from === op)
      if (a.carriers.includes(op)) expect(out).toHaveLength(0)
      else expect(out.length).toBeGreaterThan(0)
    }
    // Acyclic: operators can be ordered so every edge goes from a higher stage to a lower one.
    const remaining = new Set([0, 1, 2, 3])
    let edges = [...a.modulations]
    while (remaining.size) {
      const free = [...remaining].find((op) => !edges.some(([, to]) => to === op))
      expect(free).toBeDefined()
      remaining.delete(free!)
      edges = edges.filter(([from]) => from !== free)
    }
  })

  it('answers who modulates whom', () => {
    expect(isCarrier(11, 3)).toBe(true)
    expect(modulatedBy(3, 0)).toEqual([1, 2])
    expect(modulates(8, 3)).toEqual([0, 1, 2])
  })
})
