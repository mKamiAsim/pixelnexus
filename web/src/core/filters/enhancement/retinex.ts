/**
 * Retinex. Catalog entries: catalog/filters/enhancement/{retinex-ssr,retinex-msr,msrcr}.yaml.
 *
 * Follows Petro, Sbert and Morel, "Multiscale Retinex" (IPOL 2014), after Jobson, Rahman and
 * Woodell:
 *
 * - Single-scale Retinex: R = log(I) - log(G_sigma * I) on each channel.
 * - Multi-scale Retinex: the mean of R over the scales, with equal weights.
 * - Color restoration (MSRCR): MSR_c (log(alpha I_c) - log(I_R + I_G + I_B)).
 * - Intensity mode (their MSRCP): the Retinex of the intensity (R + G + B) / 3 is balanced, and
 *   each pixel keeps its color: the channels are scaled by A = min(255 / max(R, G, B), I_1 / I).
 * - The result is stretched to 0..255 by Simplest Color Balance (Limare and colleagues, IPOL
 *   2011), which clips s1 percent of the values at the bottom and s2 percent at the top.
 *
 * The Gaussian is the exact continuous one applied to the image extended by mirroring to twice
 * its size (their Algorithm 3). It runs on rows and then on columns, which is the same, since
 * the Gaussian and the mirrored extension both factor into the two axes.
 *
 * Two rules are PixelNexus's own, because the article does not say: logs are taken of I + 1, so
 * black pixels have a finite log, and a result with no spread (Vmax - Vmin at most 1e-9) becomes
 * 127.5.
 */
import { fftFrequencies } from "@/core/filters/frequency/spectral";
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params, type Representation } from "@/core/filters/types";
import { fft } from "@/core/math/fft";

type Planes = readonly [Plane, Plane, Plane];

/**
 * Blur `count` lines of `length` values in place. Line j starts at j * lineStep and its values
 * are `step` apart. Each line is extended to twice its length by mirroring (x_0 .. x_n-1,
 * x_n-1 .. x_0), so the FFT sees an even periodic signal, and its spectrum is multiplied by
 * exp(-2 pi^2 sigma^2 f^2), the Fourier transform of the Gaussian. Two lines go through one
 * complex FFT as its real and imaginary parts: the gains are real and even, so each line comes
 * back on its own part.
 */
function blurLines(
  data: Float64Array,
  length: number,
  count: number,
  step: number,
  lineStep: number,
  sigma: number,
): void {
  const n = 2 * length;
  const c = 2 * Math.PI * Math.PI * sigma * sigma;
  const gains = fftFrequencies(n).map((f) => Math.exp(-c * f * f) / n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let j = 0; j < count; j += 2) {
    const a = j * lineStep;
    const b = a + lineStep;
    const second = j + 1 < count;
    for (let i = 0; i < length; i++) {
      const va = data[a + i * step] ?? 0;
      const vb = second ? (data[b + i * step] ?? 0) : 0;
      re[i] = va;
      re[n - 1 - i] = va;
      im[i] = vb;
      im[n - 1 - i] = vb;
    }
    fft(re, im);
    for (let k = 0; k < n; k++) {
      const g = gains[k] ?? 0;
      re[k] = (re[k] ?? 0) * g;
      im[k] = (im[k] ?? 0) * g;
    }
    fft(re, im, true);
    for (let i = 0; i < length; i++) {
      data[a + i * step] = re[i] ?? 0;
      if (second) data[b + i * step] = im[i] ?? 0;
    }
  }
}

/** The exact Gaussian blur of a width x height grid of values, on its mirrored extension. */
export function mirrorGaussian(
  values: Float64Array,
  width: number,
  height: number,
  sigma: number,
): Float64Array {
  const out = Float64Array.from(values);
  blurLines(out, width, height, 1, width, sigma);
  blurLines(out, height, width, width, 1, sigma);
  return out;
}

/** The mean over the scales of log(v + 1) - log(G_sigma * (v + 1)). */
export function multiscaleRetinex(
  values: Float64Array,
  width: number,
  height: number,
  sigmas: readonly number[],
): Float64Array {
  const shifted = values.map((v) => v + 1);
  const logs = shifted.map(Math.log);
  const out = new Float64Array(values.length);
  for (const sigma of sigmas) {
    const blurred = mirrorGaussian(shifted, width, height, sigma);
    for (let i = 0; i < out.length; i++) {
      out[i] = (out[i] ?? 0) + ((logs[i] ?? 0) - Math.log(blurred[i] ?? 1)) / sigmas.length;
    }
  }
  return out;
}

