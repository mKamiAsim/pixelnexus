/**
 * Bilateral filter (Tomasi and Manduchi, 1998). Catalog entry: catalog/filters/nonlinear/bilateral.yaml.
 *
 * Each output is a weighted mean of the window. A weight is the product of a spatial Gaussian,
 * which falls with the distance to the center, and a range Gaussian, which falls with the
 * difference in value to the center:
 *
 *   w(p, q) = exp(-|p - q|^2 / (2 sigma_s^2)) exp(-d(I_p, I_q)^2 / (2 sigma_r^2))
 *
 * The window is the disk of radius ceil(3 sigma_s), as in OpenCV's bilateralFilter. In the
 * channel mode, d is the difference within each channel, and each channel gets its own weights.
 * In the color mode, d is the Euclidean distance between RGB colors, and all channels share the
 * weights, the vector bilateral filter. A guide plane, as in the joint bilateral filter, replaces
 * the image in d.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

export type RangeMode = "channel" | "color";

export const sigmaSpaceOf = (params: Params) => read.number(params, "sigmaSpace", 3);
export const sigmaRangeOf = (params: Params) => read.number(params, "sigmaRange", 30);

/** The window radius: 3 sigma_s, rounded up. */
export const bilateralRadius = (sigmaSpace: number) => Math.max(1, Math.ceil(3 * sigmaSpace));

/** Window offsets inside the disk, with their spatial weights. */
export function spatialTaps(sigmaSpace: number): { dx: number; dy: number; w: number }[] {
  const r = bilateralRadius(sigmaSpace);
  const taps: { dx: number; dy: number; w: number }[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      taps.push({ dx, dy, w: Math.exp(-d2 / (2 * sigmaSpace * sigmaSpace)) });
    }
  }
  return taps;
}

/**
 * The weights at one pixel, for the Weight viewer. `window` holds values (or distances, for
 * the color mode, as the value difference) row by row around the center, of side 2r + 1.
 */
export function bilateralWeights(
  differences: readonly (readonly number[])[],
  sigmaSpace: number,
  sigmaRange: number,
): { spatial: number[][]; range: number[][]; combined: number[][] } {
  const r = (differences.length - 1) >> 1;
  const spatial = differences.map((row, j) =>
    row.map((_, i) => {
      const d2 = (i - r) ** 2 + (j - r) ** 2;
      return d2 > r * r ? 0 : Math.exp(-d2 / (2 * sigmaSpace * sigmaSpace));
    }),
  );
  const range = differences.map((row) =>
    row.map((d) => Math.exp(-(d * d) / (2 * sigmaRange * sigmaRange))),
  );
  const product = spatial.map((row, j) => row.map((s, i) => s * (range[j]?.[i] ?? 0)));
  const total = product.flat().reduce((a, b) => a + b, 0);
  return { spatial, range, combined: product.map((row) => row.map((v) => v / total)) };
}

/** True when every value is a whole number from 0 to 255, as in planes read from 8-bit images. */
function bytesOnly(planes: readonly Plane[]): boolean {
  for (const plane of planes) {
    for (const v of plane.data) if (!Number.isInteger(v) || v < 0 || v > 255) return false;
  }
  return true;
}

/**
 * The bilateral sum on three planes. `guide` holds the planes that set the range weights: the
 * image itself, or a guide image for the joint bilateral filter.
 *
 * Speed (measured at 25 s for a 4096 x 4096 image): when the guide holds whole
 * numbers from 0 to 255, the range weights come from a table of Math.exp at every possible
 * difference, and pixels away from the border read their window by fixed offsets. Both give the
 * same numbers in the same order as the plain loop, bilateralPlanesReference, so the result is
 * identical. The tests check that.
 */
