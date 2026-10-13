/**
 * The filter framework. It runs any browser filter in the same steps:
 *
 * 1. Pad the region with a halo as wide as the filter's support radius, using the border mode.
 * 2. Split the image into float planes and apply the channel scope (RGB, brightness or color).
 * 3. Run the filter's own function.
 * 4. Cut the halo off again.
 * 5. Map the values to 8 bits: clip for most filters, the output mapping for signed results.
 *
 * Because step 1 fills the halo with exactly the pixels a whole-image run would read, any tile
 * of the image gives the same pixels as a whole-image run. The worker pool relies on this.
 */
import { hasTransparency } from "@/core/image/encode";
import type { RgbaImage } from "@/core/image/types";

import {
  borderIndex,
  createPlane,
  fromLinearLight,
  isBorderMode,
  rgbToYcc,
  toLinearLight,
  toPlanes,
  yccToRgb,
  type BorderMode,
  type Plane,
} from "./planes";
import type {
  BrowserFilter,
  ChannelScope,
  OutputMapping,
  Params,
  PlaneContext,
  PlaneFilter,
} from "./types";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Float results of a filter, before the mapping to 8 bits. */
export interface Processed {
  readonly color: readonly [Plane, Plane, Plane];
  readonly alpha: Plane;
  /** True when the values are a new signed quantity that needs the output mapping. */
  readonly derived: boolean;
  readonly warnings: readonly string[];
}

export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

export const fullRect = (image: { width: number; height: number }): Rect => ({
  x: 0,
  y: 0,
  width: image.width,
  height: image.height,
});

const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function borderOf(params: Params): BorderMode {
  return isBorderMode(params.border) ? params.border : "reflect101";
}

export function scopeOf(params: Params): ChannelScope {
  const scope = params.channelScope;
  return scope === "per-channel" || scope === "luminance" || scope === "chroma" ? scope : "rgb";
}

export function mappingOf(params: Params): OutputMapping {
  const mapping = params.outputMapping;
  return mapping === "offset" || mapping === "normalize" || mapping === "clip" ? mapping : "abs";
}

/**
 * Copy a region of the image plus a halo of `halo` pixels on every side. Halo pixels outside
 * the image are filled by the border rule. The constant mode fills them with transparent black.
 */
export function padRegion(
  image: RgbaImage,
  region: Rect,
  halo: number,
  border: BorderMode,
): RgbaImage {
  const width = region.width + 2 * halo;
  const height = region.height + 2 * halo;
  const data = new Uint8ClampedArray(width * height * 4);
  const xs = Int32Array.from({ length: width }, (_, i) =>
    borderIndex(region.x - halo + i, image.width, border),
  );
  for (let j = 0; j < height; j++) {
    const sy = borderIndex(region.y - halo + j, image.height, border);
    if (sy < 0) continue;
    const rowStart = sy * image.width;
    for (let i = 0; i < width; i++) {
      const sx = xs[i] ?? -1;
      if (sx < 0) continue;
      const from = (rowStart + sx) * 4;
      const to = (j * width + i) * 4;
      data[to] = image.data[from] ?? 0;
      data[to + 1] = image.data[from + 1] ?? 0;
      data[to + 2] = image.data[from + 2] ?? 0;
      data[to + 3] = image.data[from + 3] ?? 0;
    }
  }
  return { width, height, data };
}

/**
 * Run a plane function with alpha weighting: average alpha times color, then divide by the
 * average alpha. Transparent pixels then add no color. Where the average alpha is 0, the
 * color stays as it was. For an opaque image this equals running the function directly.
 */
function alphaWeighted(
  run: (plane: Plane) => Plane,
  plane: Plane,
  alpha: Plane,
  alphaRun: Plane,
): Plane {
  const premultiplied = createPlane(plane.width, plane.height);
  for (let i = 0; i < plane.data.length; i++) {
    premultiplied.data[i] = ((plane.data[i] ?? 0) * (alpha.data[i] ?? 0)) / 255;
  }
  const numerator = run(premultiplied);
  const out = createPlane(plane.width, plane.height);
  for (let i = 0; i < out.data.length; i++) {
    const weight = (alphaRun.data[i] ?? 0) / 255;
    out.data[i] = weight > 1e-6 ? (numerator.data[i] ?? 0) / weight : (plane.data[i] ?? 0);
  }
  return out;
}

