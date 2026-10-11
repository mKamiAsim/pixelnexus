import { luma709 } from "@/core/color/convert";
import type { RgbaImage } from "@/core/image/types";

/** 256-bin histograms of an 8-bit image. Luma uses BT.709 weights on encoded values. */
export interface Histogram {
  readonly red: Uint32Array;
  readonly green: Uint32Array;
  readonly blue: Uint32Array;
  readonly luma: Uint32Array;
  readonly alpha: Uint32Array;
  readonly pixels: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Count values in the whole image, or in a rectangle that is clipped to the image. */
export function computeHistogram(image: RgbaImage, rect?: Rect): Histogram {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0));
  const y0 = Math.max(0, Math.floor(rect?.y ?? 0));
  const x1 = Math.min(image.width, x0 + Math.floor(rect?.width ?? image.width));
  const y1 = Math.min(image.height, y0 + Math.floor(rect?.height ?? image.height));
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const alpha = new Uint32Array(256);
  const { data, width } = image;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4;
      const r = data[o] ?? 0;
      const g = data[o + 1] ?? 0;
      const b = data[o + 2] ?? 0;
      red[r] += 1;
      green[g] += 1;
      blue[b] += 1;
      luma[Math.round(luma709(r, g, b))] += 1;
      alpha[data[o + 3] ?? 0] += 1;
    }
  }
  return { red, green, blue, luma, alpha, pixels: Math.max(0, x1 - x0) * Math.max(0, y1 - y0) };
}
