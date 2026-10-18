/**
 * Bilateral tone mapping. Catalog entry: catalog/filters/enhancement/bilateral-tonemap.yaml.
 *
 * Follows Durand and Dorsey, "Fast bilateral filtering for the display of high-dynamic-range
 * images" (SIGGRAPH 2002), and the recipe on Durand's page for the paper:
 *
 * - Intensity I = (20 R + 40 G + B) / 61, and color ratios R / I, G / I, B / I.
 * - In log10: base = bilateral(log I), detail = log I - base.
 * - The base is scaled so that its range becomes log10 of the target contrast, and shifted so
 *   that its largest value becomes 0: out = base c + detail - max(base) c.
 * - Each channel is its ratio times 10^out.
 *
 * The bilateral filter is their piecewise-linear version (Fig. 10 and 12 of the paper): for
 * levels i_j spaced (max - min) / NB apart, with NB = (max - min) / sigma_r rounded up, the
 * normalized Gaussian blur J_j = G * (g_j I) / G * g_j with g_j = exp(-(I - i_j)^2 / 2 sigma_r^2)
 * is computed on the image sampled every z pixels, and each pixel mixes the two J_j nearest to
 * its value with hat weights. The Gaussian is the exact one on the mirrored image (see
 * retinex.ts), so the cost does not depend on sigma_s.
 *
 * PixelNexus's own choices, since the paper starts from high-dynamic-range radiance: the 8-bit
 * values are decoded to linear light first (an option), intensities below 1e-4 count as 1e-4,
 * sigma_s is a percent of the longer side, J_j is bilinearly upsampled, and where the weights
 * of a level vanish (G * g_j below 1e-10) J_j is that level itself.
 */
import { linearToSrgb, srgbToLinear } from "@/core/color/convert";
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

import { mirrorGaussian } from "./retinex";

/** The smallest intensity, so that black pixels have a finite log. */
export const MIN_INTENSITY = 1e-4;
/** Below this, the weights of a level count as 0. */
const MIN_WEIGHT = 1e-10;

/**
 * The piecewise-linear bilateral filter of Durand and Dorsey, with a Gaussian spatial kernel of
 * sigmaS pixels, a Gaussian range kernel of sigmaR, and the filtering on every z-th pixel.
 */
export function piecewiseBilateral(
  values: Float64Array,
  width: number,
  height: number,
  sigmaS: number,
  sigmaR: number,
  z: number,
): Float64Array {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const out = new Float64Array(values.length);
  if (!(hi - lo > 0)) {
    out.set(values);
    return out;
  }
  const segments = Math.max(1, Math.ceil((hi - lo) / sigmaR));
  const step = (hi - lo) / segments;
  const sw = Math.ceil(width / z);
  const sh = Math.ceil(height / z);
  const small = new Float64Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) small[y * sw + x] = values[y * z * width + x * z] ?? 0;
  }
  const weights = new Float64Array(sw * sh);
  const weighted = new Float64Array(sw * sh);
  const twoSr2 = 2 * sigmaR * sigmaR;
  for (let j = 0; j <= segments; j++) {
    const level = lo + j * step;
    for (let i = 0; i < small.length; i++) {
      const v = small[i] ?? 0;
      const g = Math.exp(-((v - level) ** 2) / twoSr2);
      weights[i] = g;
      weighted[i] = g * v;
    }
    const k = mirrorGaussian(weights, sw, sh, sigmaS / z);
    const h = mirrorGaussian(weighted, sw, sh, sigmaS / z);
    const filtered = h.map((v, i) => ((k[i] ?? 0) > MIN_WEIGHT ? v / (k[i] ?? 1) : level));
    for (let y = 0; y < height; y++) {
      const fy = y / z;
      const y0 = Math.floor(fy);
      const y1 = Math.min(y0 + 1, sh - 1);
      const ay = fy - y0;
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const t = 1 - Math.abs((values[p] ?? 0) - level) / step;
        if (t <= 0) continue;
        const fx = x / z;
        const x0 = Math.floor(fx);
        const x1 = Math.min(x0 + 1, sw - 1);
        const ax = fx - x0;
        const top = (filtered[y0 * sw + x0] ?? 0) * (1 - ax) + (filtered[y0 * sw + x1] ?? 0) * ax;
        const bottom =
          (filtered[y1 * sw + x0] ?? 0) * (1 - ax) + (filtered[y1 * sw + x1] ?? 0) * ax;
        out[p] = (out[p] ?? 0) + t * (top * (1 - ay) + bottom * ay);
      }
    }
  }
  return out;
}

