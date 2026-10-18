/**
 * Regions. Catalog entries: catalog/filters/segmentation/{ccl,region-growing,kmeans-color}.yaml.
 *
 * - Connected-component labeling: brightness at or above 128 is foreground, as in the binary
 *   morphology filters. Components are numbered in the order of their first pixel in a row by row
 *   scan, as scipy.ndimage.label numbers them, and shown in distinct colors or gray levels.
 * - Region growing: the pixels that match the seed pixel within a tolerance and connect to it
 *   through matching pixels, as skimage.segmentation.flood finds them. The seed is given in
 *   percent of the width and height, so it stays put on any image size.
 * - K-means color segmentation: Lloyd's algorithm on the colors of the image. It runs on the
 *   distinct colors weighted by their counts, which gives the same means as running on every
 *   pixel. The start is PixelNexus's own deterministic rule: the color nearest to the mean, then
 *   again and again the color farthest from the centers chosen so far. Ties go to the smallest
 *   color code 65536 R + 256 G + B.
 *
 * All three are global filters: a label, a region or a cluster can depend on the whole image.
 */
import { hsvToRgb, luma709 } from "@/core/color/convert";
import { labelComponents } from "@/core/filters/morphology/binary";
import { createPlane, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

type Planes = readonly [Plane, Plane, Plane];

const connectivityOf = (params: Params): 4 | 8 =>
  read.string<"4" | "8">(params, "connectivity", "8") === "4" ? 4 : 8;

const brightness = (planes: Planes, i: number) =>
  luma709(planes[0].data[i] ?? 0, planes[1].data[i] ?? 0, planes[2].data[i] ?? 0);

/** The color of label k: hues a golden angle apart, so neighbors in the numbering differ. */
export function labelColor(label: number): readonly [number, number, number] {
  return hsvToRgb((label * 137.507764) % 360, 0.65, 0.95);
}

function paint(
  planes: Planes,
  colorOf: (i: number) => readonly [number, number, number],
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const out = [createPlane(width, height), createPlane(width, height), createPlane(width, height)];
  for (let i = 0; i < width * height; i++) {
    const rgb = colorOf(i);
    out.forEach((p, c) => (p.data[i] = rgb[c] ?? 0));
  }
  return out as [Plane, Plane, Plane];
}

// Connected-component labeling --------------------------------------------------------------

/** The labels of the foreground (brightness at or above 128, or below it with invert). */
export function componentLabels(planes: Planes, params: Params) {
  const { width, height } = planes[0];
  const invert = read.boolean(params, "invert", false);
  const bits = new Uint8Array(width * height);
  for (let i = 0; i < bits.length; i++) bits[i] = brightness(planes, i) >= 128 !== invert ? 1 : 0;
  return labelComponents(bits, width, height, connectivityOf(params));
}

export const cclLabelFilter: ColorFilter = {
  id: "ccl",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => {
    const { labels, count } = componentLabels(planes, params);
    const gray = read.string<"colors" | "gray">(params, "output", "colors") === "gray";
    return paint(planes, (i) => {
      const label = labels[i] ?? 0;
      if (label === 0) return [0, 0, 0];
      if (!gray) return labelColor(label);
      const v = (255 * label) / count;
      return [v, v, v];
    });
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Foreground",
        formula: read.boolean(params, "invert", false)
          ? "F = \\{\\, p : Y(p) < 128 \\,\\}"
          : "F = \\{\\, p : Y(p) \\ge 128 \\,\\}",
        note: "Y is the brightness 0.2126 R + 0.7152 G + 0.0722 B.",
      },
      {
        name: "Labels",
        formula: `L(p) = k \\text{ for the } k\\text{th component of } F,\\ ${connectivityOf(params)} \\text{ neighbors}`,
        note: "Components are numbered by their first pixel in a row by row scan. The background is 0.",
      },
    ],
  }),
};

// Region growing --------------------------------------------------------------------------

export interface GrowSettings {
  readonly seedX: number;
  readonly seedY: number;
  readonly tolerance: number;
  readonly measure: "brightness" | "color";
  readonly connectivity: 4 | 8;
}

