import type { ImageHeader } from "@/core/image/format";

export interface ImageLimits {
  /** Largest file accepted, in bytes. */
  readonly maxFileBytes: number;
  /** Largest image accepted, as width times height. */
  readonly maxPixels: number;
  /** Longest side accepted, in pixels. */
  readonly maxSide: number;
}

/** Desktop defaults. Phones get lower limits in Phase 11. */
export const DEFAULT_LIMITS: ImageLimits = {
  maxFileBytes: 30 * 1024 * 1024,
  maxPixels: 50_000_000,
  maxSide: 16_384,
};

export interface LoadIssue {
  readonly level: "error" | "warning";
  readonly code:
    | "file-too-large"
    | "too-many-pixels"
    | "side-too-long"
    | "bit-depth"
    | "color-profile"
    | "frames"
    | "cmyk"
    | "orientation";
  readonly message: string;
}

const MB = 1024 * 1024;
const megabytes = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;
const megapixels = (pixels: number) => `${(pixels / 1e6).toFixed(1)} million`;

/**
 * Check a file before decoding it. Errors stop the import. Warnings explain what changes when the
 * browser decodes the file into 8-bit sRGB.
 */
export function checkImage(
  fileBytes: number,
  header: ImageHeader,
  limits: ImageLimits = DEFAULT_LIMITS,
): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const pixels = header.width * header.height;
  if (fileBytes > limits.maxFileBytes) {
    issues.push({
      level: "error",
      code: "file-too-large",
      message: `The file is ${megabytes(fileBytes)}. The limit is ${megabytes(limits.maxFileBytes)}.`,
    });
  }
  if (pixels > limits.maxPixels) {
    issues.push({
      level: "error",
      code: "too-many-pixels",
      message: `The image has ${megapixels(pixels)} pixels. The limit is ${megapixels(limits.maxPixels)}.`,
    });
  }
  const side = Math.max(header.width, header.height);
  if (side > limits.maxSide) {
    issues.push({
      level: "error",
      code: "side-too-long",
      message: `The longest side is ${side} pixels. The limit is ${limits.maxSide} pixels.`,
    });
  }
  if ((header.bitDepth ?? 8) > 8) {
    issues.push({
      level: "warning",
      code: "bit-depth",
      message: `The file has ${header.bitDepth} bits per channel. PixelNexus works with 8 bits, so the finest tonal steps are lost.`,
    });
  }
  if (header.hasColorProfile) {
    const name = header.colorProfileName ? ` (${header.colorProfileName})` : "";
    issues.push({
      level: "warning",
      code: "color-profile",
      message: `The file has an embedded color profile${name}. Colors are converted to sRGB.`,
    });
  }
  if ((header.frames ?? 1) > 1) {
    const what = header.format === "tiff" ? "pages" : "frames";
    issues.push({
      level: "warning",
      code: "frames",
      message: `The file has ${header.frames} ${what}. Only the first one is opened.`,
    });
  }
  if (header.colorModel === "cmyk") {
    issues.push({
      level: "warning",
      code: "cmyk",
      message: "The file uses CMYK color. It is converted to RGB, and some colors may shift.",
    });
  }
  if (header.orientation !== undefined && header.orientation !== 1) {
    issues.push({
      level: "warning",
      code: "orientation",
      message:
        header.format === "tiff"
          ? "The file asks to be rotated or flipped. TIFF orientation is not applied yet."
          : "The file asks to be rotated or flipped. This is applied, so width and height may swap.",
    });
  }
  return issues;
}
