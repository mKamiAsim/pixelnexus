/**
 * Median absolute deviation thresholding, the Hampel identifier. Catalog entry:
 * catalog/filters/adaptive/mad-outlier.yaml.
 *
 * For each channel, m is the median of the window and S = 1.4826 MAD, where MAD is the median of
 * the distances |w - m| over the window. The factor 1 / Phi^-1(3/4) = 1.4826 makes S estimate the
 * standard deviation of Gaussian noise. A value is an outlier when |z - m| > t S (Hampel, 1974;
 * Pearson and others, 2016). Repair replaces outliers by m. Mark shows white where any channel is
 * an outlier and black elsewhere.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";
import { medianOf } from "@/core/filters/restoration/dead-pixel";

/** 1 / Phi^-1(3/4), the same constant as scipy.stats.median_abs_deviation(scale="normal"). */
export const MAD_SCALE = 1.482602218505602;

const sizeOf = (params: Params) => read.number(params, "size", 5);
const tOf = (params: Params) => read.number(params, "t", 3);

/** The median m and the scaled MAD S of each window of one plane. */
export function medianAndScale(
  plane: Plane,
  size: number,
  border: BorderMode,
): { median: Float64Array; scale: Float64Array } {
  const { width, height, data } = plane;
  const radius = (size - 1) >> 1;
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const n = size * size;
  const window = new Float64Array(n);
  const spread = new Float64Array(n);
  const median = new Float64Array(width * height);
  const scale = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let k = 0;
      for (let j = 0; j < size; j++) {
        const sy = ys[y + j] ?? -1;
        for (let i = 0; i < size; i++) {
          const sx = xs[x + i] ?? -1;
          window[k++] = sx < 0 || sy < 0 ? 0 : (data[sy * width + sx] ?? 0);
        }
      }
      const m = medianOf(window, n);
      for (let q = 0; q < n; q++) spread[q] = Math.abs((window[q] ?? 0) - m);
      median[y * width + x] = m;
      scale[y * width + x] = MAD_SCALE * medianOf(spread, n);
    }
  }
  return { median, scale };
}

export const madOutlierFilter: ColorFilter = {
  id: "mad-outlier",
  kind: "color",
  radius: (params) => (sizeOf(params) - 1) >> 1,
  color: (planes, params, { border }) => {
    const size = sizeOf(params);
    const t = tOf(params);
    const mark = read.string<"repair" | "mark">(params, "output", "repair") === "mark";
    const stats = planes.map((p) => medianAndScale(p, size, border));
    const { width, height } = planes[0];
    const out = [
      createPlane(width, height),
      createPlane(width, height),
      createPlane(width, height),
    ];
    for (let i = 0; i < width * height; i++) {
      const outlier = planes.map(
        (p, c) =>
          Math.abs((p.data[i] ?? 0) - (stats[c]?.median[i] ?? 0)) > t * (stats[c]?.scale[i] ?? 0),
      );
      const any = outlier.some(Boolean);
      out.forEach((plane, c) => {
        plane.data[i] = mark
          ? any
            ? 255
            : 0
          : outlier[c]
            ? (stats[c]?.median[i] ?? 0)
            : (planes[c].data[i] ?? 0);
      });
    }
    return out as [Plane, Plane, Plane];
  },
  representation: (params) => {
    const size = sizeOf(params);
    return {
      kind: "window",
      size,
      count: size * size,
      statistic: `|z_{xy} - m| > ${tOf(params)} \\cdot 1.4826 \\operatorname{median}_{w \\in W} |w - m|`,
      note: "m is the median of the window W. The right side is t times the scaled median absolute deviation, a robust estimate of the noise level. Values above it are outliers.",
    };
  },
};
