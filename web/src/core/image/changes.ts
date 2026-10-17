/**
 * What a step changed about an image besides its pixels (PLAN.md Phase 8): its size, its
 * transparency, or its color. The studio warns about these, since they are easy to miss and can
 * matter later, for example when a JPEG export drops transparency or a gray result loses color.
 *
 * Bit depth and color space do not change between steps: the studio works in 8-bit sRGB
 * throughout. Those are checked when a file is opened (limits.ts) and when it is exported.
 */
import type { RgbaImage } from "./types";

const transparentCache = new WeakMap<RgbaImage, boolean>();
const grayCache = new WeakMap<RgbaImage, boolean>();

function transparent(image: RgbaImage): boolean {
  let known = transparentCache.get(image);
  if (known === undefined) {
    known = false;
    for (let o = 3; o < image.data.length; o += 4) {
      if (image.data[o] !== 255) {
        known = true;
        break;
      }
    }
    transparentCache.set(image, known);
  }
  return known;
}

/** True when every pixel has equal red, green and blue. */
function gray(image: RgbaImage): boolean {
  let known = grayCache.get(image);
  if (known === undefined) {
    known = true;
    for (let o = 0; o < image.data.length; o += 4) {
      if (image.data[o] !== image.data[o + 1] || image.data[o] !== image.data[o + 2]) {
        known = false;
        break;
      }
    }
    grayCache.set(image, known);
  }
  return known;
}

/** Plain sentences about what changed from `before` to `after`, or none. */
export function describeChanges(before: RgbaImage, after: RgbaImage): string[] {
  if (before === after) return [];
  const notes: string[] = [];
  if (before.width !== after.width || before.height !== after.height) {
    notes.push(
      `The size changed from ${before.width} x ${before.height} to ${after.width} x ${after.height} pixels.`,
    );
  }
  const was = transparent(before);
  const is = transparent(after);
  if (!was && is)
    notes.push("Parts of the image are now transparent. JPEG export would make them white.");
  if (was && !is) notes.push("The image has no transparency any more.");
  if (!gray(before) && gray(after))
    notes.push("The image has no color any more. Red, green and blue are equal everywhere.");
  return notes;
}