function processPlanes(
  filter: PlaneFilter,
  params: Params,
  r: Plane,
  g: Plane,
  b: Plane,
  a: Plane,
  options: ProcessOptions,
): { color: [Plane, Plane, Plane]; warnings: string[] } {
  const { originX, originY } = options;
  const border = borderOf(params);
  const scope = scopeOf(params);
  const warnings: string[] = [];
  const context = (channel: number): PlaneContext => ({ border, originX, originY, channel });
  const weighted = filter.kind === "smooth" && filter.alphaWeighted && options.transparent;
  const alphaRun = weighted ? filter.plane(a, params, context(3)) : null;
  const apply = (plane: Plane, channel: number) => {
    const run = (input: Plane) => filter.plane(input, params, context(channel));
    return alphaRun ? alphaWeighted(run, plane, a, alphaRun) : run(plane);
  };

  if (scope === "rgb" || scope === "per-channel") {
    const linear = filter.kind === "smooth" && params.linearLight === true;
    const planes = [r, g, b].map((plane, channel) => {
      if (!linear) return apply(plane, channel);
      toLinearLight(plane);
      const out = apply(plane, channel);
      fromLinearLight(out);
      return out;
    });
    return { color: planes as [Plane, Plane, Plane], warnings };
  }
  if (params.linearLight === true) {
    warnings.push("Linear light works with the RGB channels only, so it was not used.");
  }
  const [y, cb, cr] = rgbToYcc(r, g, b);
  if (scope === "luminance") {
    const yOut = apply(y, 0);
    if (filter.kind === "derived") return { color: [yOut, yOut, yOut], warnings };
    return { color: yccToRgb(yOut, cb, cr), warnings };
  }
  if (filter.kind === "derived") {
    throw new Error(`The filter "${filter.id}" cannot work on color only.`);
  }
  return { color: yccToRgb(y, apply(cb, 1), apply(cr, 2)), warnings };
}

export interface ProcessOptions {
  /** Image x of the input's first column. */
  readonly originX: number;
  /** Image y of the input's first row. */
  readonly originY: number;
  /**
   * True when the source image has any pixel that is not fully opaque. It is decided once for
   * the whole image, so every tile treats alpha the same way.
   */
  readonly transparent: boolean;
  /** A guide image of the same size as the input, padded the same way. */
  readonly guide?: RgbaImage;
}

/** Run a filter on a whole (padded) image and return float planes. */
export function processImage(
  input: RgbaImage,
  filter: BrowserFilter,
  params: Params,
  options: ProcessOptions = { originX: 0, originY: 0, transparent: hasTransparency(input) },
): Processed {
  const { originX, originY } = options;
  const [r, g, b, a] = toPlanes(input);
  switch (filter.kind) {
    case "smooth":
    case "derived": {
      const { color, warnings } = processPlanes(filter, params, r, g, b, a, options);
      return { color, alpha: a, derived: filter.kind === "derived", warnings };
    }
    case "color": {
      const guide = options.guide ? toPlanes(options.guide) : null;
      const context = {
        border: borderOf(params),
        originX,
        originY,
        channel: 0,
        ...(guide ? { guide: [guide[0], guide[1], guide[2]] as const } : {}),
      };
      const color = filter.color([r, g, b], params, context);
      return { color, alpha: a, derived: false, warnings: [] };
    }
    case "point": {
      const transfer = filter.transfer(params);
      const table = Float64Array.from({ length: 256 }, (_, v) => transfer(v));
      const map = (plane: Plane) => {
        for (let i = 0; i < plane.data.length; i++) {
          const v = plane.data[i] ?? 0;
          plane.data[i] = Number.isInteger(v) && v >= 0 && v <= 255 ? (table[v] ?? 0) : transfer(v);
        }
      };
      if (scopeOf(params) === "luminance") {
        const [y, cb, cr] = rgbToYcc(r, g, b);
        map(y);
        return { color: yccToRgb(y, cb, cr), alpha: a, derived: false, warnings: [] };
      }
      [r, g, b].forEach(map);
      return { color: [r, g, b], alpha: a, derived: false, warnings: [] };
    }
    case "pixel": {
      const out = new Float64Array(3);
      for (let i = 0; i < r.data.length; i++) {
        filter.pixel(r.data[i] ?? 0, g.data[i] ?? 0, b.data[i] ?? 0, params, out);
        r.data[i] = out[0] ?? 0;
        g.data[i] = out[1] ?? 0;
        b.data[i] = out[2] ?? 0;
      }
      return { color: [r, g, b], alpha: a, derived: false, warnings: [] };
    }
    case "noise":
      filter.noise([r, g, b], params, originX, originY);
      return { color: [r, g, b], alpha: a, derived: false, warnings: [] };
  }
}