export const growSettings = (params: Params): GrowSettings => ({
  seedX: read.number(params, "seedX", 50),
  seedY: read.number(params, "seedY", 50),
  tolerance: read.number(params, "tolerance", 20),
  measure: read.string<"brightness" | "color">(params, "measure", "brightness"),
  connectivity: connectivityOf(params),
});

/** The seed pixel for a position in percent of the width and height. */
export function seedPixel(width: number, height: number, s: GrowSettings): [number, number] {
  const at = (percent: number, n: number) =>
    Math.min(n - 1, Math.max(0, Math.floor((percent / 100) * n)));
  return [at(s.seedX, width), at(s.seedY, height)];
}

/** 1 for the pixels of the grown region, 0 elsewhere. */
export function growRegion(planes: Planes, s: GrowSettings): Uint8Array {
  const { width, height } = planes[0];
  const [sx, sy] = seedPixel(width, height, s);
  const seed = sy * width + sx;
  const matches = new Uint8Array(width * height);
  if (s.measure === "brightness") {
    const level = brightness(planes, seed);
    for (let i = 0; i < matches.length; i++) {
      matches[i] = Math.abs(brightness(planes, i) - level) <= s.tolerance ? 1 : 0;
    }
  } else {
    const color = planes.map((p) => p.data[seed] ?? 0);
    for (let i = 0; i < matches.length; i++) {
      let far = 0;
      planes.forEach((p, c) => (far = Math.max(far, Math.abs((p.data[i] ?? 0) - (color[c] ?? 0)))));
      matches[i] = far <= s.tolerance ? 1 : 0;
    }
  }
  const { labels } = labelComponents(matches, width, height, s.connectivity);
  const region = labels[seed] ?? 0;
  return Uint8Array.from(labels, (l) => (l === region && region > 0 ? 1 : 0));
}

export const regionGrowingFilter: ColorFilter = {
  id: "region-growing",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => {
    const region = growRegion(planes, growSettings(params));
    return paint(planes, (i) => (region[i] ? [255, 255, 255] : [0, 0, 0]));
  },
  representation: (params) => {
    const s = growSettings(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Seed",
          formula: `s = \\left(\\lfloor ${s.seedX}\\,\\% \\cdot W \\rfloor,\\ \\lfloor ${s.seedY}\\,\\% \\cdot H \\rfloor\\right)`,
        },
        {
          name: "Match",
          formula:
            s.measure === "brightness"
              ? `|Y(p) - Y(s)| \\le ${s.tolerance}`
              : `\\max_c |I_c(p) - I_c(s)| \\le ${s.tolerance}`,
          note:
            s.measure === "brightness"
              ? "Y is the brightness."
              : "c runs over red, green and blue.",
        },
        {
          name: "Grow",
          formula: `R = \\text{the matching pixels connected to } s,\\ ${s.connectivity} \\text{ neighbors}`,
        },
      ],
    };
  },
};

// K-means color segmentation ------------------------------------------------------------

export interface KmeansResult {
  /** The centers, three values each. */
  readonly centers: Float64Array;
  /** The cluster of each pixel. */
  readonly labels: Int32Array;
  readonly iterations: number;
}

