/**
 * Encode an image into a file for export. Browser only: JPEG and WebP use OffscreenCanvas.
 *
 * - PNG uses the exact encoder in png.ts, so semi-transparent colors keep their values.
 * - TIFF uses utif2 and writes uncompressed 8-bit RGBA.
 * - JPEG and WebP use the browser's encoder with a quality setting.
 *
 * No encoder writes EXIF, GPS, camera or color profile metadata. PNG writes only an sRGB chunk.
 */
import * as UTIF from "utif2";

import { formatInfo, type ExportFormat } from "@/core/image/export-names";
import { encodePng } from "@/core/image/png";
import type { RgbaImage } from "@/core/image/types";

export type Rgb8 = readonly [number, number, number];

export interface EncodeOptions {
  readonly format: ExportFormat;
  /** Quality from 0 to 1 for JPEG and WebP. Ignored by PNG and TIFF. */
  readonly quality?: number;
  /** Color behind transparent pixels, for formats without alpha (JPEG). */
  readonly background?: Rgb8;
}

export const DEFAULT_QUALITY = 0.92;
export const WHITE: Rgb8 = [255, 255, 255];

/**
 * Blend every pixel over an opaque background color. The result is fully opaque.
 * out = a * c + (1 - a) * b, rounded to the nearest integer.
 */
export function flatten(image: RgbaImage, background: Rgb8 = WHITE): RgbaImage {
  const out = new Uint8ClampedArray(image.data.length);
  const { data } = image;
  for (let o = 0; o < data.length; o += 4) {
    const a = (data[o + 3] ?? 0) / 255;
    out[o] = Math.round(a * (data[o] ?? 0) + (1 - a) * background[0]);
    out[o + 1] = Math.round(a * (data[o + 1] ?? 0) + (1 - a) * background[1]);
    out[o + 2] = Math.round(a * (data[o + 2] ?? 0) + (1 - a) * background[2]);
    out[o + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/** True when any pixel is not fully opaque. */
export function hasTransparency(image: RgbaImage): boolean {
  const { data } = image;
  for (let o = 3; o < data.length; o += 4) if (data[o] !== 255) return true;
  return false;
}

async function encodeWithCanvas(image: RgbaImage, mime: string, quality: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create image files.");
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  // Browsers that cannot write a format fall back to PNG without saying so.
  if (blob.type !== mime) {
    throw new Error(`This browser cannot write ${mime.replace("image/", "").toUpperCase()} files.`);
  }
  return blob;
}

export async function encodeImage(image: RgbaImage, options: EncodeOptions): Promise<Blob> {
  const info = formatInfo(options.format);
  const quality = Math.min(1, Math.max(0, options.quality ?? DEFAULT_QUALITY));
  switch (options.format) {
    case "png":
      return new Blob([(await encodePng(image)).slice()], { type: info.mime });
    case "tiff": {
      const bytes = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
      return new Blob([UTIF.encodeImage(bytes, image.width, image.height)], { type: info.mime });
    }
    case "jpeg":
      return encodeWithCanvas(flatten(image, options.background ?? WHITE), info.mime, quality);
    case "webp":
      return encodeWithCanvas(image, info.mime, quality);
  }
}
