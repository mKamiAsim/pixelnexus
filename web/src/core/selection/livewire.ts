/**
 * Live wire for the magnetic lasso, after the intelligent scissors of Mortensen and Barrett
 * (SIGGRAPH 1995). The path between two pixels is the cheapest 8-connected path, and steps on
 * strong edges are cheap, so the path follows edges.
 *
 * PixelNexus uses a simpler local cost than the paper. It has only the gradient magnitude term:
 *
 *   c(q) = 1 - G(q) / Gmax   when G(q) >= t * Gmax, else 1
 *   step cost from p to q = (EPS + c(q)) * |q - p|
 *
 * G is the Sobel gradient magnitude of BT.709 luma, Gmax its largest value in the image, t the
 * contrast setting from 0 to 1, and |q - p| is 1 or sqrt(2). EPS = 0.1 makes every step cost
 * something, so a path does not wander along an edge. Where there are no edges every step costs
 * about its length, so the path is a straight line.
 *
 * Catalog entry: catalog/tools/lasso-magnetic.yaml.
 */
import { luma709 } from "@/core/color/convert";
import type { Rect } from "@/core/filters/run";
import type { RgbaImage } from "@/core/image/types";

export const EPS = 0.1;

export interface Pixel {
  readonly x: number;
  readonly y: number;
}

const lumaAt = (image: RgbaImage, x: number, y: number) => {
  const cx = Math.min(image.width - 1, Math.max(0, x));
  const cy = Math.min(image.height - 1, Math.max(0, y));
  const i = (cy * image.width + cx) * 4;
  return luma709(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0);
};

/** Sobel gradient magnitude of luma at one pixel. Pixels outside the image repeat the edge. */
export function gradientAt(image: RgbaImage, x: number, y: number): number {
  const l = (dx: number, dy: number) => lumaAt(image, x + dx, y + dy);
  const gx = l(1, -1) + 2 * l(1, 0) + l(1, 1) - l(-1, -1) - 2 * l(-1, 0) - l(-1, 1);
  const gy = l(-1, 1) + 2 * l(0, 1) + l(1, 1) - l(-1, -1) - 2 * l(0, -1) - l(1, -1);
  return Math.hypot(gx, gy);
}

/**
 * The largest gradient magnitude in the image, Gmax. Same values as `gradientAt`, computed with
 * three rows of luma at a time, so a large image takes one quick pass.
 */
export function maxGradient(image: RgbaImage): number {
  const { width, height, data } = image;
  const row = (y: number) => {
    const out = new Float64Array(width);
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      out[x] = luma709(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    }
    return out;
  };
  let above = row(0);
  let middle = above;
  let below = row(Math.min(height - 1, 1));
  // The largest squared magnitude, so the square root runs once.
  let max2 = 0;
  for (let y = 0; y < height; y++) {
    const top = above;
    const mid = middle;
    const bottom = below;
    for (let x = 0; x < width; x++) {
      const l = x > 0 ? x - 1 : 0;
      const r = x < width - 1 ? x + 1 : width - 1;
      const tl = top[l] ?? 0;
      const tr = top[r] ?? 0;
      const bl = bottom[l] ?? 0;
      const br = bottom[r] ?? 0;
      const gx = tr + 2 * (mid[r] ?? 0) + br - tl - 2 * (mid[l] ?? 0) - bl;
      const gy = bl + 2 * (bottom[x] ?? 0) + br - tl - 2 * (top[x] ?? 0) - tr;
      const g2 = gx * gx + gy * gy;
      if (g2 > max2) max2 = g2;
    }
    above = middle;
    middle = below;
    below = y + 2 < height ? row(y + 2) : below;
  }
  return Math.sqrt(max2);
}

/** Edge strength G / Gmax and step cost c for every pixel of a box. */
export interface EdgeMap {
  readonly box: Rect;
  /** G / Gmax, from 0 to 1. */
  readonly strength: Float32Array;
  /** c(q) from the formula above. */
  readonly cost: Float32Array;
  /** The contrast threshold t. Weaker edges count as no edge. */
  readonly threshold: number;
}

export function edgeMap(image: RgbaImage, box: Rect, gmax: number, contrast: number): EdgeMap {
  const n = box.width * box.height;
  const strength = new Float32Array(n);
  const cost = new Float32Array(n).fill(1);
  if (gmax > 0) {
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        const s = gradientAt(image, box.x + x, box.y + y) / gmax;
        strength[y * box.width + x] = s;
        if (s >= contrast) cost[y * box.width + x] = 1 - s;
      }
    }
  }
  return { box, strength, cost, threshold: contrast };
}

