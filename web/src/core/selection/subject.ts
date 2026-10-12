/**
 * Select > Subject and Select > Background without AI. A heuristic that combines the saliency
 * maps in saliency.ts with color clusters and connected parts. The combination is PixelNexus's
 * own. It works on a copy of at most WORK_SIDE pixels on the longer side:
 *
 * 1. Saliency s = (0.4 * frequency tuned + 0.3 * spectral residual + 0.3 * edge density),
 *    scaled to 0 to 1, times (0.4 + 0.6 * center prior), scaled again.
 * 2. k-means with k = 8 on CIELAB colors. Each cluster scores its mean saliency times
 *    (1 - b), where b is its share of the image border. The background usually touches the
 *    border all around.
 * 3. The pixel score is the mean of s and its cluster score, scaled to 0 to 1, and Otsu's
 *    threshold splits it.
 * 4. Connected parts: the part with the largest area times mean score stays, and so does every
 *    part with at least half that and at least 0.5% of the image. Holes are filled.
 * 5. The mask is scaled up to the image size and snapped to edges (snap.ts).
 *
 * Background selection is the inverse. Both give a starting point to correct with the other
 * tools. Images where the subject is not the most colorful or detailed part will fool it.
 *
 * Catalog entries: catalog/tools/subject-heuristic.yaml and background-heuristic.yaml.
 */
import type { RgbaImage } from "@/core/image/types";
import { createMask, resizeMask, type Mask } from "@/core/mask/mask";

import { imageCoords } from "./color";
import {
  areaResize,
  centerPrior,
  edgeDensity,
  frequencyTuned,
  normalize,
  spectralResidual,
  type Field,
} from "./saliency";
import { snapToEdges } from "./snap";

export const WORK_SIDE = 512;
const CLUSTERS = 8;

/** A smaller copy by area averaging, at most `maxSide` pixels on the longer side. */
export function shrinkImage(image: RgbaImage, maxSide: number): RgbaImage {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y++) {
    const ya = Math.floor(y * sy);
    const yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const xa = Math.floor(x * sx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      const sum = [0, 0, 0, 0];
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const o = (yy * image.width + xx) * 4;
          for (let c = 0; c < 4; c++) sum[c] = (sum[c] ?? 0) + (image.data[o + c] ?? 0);
        }
      }
      const count = (yb - ya) * (xb - xa);
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round((sum[c] ?? 0) / count);
    }
  }
  return { width, height, data };
}

/** k-means on CIELAB colors. Centers start at evenly spaced brightness quantiles. */
export function colorClusters(image: RgbaImage, k: number, iterations = 10): Int32Array {
  const n = image.width * image.height;
  const lab = imageCoords(image, "lab");
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (lab[a * 3] ?? 0) - (lab[b * 3] ?? 0),
  );
  const centers = new Float64Array(k * 3);
  for (let c = 0; c < k; c++) {
    const p = order[Math.min(n - 1, Math.floor(((c + 0.5) * n) / k))] ?? 0;
    for (let v = 0; v < 3; v++) centers[c * 3 + v] = lab[p * 3 + v] ?? 0;
  }
  const labels = new Int32Array(n);
  const sums = new Float64Array(k * 4);
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let p = 0; p < n; p++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          ((lab[p * 3] ?? 0) - (centers[c * 3] ?? 0)) ** 2 +
          ((lab[p * 3 + 1] ?? 0) - (centers[c * 3 + 1] ?? 0)) ** 2 +
          ((lab[p * 3 + 2] ?? 0) - (centers[c * 3 + 2] ?? 0)) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[p] = best;
    }
    sums.fill(0);
    for (let p = 0; p < n; p++) {
      const c = labels[p] ?? 0;
      for (let v = 0; v < 3; v++) sums[c * 4 + v] = (sums[c * 4 + v] ?? 0) + (lab[p * 3 + v] ?? 0);
      sums[c * 4 + 3] = (sums[c * 4 + 3] ?? 0) + 1;
    }
    for (let c = 0; c < k; c++) {
      const count = sums[c * 4 + 3] ?? 0;
      if (count > 0)
        for (let v = 0; v < 3; v++) centers[c * 3 + v] = (sums[c * 4 + v] ?? 0) / count;
    }
  }
  return labels;
}

/** Otsu's threshold for values from 0 to 1, with 256 bins. */
export function otsu(values: ArrayLike<number>): number {
  const bins = new Float64Array(256);
  for (let i = 0; i < values.length; i++) {
    const b = Math.min(255, Math.max(0, Math.round((values[i] ?? 0) * 255)));
    bins[b] = (bins[b] ?? 0) + 1;
  }
  const total = values.length;
  let sumAll = 0;
  for (let b = 0; b < 256; b++) sumAll += b * (bins[b] ?? 0);
  let weightBelow = 0;
  let sumBelow = 0;
  let best = 0;
  let threshold = 0;
  for (let b = 0; b < 256; b++) {
    weightBelow += bins[b] ?? 0;
    if (weightBelow === 0 || weightBelow === total) continue;
    sumBelow += b * (bins[b] ?? 0);
    const meanBelow = sumBelow / weightBelow;
    const meanAbove = (sumAll - sumBelow) / (total - weightBelow);
    const between = weightBelow * (total - weightBelow) * (meanBelow - meanAbove) ** 2;
    if (between > best) {
      best = between;
      threshold = b;
    }
  }
  // Values above the best split bin are the upper class.
  return (threshold + 0.5) / 255;
}

