/**
 * The AI tasks that run on the device, with the pre- and post-processing of each model's source,
 * as the engine does (engine/src/pixelnexus_engine/filters/ai.py):
 *
 * - u2netp, subject: as rembg. Resize to 320 x 320 with Lanczos, divide by the largest value,
 *   normalize with the ImageNet mean and deviation, stretch the first output from its minimum
 *   to its maximum, and resize back with Lanczos.
 * - swin2sr-lightweight-x2, super-resolution: as the Transformers Swin2SR image processor. Scale
 *   to 0 to 1 and pad the right and bottom symmetrically to the next multiple of 8 above the size,
 *   which always adds at least one pixel. The output is cropped to twice the size.
 * - efficientsam-ti, click and box selection: as EfficientSAM's ONNX example. The encoder takes
 *   the image from 0 to 1 at its own size. Positive clicks have label 1, and a box is two points
 *   with labels 2 and 3. EfficientSAM has no label for negative clicks, so they are refused.
 *
 * The functions take a `run` callback for each network, so the steps can be tested without
 * ONNX Runtime.
 */
import { createImage, type RgbaImage } from "@/core/image/types";
import { resizeImageTo } from "@/core/image/resample";
import { createMask, type Mask } from "@/core/mask/mask";
import type { Box, PromptPoint } from "@/core/ai/types";

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/** One network call: named float32 inputs with their shapes, to the named outputs. */
export type Run = (
  inputs: Record<string, { data: Float32Array; dims: number[] }>,
) => Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;

function only<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`The model gave no ${what}.`);
  return value;
}

// Subject -----------------------------------------------------------------------------------------

export function u2netpInput(image: RgbaImage): Float32Array {
  const small = resizeImageTo(image, 320, 320, "lanczos");
  let largest = 0;
  for (let i = 0; i < small.data.length; i += 4) {
    largest = Math.max(largest, small.data[i] ?? 0, small.data[i + 1] ?? 0, small.data[i + 2] ?? 0);
  }
  const scale = 1 / Math.max(largest, 1e-6);
  const plane = 320 * 320;
  const out = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    for (let c = 0; c < 3; c++) {
      const v = (small.data[p * 4 + c] ?? 0) * scale;
      out[c * plane + p] = (v - (IMAGENET_MEAN[c] ?? 0)) / (IMAGENET_STD[c] ?? 1);
    }
  }
  return out;
}

/** Stretch to 0 to 255 and resize back, as rembg does. */
export function u2netpMask(prediction: Float32Array, width: number, height: number): Mask {
  let low = Infinity;
  let high = -Infinity;
  for (const v of prediction) {
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  const span = high > low ? high - low : 1;
  const small = createImage(320, 320);
  for (let p = 0; p < 320 * 320; p++) {
    const v = Math.floor((((prediction[p] ?? low) - low) / span) * 255);
    small.data.set([v, v, v, 255], p * 4);
  }
  const big = resizeImageTo(small, width, height, "lanczos");
  const mask = createMask(width, height);
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = big.data[i * 4] ?? 0;
  return mask;
}

export async function subjectSelect(image: RgbaImage, run: Run): Promise<Mask> {
  const outputs = await run({ "input.1": { data: u2netpInput(image), dims: [1, 3, 320, 320] } });
  const first = only(Object.values(outputs)[0], "mask");
  return u2netpMask(first.data, image.width, image.height);
}

// Super-resolution --------------------------------------------------------------------------------

/** The padded size: the next multiple of 8 above, as the Transformers processor computes it. */
export const paddedSize = (size: number) => (Math.floor(size / 8) + 1) * 8;

/**
 * Symmetric padding repeats the edge pixel, then mirrors: index size reads size - 1. Past twice
 * the size it repeats with a period of 2 size, which only matters for images under 8 pixels.
 */
const symmetric = (i: number, size: number) => {
  const j = i % (2 * size);
  return j < size ? j : 2 * size - 1 - j;
};

export function swin2srInput(image: RgbaImage): { data: Float32Array; dims: number[] } {
  const height = paddedSize(image.height);
  const width = paddedSize(image.width);
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < height; y++) {
    const sy = symmetric(y, image.height);
    for (let x = 0; x < width; x++) {
      const sx = symmetric(x, image.width);
      for (let c = 0; c < 3; c++) {
        out[c * plane + y * width + x] = (image.data[(sy * image.width + sx) * 4 + c] ?? 0) / 255;
      }
    }
  }
  return { data: out, dims: [1, 3, height, width] };
}

