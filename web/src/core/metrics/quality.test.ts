import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";

import { qualityMetrics } from "./quality";

const fixtures = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/filters.json", import.meta.url), "utf8"),
) as {
  metrics: {
    width: number;
    height: number;
    reference: number[];
    image: number[];
    mse: number;
    mae: number;
    psnr: number;
    ssim: number;
  };
};

const rgba = (width: number, height: number, rgb: number[]): RgbaImage => {
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) {
    image.data.set([rgb[i * 3] ?? 0, rgb[i * 3 + 1] ?? 0, rgb[i * 3 + 2] ?? 0, 255], i * 4);
  }
  return image;
};

describe("quality metrics against skimage.metrics", () => {
  const m = fixtures.metrics;
  const result = qualityMetrics(
    rgba(m.width, m.height, m.image),
    rgba(m.width, m.height, m.reference),
  );

  it("match MSE, MAE and PSNR", () => {
    expect(result.mse).toBeCloseTo(m.mse, 9);
    expect(result.mae).toBeCloseTo(m.mae, 9);
    expect(result.psnr).toBeCloseTo(m.psnr, 9);
  });

  it("match SSIM with Gaussian weights", () => {
    expect(Math.abs(result.ssim - m.ssim)).toBeLessThan(1e-5);
  });

  it("give perfect scores for equal images and refuse different sizes", () => {
    const image = rgba(m.width, m.height, m.reference);
    const same = qualityMetrics(image, image);
    expect(same).toMatchObject({ mse: 0, mae: 0, psnr: Infinity });
    expect(same.ssim).toBeCloseTo(1, 12);
    expect(() => qualityMetrics(image, createImage(3, 3))).toThrow(RangeError);
    expect(qualityMetrics(createImage(5, 5), createImage(5, 5)).ssim).toBeNaN();
  });
});