export function bilateralPlanes(
  planes: readonly [Plane, Plane, Plane],
  guide: readonly Plane[],
  mode: RangeMode,
  sigmaSpace: number,
  sigmaRange: number,
  border: BorderMode,
): [Plane, Plane, Plane] {
  if (!bytesOnly(guide)) {
    return bilateralPlanesReference(planes, guide, mode, sigmaSpace, sigmaRange, border);
  }
  const { width, height } = planes[0];
  const taps = spatialTaps(sigmaSpace);
  const r = bilateralRadius(sigmaSpace);
  const rangeCoeff = -1 / (2 * sigmaRange * sigmaRange);
  // The range weight for every possible squared difference.
  const maxD2 = mode === "color" ? guide.length * 255 * 255 : 255 * 255;
  const table = new Float64Array(maxD2 + 1);
  if (mode === "color") {
    for (let d2 = 0; d2 <= maxD2; d2++) table[d2] = Math.exp(d2 * rangeCoeff);
  } else {
    // The plain loop computes exp(d * d * c), so the table does too, at d = 0 to 255.
    for (let d = 0; d <= 255; d++) table[d * d] = Math.exp(d * d * rangeCoeff);
  }
  const count = taps.length;
  const tapW = Float64Array.from(taps, (t) => t.w);
  const tapOffset = Int32Array.from(taps, (t) => t.dy * width + t.dx);
  const xs = borderTable(width, r, border);
  const ys = borderTable(height, r, border);
  const p0 = planes[0].data;
  const p1 = planes[1].data;
  const p2 = planes[2].data;
  const g0 = (guide[0] as Plane).data;
  const g1 = (guide[Math.min(1, guide.length - 1)] as Plane).data;
  const g2 = (guide[Math.min(2, guide.length - 1)] as Plane).data;
  const out = [createPlane(width, height), createPlane(width, height), createPlane(width, height)];
  const o0 = (out[0] as Plane).data;
  const o1 = (out[1] as Plane).data;
  const o2 = (out[2] as Plane).data;
  const indices = new Int32Array(count);
  const guides = guide.length;
  for (let y = 0; y < height; y++) {
    const insideY = y >= r && y < height - r;
    for (let x = 0; x < width; x++) {
      const center = y * width + x;
      if (insideY && x >= r && x < width - r) {
        for (let t = 0; t < count; t++) indices[t] = center + (tapOffset[t] ?? 0);
      } else {
        for (let t = 0; t < count; t++) {
          const sx = xs[x + (taps[t]?.dx ?? 0) + r] ?? -1;
          const sy = ys[y + (taps[t]?.dy ?? 0) + r] ?? -1;
          indices[t] = sx < 0 || sy < 0 ? -1 : sy * width + sx;
        }
      }
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let t0 = 0;
      let t1 = 0;
      let t2 = 0;
      const c0 = g0[center] ?? 0;
      const c1 = g1[center] ?? 0;
      const c2 = g2[center] ?? 0;
      // Outside the image with the constant border, every value is 0. Inside, indices are >= 0.
      const edge = !(insideY && x >= r && x < width - r);
      if (mode === "color") {
        for (let t = 0; t < count; t++) {
          const i = indices[t] ?? -1;
          const out = edge && i < 0;
          const q0 = out ? 0 : (g0[i] ?? 0);
          let d2 = (q0 - c0) ** 2;
          if (guides > 1) d2 += ((out ? 0 : (g1[i] ?? 0)) - c1) ** 2;
          if (guides > 2) d2 += ((out ? 0 : (g2[i] ?? 0)) - c2) ** 2;
          const weight = (tapW[t] ?? 0) * (table[d2] ?? 0);
          s0 += weight * (out ? 0 : (p0[i] ?? 0));
          s1 += weight * (out ? 0 : (p1[i] ?? 0));
          s2 += weight * (out ? 0 : (p2[i] ?? 0));
          t0 += weight;
        }
        t1 = t0;
        t2 = t0;
      } else {
        for (let t = 0; t < count; t++) {
          const i = indices[t] ?? -1;
          const out = edge && i < 0;
          const w = tapW[t] ?? 0;
          const d0 = (out ? 0 : (g0[i] ?? 0)) - c0;
          const d1 = (out ? 0 : (g1[i] ?? 0)) - c1;
          const d2 = (out ? 0 : (g2[i] ?? 0)) - c2;
          const w0 = w * (table[d0 * d0] ?? 0);
          const w1 = w * (table[d1 * d1] ?? 0);
          const w2 = w * (table[d2 * d2] ?? 0);
          s0 += w0 * (out ? 0 : (p0[i] ?? 0));
          s1 += w1 * (out ? 0 : (p1[i] ?? 0));
          s2 += w2 * (out ? 0 : (p2[i] ?? 0));
          t0 += w0;
          t1 += w1;
          t2 += w2;
        }
      }
      o0[center] = s0 / t0;
      o1[center] = s1 / t1;
      o2[center] = s2 / t2;
    }
  }
  return out as [Plane, Plane, Plane];
}

