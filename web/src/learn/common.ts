/** Shared helpers for the Learn panel widgets. They read pixels exactly as the filters do. */
import { luma709 } from "@/core/color/convert";
import { borderIndex, type BorderMode } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { processRegion, scopeOf } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { hasTransparency } from "@/core/image/encode";
import type { RgbaImage } from "@/core/image/types";

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
