/** Shared helpers for the Learn panel widgets. They read pixels exactly as the filters do. */
import { catalog } from "@/catalog";
import { entryParams } from "@/catalog/params";
import { luma709 } from "@/core/color/convert";
import { borderIndex, type BorderMode } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { processRegion, scopeOf } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { hasTransparency } from "@/core/image/encode";
import { createImage, type RgbaImage } from "@/core/image/types";
import { createMask, type Mask } from "@/core/mask/mask";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Which values a widget shows: luma for the brightness scope, the red channel otherwise. */
export function channelOf(params: Params): "luma" | "red" {
  return scopeOf(params) === "luminance" ? "luma" : "red";
}

export function valueAt(image: RgbaImage, x: number, y: number, channel: "luma" | "red"): number {
  const o = (y * image.width + x) * 4;
  const r = image.data[o] ?? 0;
  return channel === "red" ? r : luma709(r, image.data[o + 1] ?? 0, image.data[o + 2] ?? 0);
}

/** A size x size window around a point, with the border rule for positions outside the image. */
export function windowAt(
  image: RgbaImage,
  point: Point,
  size: number,
  border: BorderMode,
  channel: "luma" | "red",
): number[][] {
  const r = (size - 1) >> 1;
  return Array.from({ length: size }, (_, j) =>
    Array.from({ length: size }, (_, i) => {
      const sx = borderIndex(point.x + i - r, image.width, border);
      const sy = borderIndex(point.y + j - r, image.height, border);
      return sx < 0 || sy < 0 ? 0 : valueAt(image, sx, sy, channel);
    }),
  );
}

export const round = (v: number, digits = 1) => Number(v.toFixed(digits));

/** The value of the real filter at one pixel, before rounding. */
export function engineValueAt(
  filterId: string,
  values: Params,
  image: RgbaImage,
  point: Point,
): number {
  const filter = browserFilter(filterId);
  if (!filter) return Number.NaN;
  const result = processRegion(
    image,
    filter,
    values,
    { x: point.x, y: point.y, width: 1, height: 1 },
    hasTransparency(image),
  );
  return result.color[0].data[0] ?? Number.NaN;
}

/** The top left corner of the patch around a point, and its size. */
export function patchFrame(image: RgbaImage, x: number, y: number, size = 64) {
  const width = Math.min(size, image.width);
  const height = Math.min(size, image.height);
  const x0 = Math.min(Math.max(0, x - (width >> 1)), image.width - width);
  const y0 = Math.min(Math.max(0, y - (height >> 1)), image.height - height);
  return { x0, y0, width, height };
}

/** The patch of the image around a point, at most size x size pixels. */
export function patchAt(image: RgbaImage, x: number, y: number, size = 64): RgbaImage {
  const { x0, y0, width, height } = patchFrame(image, x, y, size);
  const out = createImage(width, height);
  for (let row = 0; row < height; row++) {
    const from = ((y0 + row) * image.width + x0) * 4;
    out.data.set(image.data.subarray(from, from + width * 4), row * width * 4);
  }
  return out;
}

/**
 * The stages of a multi-stage filter for the Stage viewer: the options of its "stage" parameter,
 * or of its "output" parameter when it has no stages.
 */
export function stagesOf(filterId: string): {
  key: string;
  stages: { value: string; label: string }[];
} {
  const entry = catalog.filters.find((f) => f.id === filterId);
  const params = entry ? entryParams(entry) : [];
  const param = params.find((p) => p.key === "stage") ?? params.find((p) => p.key === "output");
  return {
    key: param?.key ?? "stage",
    stages: (param?.options ?? []).map((o) => ({ value: String(o.value), label: o.label })),
  };
}

/** The curve the filter applies to the levels 0 to 255, or null for other filters. */
export function curveOf(
  filterId: string,
  values: Params,
  histogram: ArrayLike<number>,
): number[] | null {
  const filter = browserFilter(filterId);
  if (filter?.kind === "point") {
    const transfer = filter.transfer(values);
    return Array.from({ length: 256 }, (_, v) => transfer(v));
  }
  if ((filter?.kind === "smooth" || filter?.kind === "derived") && filter.pointTable) {
    return Array.from(filter.pointTable(values, histogram));
  }
  return null;
}

/** The radius of the hole that the Stage viewer fills for filters that read the selection. */
export const DEMO_HOLE_RADIUS = 8;

/** A disk at the center of the patch, as the selection of filters that read one. */
export function demoHole(width: number, height: number): Mask {
  const mask = createMask(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2;
      const dy = y + 0.5 - height / 2;
      if (dx * dx + dy * dy <= DEMO_HOLE_RADIUS * DEMO_HOLE_RADIUS) mask.data[y * width + x] = 255;
    }
  }
  return mask;
}