/** The plain loop, kept as the reference for the fast path and for guides with fractions. */
export function bilateralPlanesReference(
  planes: readonly [Plane, Plane, Plane],
  guide: readonly Plane[],
  mode: RangeMode,
  sigmaSpace: number,
  sigmaRange: number,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const taps = spatialTaps(sigmaSpace);
  const r = bilateralRadius(sigmaSpace);
  const xs = borderTable(width, r, border);
  const ys = borderTable(height, r, border);
  const index = (x: number, y: number) => {
    const sx = xs[x + r] ?? -1;
    const sy = ys[y + r] ?? -1;
    return sx < 0 || sy < 0 ? -1 : sy * width + sx;
  };
  const value = (plane: Plane | undefined, i: number) => (i < 0 ? 0 : (plane?.data[i] ?? 0));
  const rangeCoeff = -1 / (2 * sigmaRange * sigmaRange);
  const out = [createPlane(width, height), createPlane(width, height), createPlane(width, height)];
  const sums = new Float64Array(3);
  const totals = new Float64Array(3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = y * width + x;
      sums.fill(0);
      totals.fill(0);
      for (const { dx, dy, w } of taps) {
        const i = index(x + dx, y + dy);
        if (mode === "color") {
          let d2 = 0;
          for (const g of guide) d2 += (value(g, i) - value(g, center)) ** 2;
          const weight = w * Math.exp(d2 * rangeCoeff);
          for (let c = 0; c < 3; c++) {
            sums[c] = (sums[c] ?? 0) + weight * value(planes[c], i);
            totals[c] = (totals[c] ?? 0) + weight;
          }
        } else {
          for (let c = 0; c < 3; c++) {
            const g = guide[Math.min(c, guide.length - 1)];
            const d = value(g, i) - value(g, center);
            const weight = w * Math.exp(d * d * rangeCoeff);
            sums[c] = (sums[c] ?? 0) + weight * value(planes[c], i);
            totals[c] = (totals[c] ?? 0) + weight;
          }
        }
      }
      for (let c = 0; c < 3; c++) {
        (out[c] as Plane).data[center] = (sums[c] ?? 0) / (totals[c] ?? 1);
      }
    }
  }
  return out as [Plane, Plane, Plane];
}

const modeOf = (params: Params) => read.string<RangeMode>(params, "range", "channel");

export const bilateralFilter: ColorFilter = {
  id: "bilateral",
  kind: "color",
  radius: (params) => bilateralRadius(sigmaSpaceOf(params)),
  color: (planes, params, { border }) =>
    bilateralPlanes(
      planes,
      planes,
      modeOf(params),
      sigmaSpaceOf(params),
      sigmaRangeOf(params),
      border,
    ),
  representation: (params) => {
    const s = sigmaSpaceOf(params);
    const r = bilateralRadius(s);
    return {
      kind: "window",
      size: 2 * r + 1,
      count: spatialTaps(s).length,
      statistic: `\\frac{\\sum_q w_{pq} I_q}{\\sum_q w_{pq}},\\; w_{pq} = e^{-\\frac{\\lVert p - q \\rVert^2}{2 \\cdot ${s}^2}}\\, e^{-\\frac{d(I_p, I_q)^2}{2 \\cdot ${sigmaRangeOf(params)}^2}}`,
      note:
        modeOf(params) === "color"
          ? "The window is the disk of radius 3 sigma_s. d is the distance between RGB colors, so all channels share the weights. The Weight viewer shows the weights at any pixel."
          : "The window is the disk of radius 3 sigma_s. d is the difference within each channel, so each channel has its own weights. The Weight viewer shows the weights at any pixel.",
    };
  },
};

/** The luma plane 0.2126 R + 0.7152 G + 0.0722 B of three color planes. */
export function lumaPlane(planes: readonly [Plane, Plane, Plane]): Plane {
  const [r, g, b] = planes;
  const out = createPlane(r.width, r.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = 0.2126 * (r.data[i] ?? 0) + 0.7152 * (g.data[i] ?? 0) + 0.0722 * (b.data[i] ?? 0);
  }
  return out;
}

type GuideRange = "luma" | "color";
const guideRangeOf = (params: Params) => read.string<GuideRange>(params, "guideRange", "luma");

/**
 * Joint (cross) bilateral filter (Petschnigg and others, 2004; Eisemann and Durand, 2004).
 * Catalog entry: catalog/filters/nonlinear/joint-bilateral.yaml.
 *
 * The range weights come from a guide instead of the image: another open image of the same
 * size, or the luma of the image itself. All three channels share the weights.
 */
export const jointBilateralFilter: ColorFilter = {
  id: "joint-bilateral",
  kind: "color",
  radius: (params) => bilateralRadius(sigmaSpaceOf(params)),
  color: (planes, params, { border, guide }) => {
    const source = guide ?? planes;
    const guidePlanes = guideRangeOf(params) === "color" ? source : [lumaPlane(source)];
    return bilateralPlanes(
      planes,
      guidePlanes,
      "color",
      sigmaSpaceOf(params),
      sigmaRangeOf(params),
      border,
    );
  },
  representation: (params) => {
    const s = sigmaSpaceOf(params);
    const r = bilateralRadius(s);
    return {
      kind: "window",
      size: 2 * r + 1,
      count: spatialTaps(s).length,
      statistic: `\\frac{\\sum_q w_{pq} I_q}{\\sum_q w_{pq}},\\; w_{pq} = e^{-\\frac{\\lVert p - q \\rVert^2}{2 \\cdot ${s}^2}}\\, e^{-\\frac{d(G_p, G_q)^2}{2 \\cdot ${sigmaRangeOf(params)}^2}}`,
      note:
        guideRangeOf(params) === "color"
          ? "G is the guide image. d is the distance between its RGB colors. All channels share the weights."
          : "G is the luma of the guide image, or of this image when no guide is chosen. All channels share the weights.",
    };
  },
};
