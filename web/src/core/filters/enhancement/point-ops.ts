/**
 * Point operations with a fixed curve: each output value depends only on the input value.
 * Catalog entries: catalog/filters/enhancement/{log-transform,contrast-stretch,invert}.yaml and
 * catalog/filters/artistic/{posterize,solarize}.yaml.
 *
 * - Log transformation: T(r) = c ln(1 + r) with c = 255 / ln 256, so 0 stays 0 and 255 stays
 *   255 (Gonzalez and Woods).
 * - Contrast stretching: the piecewise-linear curve of Gonzalez and Woods through (0, 0),
 *   (r1, s1), (r2, s2) and (255, 255). When r1 is above r2 the two points swap. With r1 = r2,
 *   s1 = 0 and s2 = 255 it is a threshold.
 * - Invert: T(r) = 255 - r.
 * - Posterize: n equal bins of width 256 / n, each mapped to one of n evenly spaced levels from
 *   0 to 255. This bin rule is PixelNexus's own. Other programs round differently.
 * - Solarize: values at or above the threshold are inverted, as in Pillow's ImageOps.solarize.
 */
import { read, type Params, type PointFilter } from "@/core/filters/types";

const curve = (transfer: (value: number) => number) => ({
  kind: "curve" as const,
  values: Array.from({ length: 256 }, (_, v) => transfer(v)),
});

const LOG_SCALE = 255 / Math.log(256);

export function logTransfer(): (value: number) => number {
  return (value) => LOG_SCALE * Math.log1p(Math.max(0, value));
}

export const logTransformFilter: PointFilter = {
  id: "log-transform",
  kind: "point",
  radius: () => 0,
  transfer: () => logTransfer(),
  representation: () => curve(logTransfer()),
};

/** The piecewise-linear stretch through (0, 0), (r1, s1), (r2, s2) and (255, 255). */
export function stretchTransfer(
  r1: number,
  s1: number,
  r2: number,
  s2: number,
): (value: number) => number {
  const [a, sa, b, sb] = r1 <= r2 ? [r1, s1, r2, s2] : [r2, s2, r1, s1];
  return (r) => {
    if (r <= a) return a > 0 ? (sa * r) / a : sa;
    if (r <= b) return sa + ((sb - sa) * (r - a)) / (b - a);
    return b < 255 ? sb + ((255 - sb) * (r - b)) / (255 - b) : sb;
  };
}

const stretchOf = (params: Params) =>
  stretchTransfer(
    read.number(params, "r1", 64),
    read.number(params, "s1", 32),
    read.number(params, "r2", 192),
    read.number(params, "s2", 224),
  );

export const contrastStretchFilter: PointFilter = {
  id: "contrast-stretch",
  kind: "point",
  radius: () => 0,
  transfer: stretchOf,
  representation: (params) => curve(stretchOf(params)),
};

export const invertTransfer = (value: number) => 255 - value;

export const invertFilter: PointFilter = {
  id: "invert",
  kind: "point",
  radius: () => 0,
  transfer: () => invertTransfer,
  representation: () => curve(invertTransfer),
};

export function posterizeTransfer(levels: number): (value: number) => number {
  const n = Math.max(2, Math.round(levels));
  return (value) => {
    const bin = Math.min(n - 1, Math.max(0, Math.floor((value * n) / 256)));
    return (bin * 255) / (n - 1);
  };
}

const posterizeOf = (params: Params) => posterizeTransfer(read.number(params, "levels", 4));

export const posterizeFilter: PointFilter = {
  id: "posterize",
  kind: "point",
  radius: () => 0,
  transfer: posterizeOf,
  representation: (params) => curve(posterizeOf(params)),
};

export function solarizeTransfer(threshold: number): (value: number) => number {
  return (value) => (value < threshold ? value : 255 - value);
}

const solarizeOf = (params: Params) => solarizeTransfer(read.number(params, "threshold", 128));

export const solarizeFilter: PointFilter = {
  id: "solarize",
  kind: "point",
  radius: () => 0,
  transfer: solarizeOf,
  representation: (params) => curve(solarizeOf(params)),
};
