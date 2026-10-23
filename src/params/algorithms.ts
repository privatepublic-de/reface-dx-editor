// The 12 algorithms: which operators are carriers and which modulates which. Operators are 0-based (0 = OP1).
// Every operator also has its own feedback loop (level + saw/square), which isn't part of the table.
//
// Checked against the reface DX algorithm chart on 2026-10-23 (FINDINGS Q13): all 12 as below. Algorithm 8
// is also drawn in the Owner's Manual p. 19.

export interface Algorithm {
  /** Operators heard at the output. */
  carriers: readonly number[]
  /** [modulator, modulated] pairs. */
  modulations: readonly (readonly [number, number])[]
}

export const ALGORITHMS: readonly Algorithm[] = [
  /* 1 */ { carriers: [0], modulations: [[3, 2], [2, 1], [1, 0]] },
  /* 2 */ { carriers: [0], modulations: [[3, 1], [2, 1], [1, 0]] },
  /* 3 */ { carriers: [0], modulations: [[2, 1], [1, 0], [3, 0]] },
  /* 4 */ { carriers: [0], modulations: [[3, 1], [3, 2], [1, 0], [2, 0]] },
  /* 5 */ { carriers: [0], modulations: [[1, 0], [2, 0], [3, 0]] },
  /* 6 */ { carriers: [0, 1], modulations: [[3, 2], [2, 1]] },
  /* 7 */ { carriers: [0, 1], modulations: [[3, 2], [2, 1], [2, 0]] },
  /* 8 */ { carriers: [0, 2], modulations: [[1, 0], [3, 2]] },
  /* 9 */ { carriers: [0, 1, 2], modulations: [[3, 0], [3, 1], [3, 2]] },
  /* 10 */ { carriers: [0, 1, 2], modulations: [[3, 1], [3, 2]] },
  /* 11 */ { carriers: [0, 1, 2], modulations: [[3, 2]] },
  /* 12 */ { carriers: [0, 1, 2, 3], modulations: [] },
]

export const isCarrier = (algorithm: number, op: number) => ALGORITHMS[algorithm].carriers.includes(op)

/** The operators `op` modulates, and those that modulate it. */
export const modulatedBy = (algorithm: number, op: number) => ALGORITHMS[algorithm].modulations.filter(([, to]) => to === op).map(([from]) => from)
export const modulates = (algorithm: number, op: number) => ALGORITHMS[algorithm].modulations.filter(([from]) => from === op).map(([, to]) => to)

/** "Level" means volume for a carrier and modulation depth for a modulator (Owner's Manual p. 19). */
export const levelMeaning = (algorithm: number, op: number) => (isCarrier(algorithm, op) ? 'volume' : 'mod depth')
