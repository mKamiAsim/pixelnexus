import { describe, expect, it } from "vitest";

import { createImage } from "@/core/image/types";

import {
  paddedSize,
  promptedSelect,
  samPrompts,
  subjectSelect,
  superResolve,
  swin2srInput,
  u2netpInput,
  type Run,
} from "./tasks";

function filled(width: number, height: number, rgb: [number, number, number]) {
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) image.data.set([...rgb, 255], i * 4);
  return image;
}

describe("on-device subject selection (u2netp)", () => {
  it("divides by the largest value, then normalizes with the ImageNet mean and deviation", () => {
    const x = u2netpInput(filled(40, 30, [200, 100, 50]));
    expect(x.length).toBe(3 * 320 * 320);
    expect(x[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(x[320 * 320]).toBeCloseTo((0.5 - 0.456) / 0.224, 4);
    expect(x[2 * 320 * 320]).toBeCloseTo((0.25 - 0.406) / 0.225, 4);
  });

  it("stretches the prediction and sizes the mask to the image", async () => {
    const run: Run = async () => {
      const data = new Float32Array(320 * 320).fill(2);
      for (let y = 0; y < 160; y++) data.fill(7, y * 320, y * 320 + 320);
      return { out: { data, dims: [1, 1, 320, 320] } };
    };
    const mask = await subjectSelect(filled(64, 48, [10, 20, 30]), run);
    expect([mask.width, mask.height]).toEqual([64, 48]);
    expect(mask.data[0]).toBe(255);
    expect(mask.data[mask.data.length - 1]).toBe(0);
  });
});

describe("on-device super-resolution (Swin2SR)", () => {
  it("pads past the next multiple of 8 with symmetric edges, as Transformers does", () => {
    expect([paddedSize(13), paddedSize(16)]).toEqual([16, 24]);
    const image = createImage(3, 1);
    image.data.set([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255]);
    const { data, dims } = swin2srInput(image);
    expect(dims).toEqual([1, 3, 8, 8]);
    const firstRow = Array.from(data.subarray(0, 8), (v) => Math.round(v * 255));
    expect(firstRow).toEqual([10, 20, 30, 30, 20, 10, 10, 20]);
  });

  it("crops the network output to twice the size", async () => {
    const image = filled(5, 3, [255, 0, 128]);
    const run: Run = async (inputs) => {
      const input = inputs.pixel_values;
      if (!input) throw new Error("no input");
      const [, c, h, w] = input.dims as [number, number, number, number];
      const out = new Float32Array(c * h * 2 * w * 2);
      for (let k = 0; k < c; k++)
        for (let y = 0; y < h * 2; y++)
          for (let x = 0; x < w * 2; x++)
            out[k * h * w * 4 + y * w * 2 + x] =
              input.data[k * h * w + (y >> 1) * w + (x >> 1)] ?? 0;
      return { out: { data: out, dims: [1, c, h * 2, w * 2] } };
    };
    const big = await superResolve(image, run);
    expect([big.width, big.height]).toEqual([10, 6]);
    expect(Array.from(big.data.subarray(0, 4))).toEqual([255, 0, 128, 255]);
  });
});

describe("on-device click selection (EfficientSAM)", () => {
  it("refuses negative clicks and encodes a box as two labeled corners", () => {
    expect(() => samPrompts([{ x: 1, y: 1, positive: false }], undefined)).toThrow(
      "negative clicks",
    );
    expect(() => samPrompts([], undefined)).toThrow("click or draw a box");
    const prompts = samPrompts([{ x: 4, y: 5, positive: true }], {
      x: 1,
      y: 2,
      width: 10,
      height: 20,
    });
    expect(Array.from(prompts.coords)).toEqual([4, 5, 1, 2, 11, 22]);
    expect(Array.from(prompts.labels)).toEqual([1, 2, 3]);
  });

  it("keeps the mask with the best predicted IoU, inside from logit 0", async () => {
    const image = filled(2, 2, [0, 0, 0]);
    const encoder: Run = async (inputs) => {
      expect(inputs.batched_images?.dims).toEqual([1, 3, 2, 2]);
      return { image_embeddings: { data: new Float32Array(4), dims: [1, 256, 64, 64] } };
    };
    const decoder: Run = async () => ({
      output_masks: {
        data: Float32Array.from([-1, -1, -1, -1, 0, -1, 3, -0.5]),
        dims: [1, 1, 2, 2, 2],
      },
      iou_predictions: { data: Float32Array.from([0.2, 0.9]), dims: [1, 1, 2] },
    });
    const mask = await promptedSelect(
      image,
      [{ x: 0, y: 0, positive: true }],
      undefined,
      encoder,
      decoder,
    );
    expect(Array.from(mask.data)).toEqual([255, 0, 255, 0]);
  });
});
