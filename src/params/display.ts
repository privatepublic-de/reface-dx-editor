// Operator frequency and detune as the DX's screen shows them. Checked against the DX on 2026-10-23
// (FINDINGS Q10: 48 coarse/fine/mode readings and 5 detune readings, all matching).

/** Ratio mode: coarse 0 = 0.50 (fine adds 0.005 per step, up to 0.995), else coarse + fine / 100 (up to 31.99). */
export const ratioOf = (coarse: number, fine: number) => (coarse === 0 ? 0.5 + fine * 0.005 : coarse + fine / 100)

/** Fixed mode: 8 coarse steps per decade (0–7 = 1 Hz, 8–15 = 10 Hz, 16–23 = 100 Hz, 24–31 = 1000 Hz),
 *  fine spans one decade minus a bit: × 10^(fine/100), so 1.000–9.772 at coarse 0. */
export const fixedHzOf = (coarse: number, fine: number) => 10 ** (coarse >> 3) * 10 ** (fine / 100)

/** "0.500", "0.995" below 1, else "1.00" … "31.99", as on the DX. */
export const formatRatio = (r: number) => (r < 1 ? r.toFixed(3) : r.toFixed(2))

/** Four significant digits, as on the DX: "1.000", "31.62", "316.2", "9772". */
export const formatHz = (hz: number) => (hz >= 1000 ? hz.toFixed(0) : hz >= 100 ? hz.toFixed(1) : hz >= 10 ? hz.toFixed(2) : hz.toFixed(3))

/** The DX shows detune as the raw value − 64, unitless: "-32", "+1". */
export const formatDetune = (raw: number) => (raw > 64 ? `+${raw - 64}` : String(raw - 64))

export const describeFrequency = (mode: number, coarse: number, fine: number) =>
  mode === 0 ? formatRatio(ratioOf(coarse, fine)) : `${formatHz(fixedHzOf(coarse, fine))} Hz`

/** Coarse and fine for a ratio (0.5–31.99), the inverse of `ratioOf`, rounded to the nearest step. */
export function ratioBytes(r: number): [coarse: number, fine: number] {
  if (r < 1) return [0, Math.max(0, Math.min(99, Math.round((r - 0.5) / 0.005)))]
  const coarse = Math.min(31, Math.floor(r))
  return [coarse, Math.max(0, Math.min(99, Math.round((r - coarse) * 100)))]
}

/** Coarse and fine for a fixed frequency (1–9772 Hz): coarse picks the decade, fine the rest. */
export function fixedBytes(hz: number): [coarse: number, fine: number] {
  const decade = Math.max(0, Math.min(3, Math.floor(Math.log10(Math.max(1, hz)))))
  return [decade * 8, Math.max(0, Math.min(99, Math.round(100 * Math.log10(hz / 10 ** decade))))]
}
