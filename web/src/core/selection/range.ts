/**
 * Global selections by color and by tone: Color Range, select by brightness, and select by hue
 * and saturation. They look at every pixel, not only connected ones, and give soft masks.
 *
 * Catalog entries: catalog/tools/color-range.yaml, select-brightness.yaml and select-hsv.yaml.
 */
import { luma709, rgbToHsv } from "@/core/color/convert";
import type { RgbaImage } from "@/core/image/types";
import { createMask, type Mask } from "@/core/mask/mask";

import { distance, imageCoords, sampleColor, toCoords, type ColorSpace } from "./color";

/** 1 up to `full`, then a straight fall to 0 over `soft` more units. */
export function ramp(value: number, full: number, soft: number): number {
  if (value <= full) return 1;
  if (soft <= 0) return 0;
  return Math.max(0, 1 - (value - full) / soft);
}

export type RangePreset = "sampled" | "highlights" | "midtones" | "shadows";

export interface RangeSample {
  readonly x: number;
  readonly y: number;
  readonly color?: readonly [number, number, number];
}

export interface ColorRangeOptions {
  readonly preset: RangePreset;
  /**
   * Pixels the user sampled. Used by the "sampled" preset. `color` is the sampled color. When it
   * is missing, the pixel at (x, y) is read. A preview on a smaller copy passes the colors read
   * from the full image, so it matches the final result.
   */
  readonly samples: readonly RangeSample[];
  /** Distance up to which a color is fully selected. */
  readonly tolerance: number;
  /** Extra distance over which the selection fades to 0. */
  readonly fuzziness: number;
  readonly colorSpace: ColorSpace;
  /** Weight each sample by how near the pixel is to it. */
  readonly localized: boolean;
  /** For localized colors: the reach of a sample, in percent of the longer image side. */
  readonly range: number;
}

/**
 * Tone weights from BT.709 luma Y (0 to 255). Each is a straight ramp of 64 levels, and the
 * three add up to 1 at every level:
 * shadows are 1 up to 64 and 0 from 128, midtones peak at 128 and are 0 below 64 and above 192,
 * highlights are 0 up to 128 and 1 from 192.
 */
export function toneWeight(preset: Exclude<RangePreset, "sampled">, y: number): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  if (preset === "shadows") return clamp((128 - y) / 64);
  if (preset === "highlights") return clamp((y - 128) / 64);
  return clamp(1 - Math.abs(y - 128) / 64);
}

/** Color Range: a soft mask of the pixels near the sampled colors, or of a tonal range. */
export function colorRange(image: RgbaImage, options: ColorRangeOptions): Mask {
  const { width, height, data } = image;
  const mask = createMask(width, height);
  if (options.preset !== "sampled") {
    const preset = options.preset;
    for (let i = 0; i < width * height; i++) {
      const y = luma709(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
      mask.data[i] = Math.round(toneWeight(preset, y) * 255);
    }
    return mask;
  }
  const samples = options.samples.filter(
    (s) => s.x >= 0 && s.y >= 0 && s.x < width && s.y < height,
  );
  if (samples.length === 0) return mask;
  const coords = imageCoords(image, options.colorSpace);
  const seeds = samples.map((s) =>
    toCoords(...(s.color ?? sampleColor(image, s.x, s.y, 1)), options.colorSpace),
  );
  const reach = (options.range / 100) * Math.max(width, height);
  for (let i = 0; i < width * height; i++) {
    const c = [coords[i * 3] ?? 0, coords[i * 3 + 1] ?? 0, coords[i * 3 + 2] ?? 0] as const;
    const px = i % width;
    const py = Math.floor(i / width);
    let best = 0;
    for (let k = 0; k < seeds.length; k++) {
      let value = ramp(distance(c, seeds[k] as typeof c), options.tolerance, options.fuzziness);
      if (options.localized && value > 0) {
        const s = samples[k] as { x: number; y: number };
        value *= Math.max(0, 1 - Math.hypot(px - s.x, py - s.y) / Math.max(1, reach));
      }
      if (value > best) best = value;
    }
    mask.data[i] = Math.round(best * 255);
  }
  return mask;
}

export interface BrightnessOptions {
  /** Lowest fully selected luma, 0 to 255. */
  readonly low: number;
  /** Highest fully selected luma, 0 to 255. */
  readonly high: number;
  /** Levels over which the selection fades outside the range. */
  readonly softness: number;
}

/** Select by brightness: BT.709 luma of the stored values within a range. */
export function selectBrightness(image: RgbaImage, options: BrightnessOptions): Mask {
  const { width, height, data } = image;
  const low = Math.min(options.low, options.high);
  const high = Math.max(options.low, options.high);
  const mask = createMask(width, height);
  for (let i = 0; i < width * height; i++) {
    const y = luma709(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
    const below = ramp(low - y, 0, options.softness);
    const above = ramp(y - high, 0, options.softness);
    mask.data[i] = Math.round(Math.min(below, above) * 255);
  }
  return mask;
}

export interface HsvOptions {
  /** Center hue in degrees, 0 to 360. */
  readonly hue: number;
  /** Half-width of the hue range in degrees, 0 to 180. 180 accepts every hue. */
  readonly hueWidth: number;
  /** Saturation range in percent. */
  readonly saturationMin: number;
  readonly saturationMax: number;
  /** Value (brightness in HSV) range in percent. */
  readonly valueMin: number;
  readonly valueMax: number;
  /** Fade outside every range: degrees for hue, percent for saturation and value. */
  readonly softness: number;
}

/** The distance from `v` to the range [lo, hi], 0 inside it. */
const outside = (v: number, lo: number, hi: number) =>
  v < Math.min(lo, hi) ? Math.min(lo, hi) - v : v > Math.max(lo, hi) ? v - Math.max(lo, hi) : 0;

/**
 * Select by hue, saturation and value. The hue distance goes around the color circle, so 350
 * and 10 degrees are 20 degrees apart. Gray pixels have no hue, and count as hue 0.
 */
export function selectHsv(image: RgbaImage, options: HsvOptions): Mask {
  const { width, height, data } = image;
  const mask = createMask(width, height);
  for (let i = 0; i < width * height; i++) {
    const [h, s, v] = rgbToHsv(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
    const around = Math.abs(((((h - options.hue) % 360) + 540) % 360) - 180);
    const mh = options.hueWidth >= 180 ? 1 : ramp(around, options.hueWidth, options.softness);
    const ms = ramp(
      outside(s * 100, options.saturationMin, options.saturationMax),
      0,
      options.softness,
    );
    const mv = ramp(outside(v * 100, options.valueMin, options.valueMax), 0, options.softness);
    mask.data[i] = Math.round(Math.min(mh, ms, mv) * 255);
  }
  return mask;
}
