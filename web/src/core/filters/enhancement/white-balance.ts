/**
 * White balance and chromatic adaptation. Catalog entries:
 * catalog/filters/enhancement/{white-balance,gray-world,white-patch,chromatic-adaptation,
 * temperature-tint}.yaml.
 *
 * The first three scale each channel by a gain, in linear light unless Linear light is off:
 *
 * - White balance: the gains turn a chosen neutral color into the gray of the same luminance.
 * - Gray world (Buchsbaum): the gains make the mean of each channel equal the mean of the three
 *   means, over the whole image.
 * - White patch: the gains bring the chosen percentile of each channel to white. Percentile 100
 *   is max-RGB. Percentiles use the linear rule of numpy.percentile on the levels 0 to 255.
 *
 * Chromatic adaptation and temperature and tint convert linear sRGB to XYZ, adapt the white with
 * a von Kries type transform, and convert back. See web/src/core/color/adaptation.ts.
 */
import {
  ILLUMINANTS,
  lightWhite,
  rgbAdaptation,
  type AdaptationMethod,
  type Illuminant,
  type Mat3,
  type Vec3,
} from "@/core/color/adaptation";
import { linearToSrgb, luma709, srgbToLinear } from "@/core/color/convert";
import { histogram256, histogramPercentile } from "@/core/filters/enhancement/histogram";
import { createPlane, type Plane } from "@/core/filters/planes";
import {
  perParams,
  read,
  type ColorFilter,
  type Params,
  type PixelFilter,
  type Representation,
} from "@/core/filters/types";

const linearOf = (params: Params) => read.boolean(params, "linearLight", true);

/** Scale one value by a gain, in linear light or on the encoded value. */
const scaled = (v: number, gain: number, linear: boolean) =>
  linear ? linearToSrgb(gain * srgbToLinear(v)) : gain * v;

const fmt = (v: number) => String(Number(v.toFixed(4)));

function gainStages(gains: Vec3 | null, linear: boolean, how: string): Representation {
  return {
    kind: "stages",
    stages: [
      {
        name: "Gains",
        formula: gains
          ? `(g_R, g_G, g_B) = (${gains.map(fmt).join(",\\ ")})`
          : "(g_R, g_G, g_B)\\ \\text{from the image}",
        note: how,
      },
      {
        name: "Scale",
        formula: linear
          ? "C' = \\operatorname{srgb}\\left(g_C \\cdot \\operatorname{lin}(C)\\right)"
          : "C' = g_C \\cdot C",
        note: linear
          ? "In linear light: decode sRGB, scale, encode again."
          : "On the encoded sRGB values.",
      },
    ],
  };
}

// White balance with a picked neutral -----------------------------------------------------

/** Parse #rrggbb. Returns null for anything else. */
export function parseHexColor(text: string): Vec3 | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text.trim());
  return m
    ? [parseInt(m[1] ?? "0", 16), parseInt(m[2] ?? "0", 16), parseInt(m[3] ?? "0", 16)]
    : null;
}

/** The gains that turn the neutral color into the gray of its own luminance. */
export function neutralGains(neutral: Vec3, linear: boolean): Vec3 {
  const n = linear ? (neutral.map((c) => srgbToLinear(c)) as unknown as Vec3) : neutral;
  const y = linear ? 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2] : luma709(...n);
  return n.map((c) => (c > 0 ? y / c : 1)) as unknown as Vec3;
}

const neutralOf = (params: Params) =>
  parseHexColor(read.string(params, "neutral", "#d2c8b4")) ?? ([210, 200, 180] as const);

const neutralGainsOf = perParams((params) => neutralGains(neutralOf(params), linearOf(params)));

export const whiteBalanceFilter: PixelFilter = {
  id: "white-balance",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => {
    const linear = linearOf(params);
    const gains = neutralGainsOf(params);
    out[0] = scaled(r, gains[0], linear);
    out[1] = scaled(g, gains[1], linear);
    out[2] = scaled(b, gains[2], linear);
  },
  representation: (params) =>
    gainStages(
      neutralGains(neutralOf(params), linearOf(params)),
      linearOf(params),
      "g_C = Y_n / n_C, so the neutral color n becomes the gray of its own luminance Y_n.",
    ),
};

// Gray world and white patch ------------------------------------------------------------------

