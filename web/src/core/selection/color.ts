/**
 * Colors for selection tools: sampling and distances.
 *
 * Every distance uses a scale on which black to white is 255, so one tolerance value means about
 * the same in each color space:
 *
 * - RGB: Euclidean distance between the stored values.
 * - Lab: CIE76 color difference (Euclidean distance in Lab) times 2.55, because L runs from 0
 *   to 100.
 * - HSV: Euclidean distance in the HSV cone, with x = 255 s v cos(h), y = 255 s v sin(h) and
 *   z = 255 v. Hue is circular there, and hue matters less for dark and gray colors, which
 *   have little of it to show.
 */
import { rgbToHsv, rgbToLab } from "@/core/color/convert";
import type { RgbaImage } from "@/core/image/types";

export type ColorSpace = "rgb" | "hsv" | "lab";

export const COLOR_SPACES: readonly ColorSpace[] = ["rgb", "hsv", "lab"];

/** A color as three coordinates in one of the spaces above. */
export type Coords = readonly [number, number, number];

export function toCoords(r: number, g: number, b: number, space: ColorSpace): Coords {
  if (space === "rgb") return [r, g, b];
  if (space === "lab") {
    const [l, a, bb] = rgbToLab(r, g, b);
    return [l * 2.55, a * 2.55, bb * 2.55];
  }
  const [h, s, v] = rgbToHsv(r, g, b);
  const radians = (h * Math.PI) / 180;
  return [255 * s * v * Math.cos(radians), 255 * s * v * Math.sin(radians), 255 * v];
}

export function distance(a: Coords, b: Coords): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Coordinates of every pixel, three numbers per pixel. */
export function imageCoords(image: RgbaImage, space: ColorSpace): Float32Array {
  const n = image.width * image.height;
  const out = new Float32Array(n * 3);
  const d = image.data;
  // Many images repeat colors, so convert each distinct color once.
  const cache = space === "rgb" ? null : new Map<number, Coords>();
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] ?? 0;
    const g = d[i * 4 + 1] ?? 0;
    const b = d[i * 4 + 2] ?? 0;
    let c: Coords;
    if (cache) {
      const key = (r << 16) | (g << 8) | b;
      c = cache.get(key) ?? toCoords(r, g, b, space);
      if (cache.size < 1 << 16) cache.set(key, c);
    } else {
      c = [r, g, b];
    }
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}

/**
 * The mean color of a size x size square around (x, y), as stored values. Pixels outside the
 * image are left out. Size 1 reads one pixel.
 */
export function sampleColor(
  image: RgbaImage,
  x: number,
  y: number,
  size: number,
): readonly [number, number, number] {
  const half = Math.floor(size / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let j = y - half; j <= y + half; j++) {
    if (j < 0 || j >= image.height) continue;
    for (let i = x - half; i <= x + half; i++) {
      if (i < 0 || i >= image.width) continue;
      const at = (j * image.width + i) * 4;
      r += image.data[at] ?? 0;
      g += image.data[at + 1] ?? 0;
      b += image.data[at + 2] ?? 0;
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