export interface ToneSettings {
  readonly contrast: number;
  readonly spatial: number;
  readonly range: number;
  readonly downsample: number;
  readonly linearLight: boolean;
}

export const toneSettings = (params: Params): ToneSettings => ({
  contrast: read.number(params, "contrast", 5),
  spatial: read.number(params, "spatial", 2),
  range: read.number(params, "range", 0.4),
  downsample: Math.max(1, Math.round(read.number(params, "downsample", 4))),
  linearLight: read.boolean(params, "linearLight", true),
});

/** Tone map three planes of 0..255 values. */
export function bilateralTonemap(
  planes: readonly [Plane, Plane, Plane],
  settings: ToneSettings,
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const decode = (v: number) => (settings.linearLight ? srgbToLinear(v) : v / 255);
  const encode = (v: number) => (settings.linearLight ? linearToSrgb(v) : v * 255);
  const rgb = planes.map((p) => Float64Array.from(p.data, decode));
  const [r, g, b] = rgb;
  const intensity = Float64Array.from({ length: width * height }, (_, i) =>
    Math.max(MIN_INTENSITY, (20 * (r?.[i] ?? 0) + 40 * (g?.[i] ?? 0) + (b?.[i] ?? 0)) / 61),
  );
  const logs = intensity.map(Math.log10);
  const sigmaS = (settings.spatial / 100) * Math.max(width, height);
  const base = piecewiseBilateral(logs, width, height, sigmaS, settings.range, settings.downsample);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of base) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const factor = hi - lo > 1e-12 ? Math.log10(settings.contrast) / (hi - lo) : 1;
  return rgb.map((channel) => {
    const out = createPlane(width, height);
    for (let i = 0; i < out.data.length; i++) {
      const b0 = base[i] ?? 0;
      const level = b0 * factor + ((logs[i] ?? 0) - b0) - hi * factor;
      const value = ((channel[i] ?? 0) / (intensity[i] ?? 1)) * 10 ** level;
      out.data[i] = encode(Math.min(1, Math.max(0, value)));
    }
    return out;
  }) as [Plane, Plane, Plane];
}

export const bilateralTonemapFilter: ColorFilter = {
  id: "bilateral-tonemap",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => bilateralTonemap(planes, toneSettings(params)),
  representation: (params) => {
    const s = toneSettings(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Intensity and color",
          formula: "I = \\frac{20 R + 40 G + B}{61},\\quad (r, g, b) = \\frac{(R, G, B)}{I}",
          note: s.linearLight ? "On linear light values." : "On the encoded values over 255.",
        },
        {
          name: "Base and detail",
          formula: `B = \\operatorname{bilateral}(\\log_{10} I),\\quad D = \\log_{10} I - B,\\quad \\sigma_s = ${s.spatial}\\,\\%,\\ \\sigma_r = ${s.range}`,
          note: `Piecewise-linear bilateral filter on every ${s.downsample}th pixel.`,
        },
        {
          name: "Compress the base",
          formula: `O = c\\, B + D - c \\max B,\\quad c = \\frac{\\log_{10} ${s.contrast}}{\\max B - \\min B}`,
        },
        {
          name: "Put the color back",
          formula: "(R', G', B') = (r, g, b)\\, 10^{O}",
          note: "Clipped to 0 to 1 and encoded back.",
        },
      ],
    };
  },
};