function applyGains(planes: readonly [Plane, Plane, Plane], gains: Vec3, linear: boolean) {
  return planes.map((p, c) => {
    const out = createPlane(p.width, p.height);
    for (let i = 0; i < p.data.length; i++)
      out.data[i] = scaled(p.data[i] ?? 0, gains[c] ?? 1, linear);
    return out;
  }) as [Plane, Plane, Plane];
}

/** Gains that make each channel mean equal the mean of the three means. */
export function grayWorldGains(planes: readonly [Plane, Plane, Plane], linear: boolean): Vec3 {
  const means = planes.map((p) => {
    let sum = 0;
    for (const v of p.data) sum += linear ? srgbToLinear(v) : v;
    return p.data.length > 0 ? sum / p.data.length : 0;
  });
  const gray = ((means[0] ?? 0) + (means[1] ?? 0) + (means[2] ?? 0)) / 3;
  return means.map((m) => (m > 0 ? gray / m : 1)) as unknown as Vec3;
}

/** Gains that bring the given percentile of each channel to white. */
export function whitePatchGains(
  planes: readonly [Plane, Plane, Plane],
  percentile: number,
  linear: boolean,
): Vec3 {
  return planes.map((p) => {
    const top = histogramPercentile(histogram256(p), percentile);
    const level = linear ? srgbToLinear(top) : top / 255;
    return level > 0 ? 1 / level : 1;
  }) as unknown as Vec3;
}

export const grayWorldFilter: ColorFilter = {
  id: "gray-world",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) =>
    applyGains(planes, grayWorldGains(planes, linearOf(params)), linearOf(params)),
  representation: (params) =>
    gainStages(
      null,
      linearOf(params),
      "g_C = mean of the three channel means / mean of channel C, over the whole image.",
    ),
};

export const whitePatchFilter: ColorFilter = {
  id: "white-patch",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) =>
    applyGains(
      planes,
      whitePatchGains(planes, read.number(params, "percentile", 99), linearOf(params)),
      linearOf(params),
    ),
  representation: (params) =>
    gainStages(
      null,
      linearOf(params),
      `g_C = 1 / P_{${read.number(params, "percentile", 99)}}(C), with the percentile as a fraction of white.`,
    ),
};

// Chromatic adaptation ------------------------------------------------------------------------

function matrixStages(m: Mat3, note: string): Representation {
  const rows = m.map((row) => row.map(fmt).join(" & ")).join(" \\\\ ");
  return {
    kind: "stages",
    stages: [
      {
        name: "Adaptation in linear sRGB",
        formula: `\\begin{bmatrix} R' \\\\ G' \\\\ B' \\end{bmatrix}_{\\text{lin}} = \\begin{bmatrix} ${rows} \\end{bmatrix} \\begin{bmatrix} R \\\\ G \\\\ B \\end{bmatrix}_{\\text{lin}}`,
        note,
      },
    ],
  };
}

function applyLinearMatrix(m: Mat3, r: number, g: number, b: number, out: Float64Array) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  for (let i = 0; i < 3; i++) {
    const row = m[i] ?? [0, 0, 0];
    out[i] = linearToSrgb(row[0] * lr + row[1] * lg + row[2] * lb);
  }
}

const adaptationOf = perParams((params) =>
  rgbAdaptation(
    ILLUMINANTS[read.string<Illuminant>(params, "source", "A")] ?? ILLUMINANTS.A,
    ILLUMINANTS[read.string<Illuminant>(params, "target", "D65")] ?? ILLUMINANTS.D65,
    read.string<AdaptationMethod>(params, "method", "bradford"),
  ),
);

export const chromaticAdaptationFilter: PixelFilter = {
  id: "chromatic-adaptation",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => applyLinearMatrix(adaptationOf(params), r, g, b, out),
  representation: (params) =>
    matrixStages(
      adaptationOf(params),
      "M = M_XYZ^-1 M_A^-1 diag(target / source) M_A M_XYZ, with the cone matrix M_A of the method.",
    ),
};

const lightOf = perParams((params) =>
  rgbAdaptation(
    lightWhite(read.number(params, "temperature", 4500), read.number(params, "tint", 0) / 1000),
    ILLUMINANTS.D65,
    "bradford",
  ),
);

export const temperatureTintFilter: PixelFilter = {
  id: "temperature-tint",
  kind: "pixel",
  radius: () => 0,
  pixel: (r, g, b, params, out) => applyLinearMatrix(lightOf(params), r, g, b, out),
  representation: (params) =>
    matrixStages(
      lightOf(params),
      "Bradford adaptation from the white of the scene light, at the temperature and tint, to D65.",
    ),
};