function cropPlane(plane: Plane, rect: Rect): Plane {
  const out = createPlane(rect.width, rect.height);
  for (let j = 0; j < rect.height; j++) {
    const from = (rect.y + j) * plane.width + rect.x;
    out.data.set(plane.data.subarray(from, from + rect.width), j * rect.width);
  }
  return out;
}

/** Cut a rectangle out of float results, for example to remove the halo. */
export function cropProcessed(processed: Processed, rect: Rect): Processed {
  const [r, g, b] = processed.color;
  const crop = (p: Plane) => cropPlane(p, rect);
  const gray = r === g && g === b;
  const red = crop(r);
  return {
    color: gray ? [red, red, red] : [red, crop(g), crop(b)],
    alpha: crop(processed.alpha),
    derived: processed.derived,
    warnings: processed.warnings,
  };
}

/** The smallest and largest value over all three color planes. */
export function valueRange(processed: Processed): ValueRange {
  let min = Infinity;
  let max = -Infinity;
  for (const plane of new Set(processed.color)) {
    for (const v of plane.data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

/** Join two ranges, for results computed in tiles. */
export function joinRanges(a: ValueRange, b: ValueRange): ValueRange {
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

/** The 8-bit value for one float result. NaN becomes 0. */
export function mapValue(value: number, mapping: OutputMapping, range?: ValueRange): number {
  let v = value;
  if (mapping === "abs") v = Math.abs(v);
  else if (mapping === "offset") v = v + 128;
  else if (mapping === "normalize") {
    const { min, max } = range ?? { min: 0, max: 255 };
    v = max > min ? ((v - min) / (max - min)) * 255 : 0;
  }
  if (Number.isNaN(v)) return 0;
  return Math.min(255, Math.max(0, Math.round(v)));
}

/**
 * Turn float results into an 8-bit RGBA image. Results that keep their meaning are clipped.
 * Signed results use the mapping. Alpha is kept.
 */
export function toBytes(
  processed: Processed,
  mapping: OutputMapping,
  range?: ValueRange,
): RgbaImage {
  const [r, g, b] = processed.color;
  const { width, height } = r;
  const data = new Uint8ClampedArray(width * height * 4);
  const map = processed.derived ? mapping : "clip";
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    data[o] = mapValue(r.data[i] ?? 0, map, range);
    data[o + 1] = mapValue(g.data[i] ?? 0, map, range);
    data[o + 2] = mapValue(b.data[i] ?? 0, map, range);
    data[o + 3] = processed.alpha.data[i] ?? 0;
  }
  return { width, height, data };
}

export interface FilterOutput {
  /** The filtered region, the size of the region. */
  readonly image: RgbaImage;
  readonly warnings: readonly string[];
}

/**
 * Run a filter on a region, or on the whole image, in this thread. `guide` is an image of the
 * same size for filters that use one.
 */
export function runFilter(
  image: RgbaImage,
  filter: BrowserFilter,
  params: Params,
  region: Rect = fullRect(image),
  guide?: RgbaImage,
): FilterOutput {
  const processed = processRegion(image, filter, params, region, hasTransparency(image), guide);
  const mapping = mappingOf(params);
  const range = processed.derived && mapping === "normalize" ? valueRange(processed) : undefined;
  return { image: toBytes(processed, mapping, range), warnings: processed.warnings };
}

/** Float results for a region: pad, process, cut the halo off. */
export function processRegion(
  image: RgbaImage,
  filter: BrowserFilter,
  params: Params,
  region: Rect,
  transparent: boolean,
  guide?: RgbaImage,
): Processed {
  const whole = fullRect(image);
  if (filter.global && !sameRect(region, whole)) {
    return cropProcessed(processRegion(image, filter, params, whole, transparent, guide), region);
  }
  const halo = filter.radius(params);
  const padded = padRegion(image, region, halo, borderOf(params));
  const processed = processImage(padded, filter, params, {
    originX: region.x - halo,
    originY: region.y - halo,
    transparent,
    ...(guide ? { guide: padRegion(guide, region, halo, borderOf(params)) } : {}),
  });
  return halo === 0
    ? processed
    : cropProcessed(processed, { x: halo, y: halo, width: region.width, height: region.height });
}
