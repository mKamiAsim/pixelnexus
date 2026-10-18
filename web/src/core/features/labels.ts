/**
 * Label maps: what segmentation filters in the science engine return. Every pixel holds the
 * number of its region, from 1, or 0 for none. The engine sends them as JSON of kind "labels",
 * with the labels as base64 of little-endian unsigned integers of 8, 16 or 32 bits, and a
 * feature table with one row per region.
 */
import { labelColor } from "@/core/filters/segmentation/regions";
import type { RgbaImage } from "@/core/image/types";
import { createMask, type Mask } from "@/core/mask/mask";

import { isFeatureTable, type FeatureTable } from "./table";

export interface LabelMap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint32Array;
}

export interface LabelResult {
  readonly kind: "labels";
  readonly width: number;
  readonly height: number;
  readonly bits: 8 | 16 | 32;
  readonly data: string;
  readonly table: FeatureTable;
}

/** True for a JSON value that has the shape of a label result. */
export function isLabelResult(value: unknown): value is LabelResult {
  const result = value as Partial<LabelResult> | null;
  return (
    typeof result === "object" &&
    result !== null &&
    result.kind === "labels" &&
    Number.isInteger(result.width) &&
    Number.isInteger(result.height) &&
    (result.bits === 8 || result.bits === 16 || result.bits === 32) &&
    typeof result.data === "string" &&
    isFeatureTable(result.table)
  );
}

/** The labels of a result. Throws when the data does not fit the size. */
export function decodeLabels(result: LabelResult): LabelMap {
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const size = result.width * result.height;
  const step = result.bits / 8;
  if (bytes.length !== size * step) {
    throw new RangeError(`The label map has ${bytes.length} bytes, not ${size * step}.`);
  }
  const view = new DataView(bytes.buffer);
  const data = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    data[i] =
      step === 1
        ? (bytes[i] ?? 0)
        : step === 2
          ? view.getUint16(2 * i, true)
          : view.getUint32(4 * i, true);
  }
  return { width: result.width, height: result.height, data };
}

/**
 * The regions in their label colors, the same golden-angle hues as connected-component
 * labeling. Pixels with label 0 are transparent. With `alpha` below 255, the regions are see
 * through and their boundaries stay opaque, so they show over the image.
 */
export function paintLabels(map: LabelMap, alpha = 255): RgbaImage {
  const { width, height, data: labels } = map;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const label = labels[i] ?? 0;
      if (label === 0) continue;
      const [r, g, b] = labelColor(label);
      const edge =
        (x + 1 < width && labels[i + 1] !== label) ||
        (y + 1 < height && labels[i + width] !== label);
      data.set([r, g, b, edge ? 255 : alpha], 4 * i);
    }
  }
  return { width, height, data };
}

/** A selection of the pixels whose label is in `labels`, or of every labeled pixel. */
export function labelMask(map: LabelMap, labels: ReadonlySet<number> | "all"): Mask {
  const mask = createMask(map.width, map.height);
  map.data.forEach((label, i) => {
    if (label !== 0 && (labels === "all" || labels.has(label))) mask.data[i] = 255;
  });
  return mask;
}
