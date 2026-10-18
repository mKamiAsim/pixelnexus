/**
 * Snap a selection to edges: Select > Modify > Snap to edges, the edge-assisted selection.
 *
 * The selection edge may move by up to `radius` pixels. Those pixels form a band, found with
 * the exact distance transform. The pixels next to the band keep their state and flood into it
 * from both sides, lowest priority first. This is a seeded watershed by flooding, with a bucket
 * queue for the priority. The priority of a band pixel is its edge strength when that is at
 * least the contrast setting. Weaker pixels get a priority below every such edge, which rises
 * toward the old selection edge. So the two floods meet on the strongest edge in the band, and
 * where the band has no edge they meet where the selection edge was.
 *
 * Edge strength is the Sobel gradient of luma divided by its largest value in the image, as in
 * the magnetic lasso (livewire.ts). After snapping, an optional majority smoothing rounds the
 * result, and a 3 x 3 mean softens the edge by one pixel.
 *
 * Catalog entry: catalog/tools/edge-assisted.yaml.
 */
import type { RgbaImage } from "@/core/image/types";
import { squaredDistance } from "@/core/mask/distance";
import { createMask, HALF, type Mask } from "@/core/mask/mask";
import { smoothMask } from "@/core/mask/refine";

import { gradientAt, maxGradient } from "./livewire";
import { antiAliasEdges } from "./wand";

export interface SnapOptions {
  /** How far the edge may move, in pixels. */
  readonly radius: number;
  /** The weakest edge that counts, from 0 to 1 of the strongest edge in the image. */
  readonly contrast: number;
  /** Radius of the majority smoothing afterward, in pixels. 0 for none. */
  readonly smoothing: number;
}

/** Priority levels. Edges use the levels from the contrast setting up. */
const LEVELS = 4096;

export function snapToEdges(
  image: RgbaImage,
  mask: Mask,
  options: SnapOptions,
  gmax: number = maxGradient(image),
): Mask {
  const { width: w, height: h } = mask;
  const n = w * h;
  const selected = (i: number) => (mask.data[i] ?? 0) >= HALF;
  const r2 = options.radius * options.radius;
  const toOutside = squaredDistance(w, h, (i) => !selected(i));
  const toInside = squaredDistance(w, h, selected);
  // -1 for band pixels still to decide, else 1 (selected) or 0.
  const label = new Int8Array(n);
  let bandSize = 0;
  for (let i = 0; i < n; i++) {
    const inBand = selected(i) ? (toOutside[i] ?? 0) <= r2 : (toInside[i] ?? 0) <= r2;
    label[i] = inBand ? -1 : selected(i) ? 1 : 0;
    if (inBand) bandSize++;
  }
  if (bandSize === 0) return mask;

  // Bucket queue: one FIFO list per edge level.
  const buckets: number[][] = Array.from({ length: LEVELS }, () => []);
  const heads = new Int32Array(LEVELS);
  // The first level that is an edge. Lower levels say how near the old edge a pixel is.
  const edgeFloor = Math.max(1, Math.ceil(options.contrast * (LEVELS - 1)));
  const radius = Math.max(1, options.radius);
  const level = (i: number) => {
    const s = gmax > 0 ? gradientAt(image, i % w, Math.floor(i / w)) / gmax : 0;
    if (s >= options.contrast && s > 0) {
      return Math.max(edgeFloor, Math.min(LEVELS - 1, Math.round(s * (LEVELS - 1))));
    }
    const d = Math.sqrt(selected(i) ? (toOutside[i] ?? 0) : (toInside[i] ?? 0));
    const near = 1 - Math.min(1, Math.max(0, (d - 1) / radius));
    return Math.min(edgeFloor - 1, Math.floor(near * (edgeFloor - 1)));
  };
  const neighbors = (i: number) => {
    const x = i % w;
    return [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      i >= w ? i - w : -1,
      i < n - w ? i + w : -1,
    ];
  };
  // The pixels next to the band start the floods, all at the lowest level.
  for (let i = 0; i < n; i++) {
    if (label[i] === -1) continue;
    if (neighbors(i).some((j) => j >= 0 && label[j] === -1)) buckets[0]?.push(i);
  }
  for (let current = 0; current < LEVELS; current++) {
    const bucket = buckets[current] ?? [];
    while ((heads[current] ?? 0) < bucket.length) {
      const i = bucket[heads[current] ?? 0] ?? 0;
      heads[current] = (heads[current] ?? 0) + 1;
      for (const j of neighbors(i)) {
        if (j < 0 || label[j] !== -1) continue;
        label[j] = label[i] ?? 0;
        // A pixel never waits in a lower bucket than the one being emptied.
        buckets[Math.max(current, level(j))]?.push(j);
      }
    }
  }

  let out = createMask(w, h);
  for (let i = 0; i < n; i++) {
    const l = label[i] ?? 0;
    // Pixels outside the band keep their value. Band pixels the floods never reached stay too.
    const inBand = selected(i) ? (toOutside[i] ?? 0) <= r2 : (toInside[i] ?? 0) <= r2;
    out.data[i] = !inBand || l < 0 ? (mask.data[i] ?? 0) : l === 1 ? 255 : 0;
  }
  const smoothing = Math.round(options.smoothing);
  if (smoothing > 0) out = smoothMask(out, smoothing);
  return antiAliasEdges(out);
}