/** 4-connected parts of a binary map. Returns the part of each pixel, -1 outside, and the count. */
function parts(on: Uint8Array, w: number, h: number): { label: Int32Array; count: number } {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let count = 0;
  for (let p = 0; p < w * h; p++) {
    if (!on[p] || (label[p] ?? 0) >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = p;
    label[p] = count;
    while (head < tail) {
      const q = queue[head++] ?? 0;
      const x = q % w;
      for (const r of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q - w, q + w]) {
        if (r < 0 || r >= w * h || !on[r] || (label[r] ?? 0) >= 0) continue;
        label[r] = count;
        queue[tail++] = r;
      }
    }
    count++;
  }
  return { label, count };
}

/** The subject score of each pixel of a work image, from 0 to 1 (steps 1 to 3). */
export function subjectScore(work: RgbaImage): Field {
  const { width: w, height: h } = work;
  const n = w * h;
  const ft = frequencyTuned(work);
  const sr = areaResize(spectralResidual(work), w, h);
  const ed = edgeDensity(work);
  const cp = centerPrior(w, h);
  const mixed: Field = { width: w, height: h, data: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    mixed.data[i] = 0.4 * (ft.data[i] ?? 0) + 0.3 * (sr.data[i] ?? 0) + 0.3 * (ed.data[i] ?? 0);
  }
  const s = normalize(mixed);
  for (let i = 0; i < n; i++) s.data[i] = (s.data[i] ?? 0) * (0.4 + 0.6 * (cp.data[i] ?? 0));
  const saliency = normalize(s);

  const labels = colorClusters(work, CLUSTERS);
  const frame = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const sum = new Float64Array(CLUSTERS);
  const size = new Float64Array(CLUSTERS);
  const onBorder = new Float64Array(CLUSTERS);
  let borderTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = labels[i] ?? 0;
      sum[c] = (sum[c] ?? 0) + (saliency.data[i] ?? 0);
      size[c] = (size[c] ?? 0) + 1;
      if (x < frame || y < frame || x >= w - frame || y >= h - frame) {
        onBorder[c] = (onBorder[c] ?? 0) + 1;
        borderTotal++;
      }
    }
  }
  const clusterScore = new Float64Array(CLUSTERS);
  for (let c = 0; c < CLUSTERS; c++) {
    const mean = (size[c] ?? 0) > 0 ? (sum[c] ?? 0) / (size[c] ?? 1) : 0;
    clusterScore[c] = mean * (1 - (onBorder[c] ?? 0) / Math.max(1, borderTotal));
  }
  let top = 0;
  for (const v of clusterScore) top = Math.max(top, v);
  const score: Field = { width: w, height: h, data: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const c = top > 0 ? (clusterScore[labels[i] ?? 0] ?? 0) / top : 0;
    score.data[i] = 0.5 * (saliency.data[i] ?? 0) + 0.5 * c;
  }
  return normalize(score);
}

/** Pick the subject parts from a score map and fill their holes (step 4). 255 is subject. */
export function subjectParts(score: Field): Mask {
  const { width: w, height: h } = score;
  const n = w * h;
  const t = otsu(score.data);
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) on[i] = (score.data[i] ?? 0) > t ? 1 : 0;
  const { label, count } = parts(on, w, h);
  const area = new Float64Array(count);
  const total = new Float64Array(count);
  for (let i = 0; i < n; i++) {
    const l = label[i] ?? -1;
    if (l < 0) continue;
    area[l] = (area[l] ?? 0) + 1;
    total[l] = (total[l] ?? 0) + (score.data[i] ?? 0);
  }
  // Area times mean score is the summed score.
  let best = 0;
  for (const v of total) best = Math.max(best, v);
  const keep = new Uint8Array(count);
  for (let l = 0; l < count; l++) {
    const big = (area[l] ?? 0) >= 0.005 * n;
    if ((total[l] ?? 0) === best || (big && (total[l] ?? 0) >= 0.5 * best)) keep[l] = 1;
  }
  const mask = createMask(w, h);
  for (let i = 0; i < n; i++) if (keep[label[i] ?? -1] ?? 0) mask.data[i] = 255;
  // Fill holes: unselected parts that do not touch the border.
  const off = new Uint8Array(n);
  for (let i = 0; i < n; i++) off[i] = mask.data[i] ? 0 : 1;
  const holes = parts(off, w, h);
  const touches = new Uint8Array(holes.count);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) continue;
      const l = holes.label[y * w + x] ?? -1;
      if (l >= 0) touches[l] = 1;
    }
  }
  for (let i = 0; i < n; i++) {
    const l = holes.label[i] ?? -1;
    if (l >= 0 && !touches[l]) mask.data[i] = 255;
  }
  return mask;
}

export interface SubjectOptions {
  /** Snap the scaled-up mask to image edges (step 5). */
  readonly refineEdges?: boolean;
}

/** The subject mask of an image, at the image size. */
export function subjectMask(image: RgbaImage, options: SubjectOptions = {}): Mask {
  const work = shrinkImage(image, WORK_SIDE);
  const small = subjectParts(subjectScore(work));
  const full = resizeMask(small, image.width, image.height);
  if (options.refineEdges === false) return full;
  const factor = image.width / work.width;
  return snapToEdges(image, full, {
    radius: Math.min(24, Math.max(2, Math.ceil(1.5 * factor))),
    contrast: 0.1,
    smoothing: 1,
  });
}