/**
 * The pixel within `radius` of `center` on the strongest edge at least as strong as the
 * threshold. Ties go to the pixel nearest the center. Null when there is no such edge.
 */
export function strongestEdge(map: EdgeMap, center: Pixel, radius: number): Pixel | null {
  const { box, strength, threshold } = map;
  let best: Pixel | null = null;
  let bestStrength = -1;
  let bestDistance = Infinity;
  const r = Math.ceil(radius);
  for (let y = center.y - r; y <= center.y + r; y++) {
    for (let x = center.x - r; x <= center.x + r; x++) {
      const bx = x - box.x;
      const by = y - box.y;
      if (bx < 0 || by < 0 || bx >= box.width || by >= box.height) continue;
      const d = Math.hypot(x - center.x, y - center.y);
      if (d > radius) continue;
      const s = strength[by * box.width + bx] ?? 0;
      if (s < threshold || s === 0) continue;
      if (s > bestStrength || (s === bestStrength && d < bestDistance)) {
        best = { x, y };
        bestStrength = s;
        bestDistance = d;
      }
    }
  }
  return best;
}

/** A binary min-heap of node indices, ordered by a cost array. */
class Heap {
  private readonly items: number[] = [];
  constructor(private readonly key: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(node: number) {
    const { items, key } = this;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = items[parent] ?? 0;
      if ((key[p] ?? 0) <= (key[node] ?? 0)) break;
      items[i] = p;
      i = parent;
    }
    items[i] = node;
  }
  pop(): number {
    const { items, key } = this;
    const top = items[0] ?? -1;
    const last = items.pop() ?? -1;
    if (items.length === 0) return top;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= items.length) break;
      const r = l + 1;
      const child =
        r < items.length && (key[items[r] ?? 0] ?? 0) < (key[items[l] ?? 0] ?? 0) ? r : l;
      const c = items[child] ?? 0;
      if ((key[last] ?? 0) <= (key[c] ?? 0)) break;
      items[i] = c;
      i = child;
    }
    items[i] = last;
    return top;
  }
}

const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/**
 * The cheapest 8-connected path from `from` to `to`, both inside the box, by Dijkstra's
 * algorithm. The path includes both ends. It stays inside the box.
 */
export function livePath(map: EdgeMap, from: Pixel, to: Pixel): Pixel[] {
  const { box, cost } = map;
  const inside = (p: Pixel) =>
    p.x >= box.x && p.y >= box.y && p.x < box.x + box.width && p.y < box.y + box.height;
  if (!inside(from) || !inside(to)) throw new RangeError("Both ends must be inside the box.");
  const w = box.width;
  const n = w * box.height;
  const total = new Float64Array(n).fill(Infinity);
  const previous = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const start = (from.y - box.y) * w + (from.x - box.x);
  const goal = (to.y - box.y) * w + (to.x - box.x);
  total[start] = 0;
  const heap = new Heap(total);
  heap.push(start);
  while (heap.size > 0) {
    const node = heap.pop();
    if (done[node]) continue;
    done[node] = 1;
    if (node === goal) break;
    const x = node % w;
    const y = (node - x) / w;
    for (const [dx, dy, length] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= box.height) continue;
      const next = ny * w + nx;
      if (done[next]) continue;
      const candidate = (total[node] ?? 0) + (EPS + (cost[next] ?? 1)) * length;
      if (candidate < (total[next] ?? Infinity)) {
        total[next] = candidate;
        previous[next] = node;
        heap.push(next);
      }
    }
  }
  const path: Pixel[] = [];
  for (let node = goal; node >= 0; node = node === start ? -1 : (previous[node] ?? -1)) {
    path.push({ x: box.x + (node % w), y: box.y + Math.floor(node / w) });
  }
  return path.reverse();
}

/** Length of a pixel path, counting diagonal steps as sqrt(2). */
export function pathLength(path: readonly Pixel[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Pixel;
    const b = path[i] as Pixel;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/** A box around two pixels, grown by `margin` and clipped to the image. */
export function boxAround(
  image: { width: number; height: number },
  a: Pixel,
  b: Pixel,
  margin: number,
): Rect {
  const x0 = Math.max(0, Math.min(a.x, b.x) - margin);
  const y0 = Math.max(0, Math.min(a.y, b.y) - margin);
  const x1 = Math.min(image.width - 1, Math.max(a.x, b.x) + margin);
  const y1 = Math.min(image.height - 1, Math.max(a.y, b.y) + margin);
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
