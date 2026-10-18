/**
 * SLIC superpixels (Achanta et al., IEEE TPAMI 2012), and the facts about each superpixel that
 * Quick Selection grows by.
 *
 * SLIC is k-means clustering on five numbers per pixel: CIELAB color and position. Each center
 * only looks at pixels within 2S x 2S around it, where S is the grid step, so one iteration
 * costs time in proportion to the number of pixels. The distance is
 *
 *   D = sqrt(dc^2 + (ds / S)^2 * m^2)
 *
 * with dc the CIELAB distance, ds the distance in pixels and m the compactness. Centers start on
 * a grid and move to the lowest color gradient in their 3 x 3 neighborhood. After the
 * iterations, pieces that are not connected to their superpixel get their own label, and
 * pieces smaller than S^2 / 4 pixels join a neighbor.
 *
 * Catalog entry: catalog/tools/quick-selection.yaml.
 */
import type { RgbaImage } from "@/core/image/types";

import { imageCoords } from "./color";

/** Lab coordinates from `imageCoords` are scaled by 2.55, so L* runs from 0 to 255. */
const LAB_SCALE = 2.55;

export interface Superpixels {
  readonly width: number;
  readonly height: number;
  /** The superpixel of each pixel, from 0 to count - 1. */
  readonly labels: Int32Array;
  readonly count: number;
  /** Pixels in each superpixel. */
  readonly size: Int32Array;
  /** Mean CIELAB color of each superpixel, three numbers each, scaled by 2.55. */
  readonly color: Float32Array;
  /** Standard deviation of L* inside each superpixel, scaled by 2.55. A measure of texture. */
  readonly texture: Float32Array;
  /** Neighbors in compressed rows: the neighbors of i are adjacent[start[i] .. start[i + 1]]. */
  readonly start: Int32Array;
  readonly adjacent: Int32Array;
  /**
   * For each neighbor pair, how much stronger the L* gradient is on the shared border than
   * inside the two superpixels, from 0 to 1. Near 0 means no edge between them.
   */
  readonly edge: Float32Array;
}

