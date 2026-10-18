/**
 * Where a filter works: the whole image, the selection, or everything outside it.
 *
 * With a mask, only the bounding box of the pixels the mask touches is processed (decision
 * D10). The framework fills the halo around that box with the real neighboring pixels, so the
 * box gives the same pixels as a whole-image run. A global filter, whose result at one pixel
 * depends on the whole image, processes the whole image and is then masked.
 */
import { fullRect, type Rect } from "@/core/filters/run";
import { invertMask, maskBounds, type Mask } from "@/core/mask/mask";

export type FilterScope = "whole" | "selection" | "inverse";

const inverted = new WeakMap<Mask, Mask>();

/** The mask a filter runs through, or null for the whole image. */
export function scopeMask(selection: Mask | null, scope: FilterScope): Mask | null {
  if (!selection || scope === "whole") return null;
  if (scope === "selection") return selection;
  let mask = inverted.get(selection);
  if (!mask) {
    mask = invertMask(selection);
    inverted.set(selection, mask);
  }
  return mask;
}

/**
 * The part of the image to process. The whole image without a mask or for a global filter,
 * else the bounds of the pixels the mask touches. Null when the mask touches no pixel, so
 * there is nothing to do.
 */
export function processingRegion(
  image: { width: number; height: number },
  mask: Mask | null,
  global: boolean,
): Rect | null {
  if (!mask) return fullRect(image);
  const bounds = maskBounds(mask);
  if (!bounds) return null;
  return global ? fullRect(image) : bounds;
}
