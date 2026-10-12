/**
 * Quick Selection: grow a selection over superpixels from the ones you paint over.
 *
 * The painted superpixels are the seeds. A neighbor of a selected superpixel joins when
 *
 *   min over seeds k of (|color_j - color_k| + |texture_j - texture_k|) + e * 255 * edge(i, j)
 *     <= tolerance
 *
 * Colors are CIELAB scaled by 2.55, texture is the standard deviation of L* (same scale), and
 * edge(i, j) is how much stronger the gradient is on the border of i and j than inside them,
 * from 0 to 1 (see slic.ts). e is the edge sensitivity from 0 to 1. Comparing with the seeds,
 * not with the neighbor, keeps a slow change of color from leading the selection away.
 *
 * This growth rule is PixelNexus's own. It is not from a paper.
 *
 * Catalog entry: catalog/tools/quick-selection.yaml.
 */
import type { Rect } from "@/core/filters/run";
import { createMask, HALF, type Mask } from "@/core/mask/mask";

import type { Superpixels } from "./slic";

export interface GrowOptions {
  /** Largest total difference that still joins, on the 0 to 255 scale. */
  readonly tolerance: number;
  /** Weight of the edge term, from 0 to 1. */
  readonly edgeSensitivity: number;
}

/**
 * The superpixels a stroke touches: those with a pixel where `stroke` is at least 128. Pass the
 * changed rectangle of the stroke to look only there.
 */
export function touchedSuperpixels(
  sp: Superpixels,
  stroke: Mask,
  rect: Rect = { x: 0, y: 0, width: stroke.width, height: stroke.height },
): Set<number> {
  const seeds = new Set<number>();
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const p = y * stroke.width + x;
      if ((stroke.data[p] ?? 0) >= HALF) seeds.add(sp.labels[p] ?? 0);
    }
  }
  return seeds;
}

/** Grow from the seeds. Returns 1 for each selected superpixel and 0 for the others. */
export function growSuperpixels(
  sp: Superpixels,
  seeds: Iterable<number>,
  options: GrowOptions,
): Uint8Array {
  const selected = new Uint8Array(sp.count);
  const seedList = [...new Set(seeds)].filter((s) => s >= 0 && s < sp.count);
  const queue: number[] = [];
  for (const s of seedList) {
    selected[s] = 1;
    queue.push(s);
  }
  // The difference of each superpixel from the nearest seed, computed once when first needed.
  const difference = new Float32Array(sp.count).fill(-1);
  const differenceOf = (j: number) => {
    const known = difference[j] ?? -1;
    if (known >= 0) return known;
    let best = Infinity;
    for (const k of seedList) {
      const d =
        Math.hypot(
          (sp.color[j * 3] ?? 0) - (sp.color[k * 3] ?? 0),
          (sp.color[j * 3 + 1] ?? 0) - (sp.color[k * 3 + 1] ?? 0),
          (sp.color[j * 3 + 2] ?? 0) - (sp.color[k * 3 + 2] ?? 0),
        ) + Math.abs((sp.texture[j] ?? 0) - (sp.texture[k] ?? 0));
      if (d < best) best = d;
    }
    difference[j] = best;
    return best;
  };
  const edgeWeight = Math.min(1, Math.max(0, options.edgeSensitivity)) * 255;
  while (queue.length > 0) {
    const i = queue.pop() ?? 0;
    for (let at = sp.start[i] ?? 0; at < (sp.start[i + 1] ?? 0); at++) {
      const j = sp.adjacent[at] ?? 0;
      if (selected[j]) continue;
      const cost = differenceOf(j) + edgeWeight * (sp.edge[at] ?? 0);
      if (cost <= options.tolerance) {
        selected[j] = 1;
        queue.push(j);
      }
    }
  }
  return selected;
}

/** A mask at the superpixel resolution: 255 on the selected superpixels. */
export function superpixelMask(sp: Superpixels, selected: Uint8Array): Mask {
  const mask = createMask(sp.width, sp.height);
  for (let p = 0; p < sp.labels.length; p++) {
    if (selected[sp.labels[p] ?? 0]) mask.data[p] = 255;
  }
  return mask;
}