const code = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const level = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Lloyd's algorithm with the deterministic start described above. */
export function kmeansColors(planes: Planes, k: number, maxIterations: number): KmeansResult {
  const n = planes[0].data.length;
  const pixelCode = new Int32Array(n);
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = code(
      level(planes[0].data[i] ?? 0),
      level(planes[1].data[i] ?? 0),
      level(planes[2].data[i] ?? 0),
    );
    pixelCode[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const codes = Int32Array.from(counts.keys()).sort();
  const m = codes.length;
  const colors = new Float64Array(3 * m);
  const weights = new Float64Array(m);
  codes.forEach((c, j) => {
    colors.set([(c >> 16) & 255, (c >> 8) & 255, c & 255], 3 * j);
    weights[j] = counts.get(c) ?? 0;
  });
  const dist2 = (j: number, center: ArrayLike<number>, o: number) =>
    ((colors[3 * j] ?? 0) - (center[o] ?? 0)) ** 2 +
    ((colors[3 * j + 1] ?? 0) - (center[o + 1] ?? 0)) ** 2 +
    ((colors[3 * j + 2] ?? 0) - (center[o + 2] ?? 0)) ** 2;

  // Start: the color nearest to the mean, then the farthest from the chosen centers.
  const mean = [0, 0, 0];
  let total = 0;
  for (let j = 0; j < m; j++) {
    for (let c = 0; c < 3; c++)
      mean[c] = (mean[c] ?? 0) + (weights[j] ?? 0) * (colors[3 * j + c] ?? 0);
    total += weights[j] ?? 0;
  }
  const meanColor = mean.map((v) => v / total);
  let first = 0;
  for (let j = 1; j < m; j++) if (dist2(j, meanColor, 0) < dist2(first, meanColor, 0)) first = j;
  const chosen = [first];
  const nearest = Float64Array.from({ length: m }, (_, j) => dist2(j, colors, 3 * first));
  while (chosen.length < k) {
    let far = -1;
    for (let j = 0; j < m; j++) if (far < 0 || (nearest[j] ?? 0) > (nearest[far] ?? 0)) far = j;
    if (far < 0 || !((nearest[far] ?? 0) > 0)) break;
    chosen.push(far);
    for (let j = 0; j < m; j++) nearest[j] = Math.min(nearest[j] ?? 0, dist2(j, colors, 3 * far));
  }
  const kk = chosen.length;
  const centers = new Float64Array(3 * kk);
  chosen.forEach((j, c) => centers.set(colors.subarray(3 * j, 3 * j + 3), 3 * c));

  const assign = new Int32Array(m).fill(-1);
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    let changed = false;
    for (let j = 0; j < m; j++) {
      let best = 0;
      let bestD = dist2(j, centers, 0);
      for (let c = 1; c < kk; c++) {
        const d = dist2(j, centers, 3 * c);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[j] !== best) {
        assign[j] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums = new Float64Array(3 * kk);
    const mass = new Float64Array(kk);
    for (let j = 0; j < m; j++) {
      const c = assign[j] ?? 0;
      const w = weights[j] ?? 0;
      mass[c] = (mass[c] ?? 0) + w;
      for (let d = 0; d < 3; d++) {
        sums[3 * c + d] = (sums[3 * c + d] ?? 0) + w * (colors[3 * j + d] ?? 0);
      }
    }
    for (let c = 0; c < kk; c++) {
      if (!((mass[c] ?? 0) > 0)) continue;
      for (let d = 0; d < 3; d++) centers[3 * c + d] = (sums[3 * c + d] ?? 0) / (mass[c] ?? 1);
    }
  }
  const index = new Map(Array.from(codes, (c, j) => [c, j]));
  const labels = Int32Array.from(pixelCode, (c) => assign[index.get(c) ?? 0] ?? 0);
  return { centers, labels, iterations };
}

export const kmeansColorFilter: ColorFilter = {
  id: "kmeans-color",
  kind: "color",
  global: true,
  radius: () => 0,
  color: (planes, params) => {
    const k = Math.max(1, Math.round(read.number(params, "k", 4)));
    const { centers, labels } = kmeansColors(
      planes,
      k,
      Math.max(1, Math.round(read.number(params, "iterations", 20))),
    );
    const asLabels = read.string<"centers" | "labels">(params, "output", "centers") === "labels";
    return paint(planes, (i) => {
      const c = labels[i] ?? 0;
      if (asLabels) return labelColor(c + 1);
      return [centers[3 * c] ?? 0, centers[3 * c + 1] ?? 0, centers[3 * c + 2] ?? 0];
    });
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Start",
        formula:
          "\\mu_1 = \\arg\\min_x \\lVert x - \\bar x \\rVert,\\quad \\mu_{j+1} = \\arg\\max_x \\min_{i \\le j} \\lVert x - \\mu_i \\rVert",
        note: "x runs over the colors of the image. PixelNexus's own deterministic start.",
      },
      {
        name: "Assign",
        formula: "c(x) = \\arg\\min_j \\lVert x - \\mu_j \\rVert^2",
      },
      {
        name: "Update",
        formula: "\\mu_j = \\operatorname{mean}\\{\\, x : c(x) = j \\,\\}",
        note: `Repeat until no pixel changes cluster, at most ${read.number(params, "iterations", 20)} times. k = ${read.number(params, "k", 4)}.`,
      },
    ],
  }),
};
