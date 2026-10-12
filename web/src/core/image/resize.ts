/**
 * Resize for export. Browser only. It uses the browser's high-quality resampling, then reads the
 * pixels back through the exact path in decode.ts. The resampling filters with documented maths
 * arrive with the geometric filters in Phase 5f.
 */
import { readBitmapPixels } from "@/core/image/decode";
import type { RgbaImage } from "@/core/image/types";

export async function resizeImage(
  image: RgbaImage,
  width: number,
  height: number,
): Promise<RgbaImage> {
  if (width === image.width && height === image.height) return image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Size must be positive integers, got ${width}x${height}.`);
  }
  const bitmap = await createImageBitmap(new ImageData(image.data, image.width, image.height), {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  try {
    return readBitmapPixels(bitmap).image;
  } finally {
    bitmap.close();
  }
}
