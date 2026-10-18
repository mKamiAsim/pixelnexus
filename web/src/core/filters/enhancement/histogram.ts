/**
 * Point operations whose curve comes from the histogram of the whole image. Catalog entries:
 * catalog/filters/enhancement/{histogram-eq,percentile-normalize}.yaml.
 *
 * The histogram counts the values rounded to the levels 0 to 255. The curve T gives an output
 * for each level. A value between two levels, as luma often is, takes the output interpolated
 * between them.
 *
 * - Histogram equalization: T(k) = 255 * (h_0 + ... + h_k) / N, the cumulative histogram of
 *   Gonzalez and Woods scaled to 0 .. 255, without rounding until the end.
 * - Percentile normalization: the low and high percentiles p_lo and p_hi of the levels, with
 *   the linear rule of numpy.percentile, map to 0 and 255. T(k) = 255 (k - p_lo) / (p_hi - p_lo),
 *   clipped to 0 .. 255. When p_hi is not above p_lo the image stays as it is.
 *
 * The filters need the whole image, so they are global.
 */
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

/** Counts of the values rounded to 0 .. 255. */
export function histogram256(plane: Plane): Float64Array {
  const counts = new Float64Array(256);
  for (const v of plane.data) {
    const k = Math.min(255, Math.max(0, Math.round(v)));
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** Apply a 256-entry curve, interpolating between levels. */
export function applyTable(plane: Plane, table: ArrayLike<number>): Plane {
  const out = createPlane(plane.width, plane.height);
  for (let i = 0; i < plane.data.length; i++) {
    const v = Math.min(255, Math.max(0, plane.data[i] ?? 0));
    const k = Math.floor(v);
    const t = v - k;
    const low = table[k] ?? 0;
    out.data[i] = t > 0 ? low + t * ((table[k + 1] ?? low) - low) : low;
  }
  return out;
}

export function equalizeTable(histogram: ArrayLike<number>): Float64Array {
  let total = 0;
  for (let k = 0; k < 256; k++) total += histogram[k] ?? 0;
  const table = new Float64Array(256);
  let sum = 0;
  for (let k = 0; k < 256; k++) {
    sum += histogram[k] ?? 0;
    table[k] = total > 0 ? (255 * sum) / total : k;
  }
  return table;
}

/** The q-th percentile of the levels, with the default linear rule of numpy.percentile. */
export function histogramPercentile(histogram: ArrayLike<number>, q: number): number {
  let total = 0;
  for (let k = 0; k < 256; k++) total += histogram[k] ?? 0;
  if (total === 0) return 0;
  const h = ((total - 1) * Math.min(100, Math.max(0, q))) / 100;
  const below = Math.floor(h);
  // The value at a sorted position: the level whose cumulative count first passes it.
  const at = (position: number) => {
    let sum = 0;
    for (let k = 0; k < 256; k++) {
      sum += histogram[k] ?? 0;
      if (sum > position) return k;
    }
    return 255;
  };
  const a = at(below);
  return h > below ? a + (h - below) * (at(below + 1) - a) : a;
}

export function percentileTable(histogram: ArrayLike<number>, low: number, high: number) {
  const lo = histogramPercentile(histogram, low);
  const hi = histogramPercentile(histogram, high);
  return Float64Array.from({ length: 256 }, (_, k) =>
    hi > lo ? Math.min(255, Math.max(0, (255 * (k - lo)) / (hi - lo))) : k,
  );
}

function histogramFilter(
  table: (params: Params, histogram: ArrayLike<number>) => Float64Array,
  representation: (params: Params) => Representation,
) {
  return {
    kind: "smooth" as const,
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    pointTable: table,
    plane: (input: Plane, params: Params) => applyTable(input, table(params, histogram256(input))),
    representation,
  };
}

const IMAGE_NOTE =
  "The curve depends on the histogram of the image. The Point-op curve in the Learn panel draws it for the open image.";

export const histogramEqFilter: PlaneFilter = {
  id: "histogram-eq",
  ...histogramFilter(
    (_params, histogram) => equalizeTable(histogram),
    () => ({
      kind: "stages",
      stages: [
        {
          name: "Histogram",
          formula: "h_k = \\#\\{\\text{pixels at level } k\\},\\quad N = \\sum_k h_k",
        },
        { name: "Curve", formula: "T(k) = 255 \\cdot \\frac{1}{N} \\sum_{j=0}^{k} h_j" },
      ],
      note: IMAGE_NOTE,
    }),
  ),
};

const percentilesOf = (params: Params) =>
  [read.number(params, "low", 1), read.number(params, "high", 99)] as const;

export const percentileNormalizeFilter: PlaneFilter = {
  id: "percentile-normalize",
  ...histogramFilter(
    (params, histogram) => percentileTable(histogram, ...percentilesOf(params)),
    (params) => {
      const [low, high] = percentilesOf(params);
      return {
        kind: "stages",
        stages: [
          {
            name: "Percentiles",
            formula: `p_{\\text{lo}} = P_{${low}}(I),\\quad p_{\\text{hi}} = P_{${high}}(I)`,
            note: "The linear rule of numpy.percentile over the levels of all pixels.",
          },
          {
            name: "Curve",
            formula:
              "T(k) = \\min\\left(255, \\max\\left(0, 255 \\cdot \\frac{k - p_{\\text{lo}}}{p_{\\text{hi}} - p_{\\text{lo}}}\\right)\\right)",
          },
        ],
        note: IMAGE_NOTE,
      };
    },
  ),
};
