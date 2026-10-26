// Analysis for the sound tools: finding a note's steady part and period, averaging cycles, harmonic
// amplitudes, spectra and RMS envelopes. Period finding and cycle averaging as in hydrasynth-editor's
// tools/waveAudio.ts, with a free (wide) period search.
/** The sample rate of the takes. */
export const RATE = 48000

export const db = (x: number) => 20 * Math.log10(Math.abs(x) + 1e-12)

export function peak(x: ArrayLike<number>): number {
  let p = 0
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]))
  return p
}

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, to - from))
}

/** RMS per block of `blockS` seconds. */
export function envelope(x: Float64Array, blockS = 0.005): number[] {
  const block = Math.round(blockS * RATE)
  const out: number[] = []
  for (let i = 0; i + block <= x.length; i += block) out.push(rms(x, i, i + block))
  return out
}

/** The first sample above `threshold`. */
export function onsetOf(x: Float64Array, threshold = 0.003): number {
  let i = 0
  while (i < x.length && Math.abs(x[i]) < threshold) i++
  return i
}

/** In-place radix-2 FFT; re and im of length 2^n. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k)
        const s = Math.sin(a * k)
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s
        const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr
        im[i + k + len / 2] = ui - vi
      }
  }
}

/** Welch power spectrum (Hann, 50 % overlap), amplitude per bin scaled so a full-scale sine reads 1. */
export function spectrum(x: Float64Array, size = 8192): { hz: number[]; amp: number[] } {
  const w = Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size))
  const wsum = w.reduce((a, b) => a + b, 0)
  const pow = new Float64Array(size / 2)
  let frames = 0
  for (let start = 0; start + size <= x.length; start += size / 2, frames++) {
    const re = new Float64Array(size)
    const im = new Float64Array(size)
    for (let i = 0; i < size; i++) re[i] = x[start + i] * w[i]
    fft(re, im)
    for (let k = 0; k < size / 2; k++) pow[k] += re[k] ** 2 + im[k] ** 2
  }
  return {
    hz: Array.from({ length: size / 2 }, (_, k) => (k * RATE) / size),
    amp: Array.from(pow, (p) => (2 * Math.sqrt(p / Math.max(1, frames))) / wsum),
  }
}

/** The strongest frequency between lo and hi Hz, refined by parabolic interpolation on dB. */
export function peakHz(x: Float64Array, lo = 20, hi = 20000, size = 16384): number {
  const { hz, amp } = spectrum(x, size)
  let best = -1
  for (let k = 1; k < hz.length - 1; k++) if (hz[k] >= lo && hz[k] <= hi && (best < 0 || amp[k] > amp[best])) best = k
  const [a, b, c] = [db(amp[best - 1]), db(amp[best]), db(amp[best + 1])]
  const d = (0.5 * (a - c)) / (a - 2 * b + c || 1)
  return ((best + d) * RATE) / size
}

/** The period in samples (fractional) near `expected` (±3 %), refined over many cycles. */
export function period(x: Float64Array, expected: number): number {
  const lo = Math.floor(expected * 0.97)
  const hi = Math.ceil(expected * 1.03)
  const n = Math.min(x.length - hi, 24000)
  let best = lo
  let bestScore = -Infinity
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0
    for (let i = 0; i < n; i++) s += x[i] * x[i + lag]
    if (s > bestScore) [bestScore, best] = [s, lag]
  }
  const k = Math.max(1, Math.floor((x.length * 0.5) / best))
  let p = best
  let bestK = -Infinity
  for (let lag = Math.floor(best * k - k); lag <= Math.ceil(best * k + k); lag++) {
    let s = 0
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag]
    s /= x.length - lag
    if (s > bestK) [bestK, p] = [s, lag / k]
  }
  return p
}

const sampleAt = (x: Float64Array, t: number) => {
  const i = Math.floor(t)
  const f = t - i
  const p0 = x[i - 1] ?? x[i]
  const p1 = x[i]
  const p2 = x[i + 1] ?? x[i]
  const p3 = x[i + 2] ?? p2
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))
}

export const CYCLE = 1024

/** One cycle averaged over all of `x` with period `p`. */
export function averageCycle(x: Float64Array, p: number): Float64Array {
  const cycles = Math.floor((x.length - 3) / p) - 1
  const out = new Float64Array(CYCLE)
  for (let c = 0; c < cycles; c++) for (let k = 0; k < CYCLE; k++) out[k] += sampleAt(x, 1 + c * p + (k * p) / CYCLE)
  return out.map((v) => v / cycles)
}

/** Amplitude and phase of harmonics 1..n of a cycle. */
export function harmonics(cycle: Float64Array, n = 40): { amp: number[]; phase: number[] } {
  const amp: number[] = []
  const phase: number[] = []
  for (let k = 1; k <= n; k++) {
    let re = 0
    let im = 0
    for (let i = 0; i < cycle.length; i++) {
      const a = (2 * Math.PI * k * i) / cycle.length
      re += cycle[i] * Math.cos(a)
      im -= cycle[i] * Math.sin(a)
    }
    amp.push((2 * Math.hypot(re, im)) / cycle.length)
    phase.push(Math.atan2(im, re))
  }
  return { amp, phase }
}

/** Where a take's note starts: dxTake's recordings reach the note about 0.12 s in (sox starts late;
 *  ±10 ms). A quiet note's onset can't be found, so it is taken as no later than that. */
export const NOTE_AT_S = 0.13

/** The part of a take from `fromS` to `toS` seconds after its onset. */
export function window(x: Float64Array, fromS: number, toS: number): Float64Array {
  const on = Math.min(onsetOf(x), Math.round(NOTE_AT_S * RATE))
  return x.subarray(on + Math.round(fromS * RATE), Math.min(x.length, on + Math.round(toS * RATE)))
}

export const noteHz = (note: number) => 440 * 2 ** ((note - 69) / 12)
export const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref)
