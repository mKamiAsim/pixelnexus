/**
 * Decode image bytes into an 8-bit RGBA image. Browser only: it needs createImageBitmap and
 * OffscreenCanvas, so it runs in the decode worker.
 *
 * Pixels are read back through WebGL2 with premultiplied alpha turned off. A 2D canvas would
 * premultiply and then divide again, which rounds semi-transparent colors. The 2D canvas is only
 * a fallback for browsers without WebGL2 in workers.
 */
import * as UTIF from "utif2";

import { ImageFormatError, MIME_TYPES, type ImageHeader } from "@/core/image/format";
import type { RgbaImage } from "@/core/image/types";

export type DecodePath = "webgl2" | "canvas2d" | "utif";

export interface DecodeResult {
  readonly image: RgbaImage;
  /** How the pixels were read. The 2D canvas path can round semi-transparent colors. */
  readonly path: DecodePath;
}

function readExact(bitmap: ImageBitmap): Uint8ClampedArray<ArrayBuffer> | null {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: false });
  if (!gl) return null;
  const { width, height } = bitmap;
  try {
    if (
      width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
      height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
    ) {
      return null;
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    // The texture is attached directly, so row 0 of the read is row 0 of the image.
    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return gl.getError() === gl.NO_ERROR ? pixels : null;
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function readWithCanvas(bitmap: ImageBitmap): Uint8ClampedArray<ArrayBuffer> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ImageFormatError("This browser cannot read image pixels.");
  context.drawImage(bitmap, 0, 0);
  // The canvas owns a plain ArrayBuffer here. The type only allows for shared buffers.
  return context.getImageData(0, 0, bitmap.width, bitmap.height)
    .data as Uint8ClampedArray<ArrayBuffer>;
}

function decodeTiff(bytes: Uint8Array): DecodeResult {
  const buffer = bytes.slice().buffer;
  const pages = UTIF.decode(buffer);
  const page = pages[0];
  if (!page) throw new ImageFormatError("The TIFF file has no pages.");
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  if (!page.width || !page.height || rgba.length !== page.width * page.height * 4) {
    throw new ImageFormatError("This TIFF variant is not supported.");
  }
  return {
    image: {
      width: page.width,
      height: page.height,
      data: Uint8ClampedArray.from(rgba),
    },
    path: "utif",
  };
}

/**
 * Read the pixels of a decoded bitmap. Uses the exact WebGL2 path when it can, and the 2D canvas
 * otherwise.
 */
export function readBitmapPixels(bitmap: ImageBitmap): DecodeResult {
  const exact = readExact(bitmap);
  const data = exact ?? readWithCanvas(bitmap);
  return {
    image: { width: bitmap.width, height: bitmap.height, data },
    path: exact ? "webgl2" : "canvas2d",
  };
}

/** Decode the first frame. EXIF orientation is applied and colors are converted to sRGB. */
export async function decodeImageBytes(
  bytes: Uint8Array,
  header: ImageHeader,
): Promise<DecodeResult> {
  if (header.format === "tiff") return decodeTiff(bytes);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      new Blob([bytes.slice()], { type: MIME_TYPES[header.format] }),
      {
        premultiplyAlpha: "none",
        colorSpaceConversion: "default",
        imageOrientation: "from-image",
      },
    );
  } catch {
    throw new ImageFormatError(
      "The browser could not decode this file. It may be damaged, or this browser may not support the format.",
    );
  }
  try {
    return readBitmapPixels(bitmap);
  } finally {
    bitmap.close();
  }
}