/** The k-th smallest value (from 0) of `a`, which is reordered. Hoare's quickselect. */
function select(a: Float64Array, k: number): number {
  let left = 0;
  let right = a.length - 1;
  while (right > left) {
    const x = a[left] ?? 0;
    const y = a[(left + right) >> 1] ?? 0;
    const z = a[right] ?? 0;
    const pivot = Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
    let i = left;
    let j = right;
    while (i <= j) {
      while ((a[i] ?? 0) < pivot) i++;
      while ((a[j] ?? 0) > pivot) j--;
      if (i <= j) {
        const t = a[i] ?? 0;
        a[i] = a[j] ?? 0;
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) right = j;
    else if (k >= i) left = i;
    else break;
  }
  return a[k] ?? 0;
}

/**
 * The saturation extrema of Simplest Color Balance: the values at positions floor(N s1 / 100)
 * and floor(N (100 - s2) / 100) - 1 of the sorted values.
 */
export function balanceRange(values: Float64Array, low: number, high: number): [number, number] {
  const n = values.length;
  if (n === 0) return [0, 0];
  const copy = Float64Array.from(values);
  const lo = Math.min(n - 1, Math.max(0, Math.floor((n * low) / 100)));
  const hi = Math.min(n - 1, Math.max(lo, Math.floor((n * (100 - high)) / 100) - 1));
  const vmin = select(copy, lo);
  return [vmin, select(copy, hi)];
}

/**
 * A spread this small is rounding noise of the FFT, for example the Retinex of a flat image,
 * which is 0 up to about 1e-15. Stretching it would turn the noise into full contrast.
 */
export const MIN_SPREAD = 1e-9;

/** Simplest Color Balance: clip to [Vmin, Vmax] and stretch to 0..255. */
export function simplestColorBalance(
  values: Float64Array,
  low: number,
  high: number,
): Float64Array {
  const [vmin, vmax] = balanceRange(values, low, high);
  if (!(vmax - vmin > MIN_SPREAD)) return values.map(() => 127.5);
  const scale = 255 / (vmax - vmin);
  return values.map((v) => (Math.min(Math.max(v, vmin), vmax) - vmin) * scale);
}

const toPlane = (like: Plane, values: Float64Array): Plane => {
  const out = createPlane(like.width, like.height);
  out.data.set(values);
  return out;
};

const lowOf = (params: Params) => read.number(params, "clipLow", 1);
const highOf = (params: Params) => read.number(params, "clipHigh", 1);

/** Retinex on each channel, with an optional factor per channel and pixel before balancing. */
function channelRetinex(
  planes: Planes,
  sigmas: readonly number[],
  params: Params,
  factor?: (channel: number, i: number) => number,
): [Plane, Plane, Plane] {
  return planes.map((plane, c) => {
    const msr = multiscaleRetinex(Float64Array.from(plane.data), plane.width, plane.height, sigmas);
    if (factor) for (let i = 0; i < msr.length; i++) msr[i] = (msr[i] ?? 0) * factor(c, i);
    return toPlane(plane, simplestColorBalance(msr, lowOf(params), highOf(params)));
  }) as [Plane, Plane, Plane];
}

/** Retinex of the intensity, with each pixel's chromaticity kept (MSRCP). */
function intensityRetinex(
  planes: Planes,
  sigmas: readonly number[],
  params: Params,
): [Plane, Plane, Plane] {
  const [r, g, b] = planes.map((p) => p.data);
  const { width, height } = planes[0];
  const intensity = Float64Array.from(
    { length: width * height },
    (_, i) => ((r?.[i] ?? 0) + (g?.[i] ?? 0) + (b?.[i] ?? 0)) / 3,
  );
  const balanced = simplestColorBalance(
    multiscaleRetinex(intensity, width, height, sigmas),
    lowOf(params),
    highOf(params),
  );
  const out = planes.map((p) => createPlane(p.width, p.height));
  for (let i = 0; i < intensity.length; i++) {
    const level = intensity[i] ?? 0;
    const top = Math.max(r?.[i] ?? 0, g?.[i] ?? 0, b?.[i] ?? 0);
    const a = level > 0 && top > 0 ? Math.min(255 / top, (balanced[i] ?? 0) / level) : 0;
    planes.forEach((p, c) => {
      const target = out[c];
      if (target) target.data[i] = a * (p.data[i] ?? 0);
    });
  }
  return out as [Plane, Plane, Plane];
}

const intensityMode = (params: Params) =>
  read.string<"channels" | "intensity">(params, "apply", "channels") === "intensity";

const sigmasOf = (params: Params) => [
  read.number(params, "sigma1", 15),
  read.number(params, "sigma2", 80),
  read.number(params, "sigma3", 250),
];

const balanceStage = (params: Params) => ({
  name: "Simplest color balance",
  formula: `I_{\\text{out}} = 255\\, \\frac{\\min(\\max(R, V_{\\min}), V_{\\max}) - V_{\\min}}{V_{\\max} - V_{\\min}}`,
  note: `V_min and V_max cut ${lowOf(params)} % of the values at the bottom and ${highOf(params)} % at the top, over the whole image.`,
});

const intensityStage = {
  name: "Keep the colors",
  formula:
    "A = \\min\\left(\\frac{255}{\\max(R, G, B)},\\ \\frac{I_1}{I}\\right),\\quad C_{\\text{out}} = A\\, C",
  note: "I = (R + G + B) / 3 is the intensity and I_1 its balanced Retinex.",
};

function retinexStages(
  params: Params,
  retinex: { name: string; formula: string; note?: string },
  extra?: { name: string; formula: string; note?: string },
): Representation {
  const steps = [retinex, ...(extra ? [extra] : []), balanceStage(params)];
  if (intensityMode(params)) steps.push(intensityStage);
  return {
    kind: "stages",
    stages: steps,
    note: intensityMode(params)
      ? "Runs on the intensity (R + G + B) / 3. Logs are of I + 1."
      : "Runs on each channel. Logs are of I + 1.",
  };
}

const run = (planes: Planes, sigmas: readonly number[], params: Params) =>
  intensityMode(params)
    ? intensityRetinex(planes, sigmas, params)
    : channelRetinex(planes, sigmas, params);

export const retinexSsrFilter: ColorFilter = {
  id: "retinex-ssr",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => run(planes, [read.number(params, "sigma", 80)], params),
  representation: (params) =>
    retinexStages(params, {
      name: "Single-scale Retinex",
      formula: `R = \\log(I + 1) - \\log\\left(G_{\\sigma} * (I + 1)\\right),\\quad \\sigma = ${read.number(params, "sigma", 80)}`,
      note: "G is the Gaussian, applied to the image mirrored at its edges.",
    }),
};

export const retinexMsrFilter: ColorFilter = {
  id: "retinex-msr",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => run(planes, sigmasOf(params), params),
  representation: (params) =>
    retinexStages(params, {
      name: "Multi-scale Retinex",
      formula: `R = \\frac{1}{3} \\sum_{n=1}^{3} \\left[\\log(I + 1) - \\log\\left(G_{\\sigma_n} * (I + 1)\\right)\\right],\\quad \\sigma = ${sigmasOf(params).join(",\\ ")}`,
      note: "G is the Gaussian, applied to the image mirrored at its edges.",
    }),
};

export const msrcrFilter: ColorFilter = {
  id: "msrcr",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => {
    const alpha = read.number(params, "alpha", 125);
    const sum = Float64Array.from({ length: planes[0].data.length }, (_, i) =>
      planes.reduce((s, p) => s + (p.data[i] ?? 0) + 1, 0),
    );
    return channelRetinex(
      planes,
      sigmasOf(params),
      params,
      (c, i) => Math.log(alpha * ((planes[c]?.data[i] ?? 0) + 1)) - Math.log(sum[i] ?? 3),
    );
  },
  representation: (params) =>
    retinexStages(
      params,
      {
        name: "Multi-scale Retinex",
        formula: `R_c = \\frac{1}{3} \\sum_{n=1}^{3} \\left[\\log(I_c + 1) - \\log\\left(G_{\\sigma_n} * (I_c + 1)\\right)\\right],\\quad \\sigma = ${sigmasOf(params).join(",\\ ")}`,
      },
      {
        name: "Color restoration",
        formula: `R'_c = R_c \\left[\\log\\left(${read.number(params, "alpha", 125)}\\, (I_c + 1)\\right) - \\log \\sum_j (I_j + 1)\\right]`,
        note: "Jobson's gain beta and final gain and offset drop out, since the balance stretches each channel.",
      },
    ),
};