/** SLIC labels for an image. `step` is the grid step S in pixels, `compactness` is m. */
export function slicLabels(
  image: RgbaImage,
  step: number,
  compactness = 10,
  iterations = 10,
  lab: Float32Array = imageCoords(image, "lab"),
): Int32Array {
  const { width: w, height: h } = image;
  const n = w * h;
  const S = Math.max(1, Math.round(step));
  const at = (x: number, y: number, c: number) => lab[(y * w + x) * 3 + c] ?? 0;

  // Centers on a grid, moved to the lowest gradient in their 3 x 3 neighborhood.
  const cols = Math.max(1, Math.round(w / S));
  const rows = Math.max(1, Math.round(h / S));
  const k = cols * rows;
  const center = new Float64Array(k * 5);
  const gradient = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return Infinity;
    let g = 0;
    for (let c = 0; c < 3; c++) {
      const dx = at(x + 1, y, c) - at(x - 1, y, c);
      const dy = at(x, y + 1, c) - at(x, y - 1, c);
      g += dx * dx + dy * dy;
    }
    return g;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let x = Math.min(w - 1, Math.floor(((i + 0.5) * w) / cols));
      let y = Math.min(h - 1, Math.floor(((j + 0.5) * h) / rows));
      let best = gradient(x, y);
      const [x0, y0] = [x, y];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const g = gradient(x0 + dx, y0 + dy);
          if (g < best) {
            best = g;
            x = x0 + dx;
            y = y0 + dy;
          }
        }
      }
      const o = (j * cols + i) * 5;
      center.set([at(x, y, 0), at(x, y, 1), at(x, y, 2), x, y], o);
    }
  }

  // Colors are scaled by 2.55, so the compactness is too, to keep the balance of the paper.
  const weight = ((compactness * LAB_SCALE) / S) ** 2;
  const labels = new Int32Array(n).fill(-1);
  const best = new Float64Array(n);
  const sums = new Float64Array(k * 6);
  for (let iteration = 0; iteration < iterations; iteration++) {
    best.fill(Infinity);
    for (let c = 0; c < k; c++) {
      const o = c * 5;
      const [l, a, b, cx, cy] = [
        center[o] ?? 0,
        center[o + 1] ?? 0,
        center[o + 2] ?? 0,
        center[o + 3] ?? 0,
        center[o + 4] ?? 0,
      ];
      const xs = Math.max(0, Math.floor(cx - S));
      const xe = Math.min(w - 1, Math.ceil(cx + S));
      const ys = Math.max(0, Math.floor(cy - S));
      const ye = Math.min(h - 1, Math.ceil(cy + S));
      for (let y = ys; y <= ye; y++) {
        for (let x = xs; x <= xe; x++) {
          const p = y * w + x;
          const dl = (lab[p * 3] ?? 0) - l;
          const da = (lab[p * 3 + 1] ?? 0) - a;
          const db = (lab[p * 3 + 2] ?? 0) - b;
          const d = dl * dl + da * da + db * db + ((x - cx) ** 2 + (y - cy) ** 2) * weight;
          if (d < (best[p] ?? Infinity)) {
            best[p] = d;
            labels[p] = c;
          }
        }
      }
    }
    // Move each center to the mean of its pixels.
    sums.fill(0);
    for (let p = 0; p < n; p++) {
      const c = labels[p] ?? -1;
      if (c < 0) continue;
      const o = c * 6;
      sums[o] = (sums[o] ?? 0) + (lab[p * 3] ?? 0);
      sums[o + 1] = (sums[o + 1] ?? 0) + (lab[p * 3 + 1] ?? 0);
      sums[o + 2] = (sums[o + 2] ?? 0) + (lab[p * 3 + 2] ?? 0);
      sums[o + 3] = (sums[o + 3] ?? 0) + (p % w);
      sums[o + 4] = (sums[o + 4] ?? 0) + Math.floor(p / w);
      sums[o + 5] = (sums[o + 5] ?? 0) + 1;
    }
    for (let c = 0; c < k; c++) {
      const count = sums[c * 6 + 5] ?? 0;
      if (count === 0) continue;
      for (let v = 0; v < 5; v++) center[c * 5 + v] = (sums[c * 6 + v] ?? 0) / count;
    }
  }
  // Every pixel is within reach of some center, but keep the code safe for odd sizes.
  for (let p = 0; p < n; p++) if ((labels[p] ?? -1) < 0) labels[p] = 0;
  return connectLabels(labels, w, h, Math.max(1, Math.floor((S * S) / 4)));
}

/**
 * Give each 4-connected piece of a label its own label, and join pieces smaller than `minSize`
 * to the neighbor met before them in reading order. The result runs from 0 to count - 1.
 */
export function connectLabels(
  labels: Int32Array,
  w: number,
  h: number,
  minSize: number,
): Int32Array {
  const n = w * h;
  const out = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let next = 0;
  for (let p = 0; p < n; p++) {
    if ((out[p] ?? 0) >= 0) continue;
    const x = p % w;
    // A neighbor that already has a new label, to join if this piece is too small.
    const neighbor =
      x > 0 && (out[p - 1] ?? -1) >= 0 ? (out[p - 1] ?? 0) : p >= w ? (out[p - w] ?? -1) : -1;
    const old = labels[p] ?? 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = p;
    out[p] = next;
    while (head < tail) {
      const q = queue[head++] ?? 0;
      const qx = q % w;
      const around = [
        qx > 0 ? q - 1 : -1,
        qx < w - 1 ? q + 1 : -1,
        q >= w ? q - w : -1,
        q < n - w ? q + w : -1,
      ];
      for (const r of around) {
        if (r < 0 || (out[r] ?? 0) >= 0 || labels[r] !== old) continue;
        out[r] = next;
        queue[tail++] = r;
      }
    }
    if (tail < minSize && neighbor >= 0) {
      for (let i = 0; i < tail; i++) out[queue[i] ?? 0] = neighbor;
    } else {
      next++;
    }
  }
  return out;
}