export async function superResolve(image: RgbaImage, run: Run): Promise<RgbaImage> {
  const input = swin2srInput(image);
  const outputs = await run({ pixel_values: input });
  const result = only(Object.values(outputs)[0], "image");
  const outHeight = result.dims[2] ?? 0;
  const outWidth = result.dims[3] ?? 0;
  const width = image.width * 2;
  const height = image.height * 2;
  const out = createImage(width, height);
  const plane = outWidth * outHeight;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = result.data[c * plane + y * outWidth + x] ?? 0;
        out.data[o + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
      // Alpha is enlarged by repeating each pixel. Our choice: the model has no alpha.
      out.data[o + 3] =
        image.data[(Math.floor(y / 2) * image.width + Math.floor(x / 2)) * 4 + 3] ?? 255;
    }
  }
  return out;
}

// Click and box selection --------------------------------------------------------------------------

export function samPrompts(
  points: readonly PromptPoint[],
  box: Box | undefined,
): { coords: Float32Array; labels: Float32Array; count: number } {
  if (points.some((p) => !p.positive)) {
    throw new Error(
      "EfficientSAM takes no negative clicks. Remove them, or use the local engine with SAM 2.1.",
    );
  }
  const coords: number[] = [];
  const labels: number[] = [];
  for (const p of points) {
    coords.push(p.x, p.y);
    labels.push(1);
  }
  if (box) {
    coords.push(box.x, box.y, box.x + box.width, box.y + box.height);
    labels.push(2, 3);
  }
  if (labels.length === 0) throw new Error("Add a click or draw a box first.");
  return {
    coords: Float32Array.from(coords),
    labels: Float32Array.from(labels),
    count: labels.length,
  };
}

export async function promptedSelect(
  image: RgbaImage,
  points: readonly PromptPoint[],
  box: Box | undefined,
  encoder: Run,
  decoder: Run,
): Promise<Mask> {
  const prompts = samPrompts(points, box);
  const plane = image.width * image.height;
  const pixels = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    for (let c = 0; c < 3; c++) pixels[c * plane + p] = (image.data[p * 4 + c] ?? 0) / 255;
  }
  const encoded = await encoder({
    batched_images: { data: pixels, dims: [1, 3, image.height, image.width] },
  });
  const embeddings = only(encoded.image_embeddings, "image embeddings");
  const decoded = await decoder({
    image_embeddings: { data: embeddings.data, dims: [...embeddings.dims] },
    batched_point_coords: { data: prompts.coords, dims: [1, 1, prompts.count, 2] },
    batched_point_labels: { data: prompts.labels, dims: [1, 1, prompts.count] },
    // orig_im_size is int64. The adapter turns this entry into an int64 tensor.
    orig_im_size: { data: Float32Array.from([image.height, image.width]), dims: [2] },
  });
  const masks = only(decoded.output_masks, "masks");
  const iou = only(decoded.iou_predictions, "scores");
  let best = 0;
  for (let i = 1; i < iou.data.length; i++)
    if ((iou.data[i] ?? -Infinity) > (iou.data[best] ?? -Infinity)) best = i;
  const mask = createMask(image.width, image.height);
  const offset = best * plane;
  for (let p = 0; p < plane; p++) mask.data[p] = (masks.data[offset + p] ?? -1) >= 0 ? 255 : 0;
  return mask;
}
