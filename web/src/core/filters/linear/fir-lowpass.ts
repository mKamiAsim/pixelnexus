/**
 * Low-pass FIR filter by the window method. Catalog entry: catalog/filters/linear/fir-lowpass.yaml.
 *
 * For N taps (N odd), center M = (N - 1) / 2 and cutoff f_c in cycles per pixel:
 *
 *   h[n] = 2 f_c sinc(2 f_c (n - M)) w[n],  then h is divided by its sum,
 *
 * where sinc(x) = sin(pi x) / (pi x). The division makes the gain at frequency 0 exactly 1, as
 * scipy.signal.firwin does with scale=True. The windows are the symmetric ones of
 * scipy.signal.get_window. The 2D filter is separable: the same 1D taps along rows and columns.
 */
import { correlateSeparable } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export type FirWindow = "hamming" | "hann" | "blackman" | "kaiser";

/** The modified Bessel function of the first kind, order 0, by its power series. */
export function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x / 2) ** 2;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/** The symmetric window w[n] for n from 0 to N - 1. */
export function firWindow(window: FirWindow, taps: number, beta = 5): Float64Array {
  const n1 = taps - 1;
  return Float64Array.from({ length: taps }, (_, n) => {
    if (taps === 1) return 1;
    const c = (2 * Math.PI * n) / n1;
    switch (window) {
      case "hamming":
        return 0.54 - 0.46 * Math.cos(c);
      case "hann":
        return 0.5 - 0.5 * Math.cos(c);
      case "blackman":
        return 0.42 - 0.5 * Math.cos(c) + 0.08 * Math.cos(2 * c);
      case "kaiser": {
        const t = (2 * n) / n1 - 1;
        return besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t))) / besselI0(beta);
      }
    }
  });
}

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** The 1D taps h[n], adding up to 1. */
export function firTaps(taps: number, cutoff: number, window: FirWindow, beta = 5): Float64Array {
  if (!Number.isInteger(taps) || taps < 1 || taps % 2 === 0) {
    throw new RangeError("The number of taps must be a positive odd integer.");
  }
  if (!(cutoff > 0 && cutoff <= 0.5)) throw new RangeError("The cutoff must be in (0, 0.5].");
  const m = (taps - 1) / 2;
  const w = firWindow(window, taps, beta);
  const h = Float64Array.from(
    { length: taps },
    (_, n) => 2 * cutoff * sinc(2 * cutoff * (n - m)) * (w[n] ?? 0),
  );
  let sum = 0;
  for (const v of h) sum += v;
  for (let n = 0; n < taps; n++) h[n] = (h[n] ?? 0) / sum;
  return h;
}

const tapsOf = (params: Params) => read.number(params, "taps", 15);
const cutoffOf = (params: Params) => read.number(params, "cutoff", 0.15);
const windowOf = (params: Params) => read.string<FirWindow>(params, "window", "hamming");
const betaOf = (params: Params) => read.number(params, "beta", 5);
const tapsFor = (params: Params) =>
  firTaps(tapsOf(params), cutoffOf(params), windowOf(params), betaOf(params));

export const firLowpassFilter: PlaneFilter = {
  id: "fir-lowpass",
  kind: "smooth",
  // The taps can be negative, so alpha weighting, which needs positive weights, is off.
  alphaWeighted: false,
  radius: (params) => (tapsOf(params) - 1) >> 1,
  plane: (input, params, context) => {
    const h = tapsFor(params);
    return correlateSeparable(input, h, h, context.border);
  },
  representation: (params) => {
    const h = Array.from(tapsFor(params));
    const r = (h.length - 1) >> 1;
    return {
      kind: "kernels",
      kernels: [
        {
          name: "H",
          rows: h.map((a) => h.map((b) => a * b)),
          anchor: { x: r, y: r },
          normalized: true,
          separable: { column: h, row: h },
          note: "The 2D kernel is the outer product of the 1D taps. Some taps are negative.",
        },
      ],
    };
  },
};