/** Superpixels with their color, texture, neighbors and the edge between neighbors. */
export function superpixels(image: RgbaImage, step: number, compactness = 10): Superpixels {
  const { width: w, height: h } = image;
  const n = w * h;
  const lab = imageCoords(image, "lab");
  const labels = slicLabels(image, step, compactness, 10, lab);
  let count = 0;
  for (const l of labels) count = Math.max(count, l + 1);

  // Sobel gradient magnitude of L*, with the edge pixels repeated.
  const L = (x: number, y: number) =>
    lab[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3] ?? 0;
  const grad = new Float32Array(n);
  let gmax = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        L(x + 1, y - 1) +
        2 * L(x + 1, y) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x - 1, y) -
        L(x - 1, y + 1);
      const gy =
        L(x - 1, y + 1) +
        2 * L(x, y + 1) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x, y - 1) -
        L(x + 1, y - 1);
      const g = Math.hypot(gx, gy);
      grad[y * w + x] = g;
      if (g > gmax) gmax = g;
    }
  }

  const size = new Int32Array(count);
  const sum = new Float64Array(count * 5); // L, a, b, L^2, gradient
  for (let p = 0; p < n; p++) {
    const c = labels[p] ?? 0;
    const l = lab[p * 3] ?? 0;
    size[c] = (size[c] ?? 0) + 1;
    sum[c * 5] = (sum[c * 5] ?? 0) + l;
    sum[c * 5 + 1] = (sum[c * 5 + 1] ?? 0) + (lab[p * 3 + 1] ?? 0);
    sum[c * 5 + 2] = (sum[c * 5 + 2] ?? 0) + (lab[p * 3 + 2] ?? 0);
    sum[c * 5 + 3] = (sum[c * 5 + 3] ?? 0) + l * l;
    sum[c * 5 + 4] = (sum[c * 5 + 4] ?? 0) + (grad[p] ?? 0);
  }
  const color = new Float32Array(count * 3);
  const texture = new Float32Array(count);
  const inner = new Float64Array(count);
  for (let c = 0; c < count; c++) {
    const s = Math.max(1, size[c] ?? 0);
    const mean = (sum[c * 5] ?? 0) / s;
    color[c * 3] = mean;
    color[c * 3 + 1] = (sum[c * 5 + 1] ?? 0) / s;
    color[c * 3 + 2] = (sum[c * 5 + 2] ?? 0) / s;
    texture[c] = Math.sqrt(Math.max(0, (sum[c * 5 + 3] ?? 0) / s - mean * mean));
    inner[c] = (sum[c * 5 + 4] ?? 0) / s;
  }

  // Borders: every pair of 4-neighbor pixels with different labels.
  const borders = new Map<number, { length: number; gradient: number }>();
  const touch = (p: number, q: number) => {
    const a = labels[p] ?? 0;
    const b = labels[q] ?? 0;
    if (a === b) return;
    const key = Math.min(a, b) * count + Math.max(a, b);
    const border = borders.get(key) ?? { length: 0, gradient: 0 };
    border.length += 1;
    border.gradient += ((grad[p] ?? 0) + (grad[q] ?? 0)) / 2;
    borders.set(key, border);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (x < w - 1) touch(p, p + 1);
      if (y < h - 1) touch(p, p + w);
    }
  }
  const degree = new Int32Array(count + 1);
  for (const key of borders.keys()) {
    const a = Math.floor(key / count);
    const b = key % count;
    degree[a + 1] = (degree[a + 1] ?? 0) + 1;
    degree[b + 1] = (degree[b + 1] ?? 0) + 1;
  }
  const start = new Int32Array(count + 1);
  for (let c = 0; c < count; c++) start[c + 1] = (start[c] ?? 0) + (degree[c + 1] ?? 0);
  const fill = start.slice(0, count);
  const adjacent = new Int32Array(start[count] ?? 0);
  const edge = new Float32Array(start[count] ?? 0);
  for (const [key, border] of borders) {
    const a = Math.floor(key / count);
    const b = key % count;
    const above = border.gradient / border.length - ((inner[a] ?? 0) + (inner[b] ?? 0)) / 2;
    const strength = gmax > 0 ? Math.min(1, Math.max(0, above / gmax)) : 0;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const at = fill[from] ?? 0;
      adjacent[at] = to;
      edge[at] = strength;
      fill[from] = at + 1;
    }
  }
  return { width: w, height: h, labels, count, size, color, texture, start, adjacent, edge };
}

/** A grid step that gives about `target` superpixels, from 6 to 32 pixels. */
export function stepFor(width: number, height: number, target = 3000): number {
  return Math.min(32, Math.max(6, Math.round(Math.sqrt((width * height) / target))));
}
