import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";

import { createMask } from "@/core/mask/mask";

import { qualityMetrics, SSIM_FRAME } from "./quality";

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

describe("quality metrics inside a selection", () => {
  const m = fixtures.metrics;
  const image = rgba(m.width, m.height, m.image);
  const reference = rgba(m.width, m.height, m.reference);
  const whole = qualityMetrics(image, reference);
  const left = createMask(m.width, m.height);
  const half = Math.floor(m.width / 2);
  for (let y = 0; y < m.height; y++) left.data.fill(255, y * m.width, y * m.width + half);
  const right = createMask(m.width, m.height);
  for (let i = 0; i < right.data.length; i++) right.data[i] = 255 - (left.data[i] ?? 0);

  it("equal the whole-image metrics with a full selection", () => {
    const full = qualityMetrics(image, reference, createMask(m.width, m.height, 255));
    expect(full.mse).toBeCloseTo(whole.mse, 9);
    expect(full.ssim).toBeCloseTo(whole.ssim, 9);
  });

  it("split the whole: two halves weighted by their pixels give the whole", () => {
    const a = qualityMetrics(image, reference, left);
    const b = qualityMetrics(image, reference, right);
    const na = half * m.height;
    const nb = (m.width - half) * m.height;
    expect((a.mse * na + b.mse * nb) / (na + nb)).toBeCloseTo(whole.mse, 9);
    // SSIM counts only the pixels inside the frame.
    const rows = m.height - 2 * SSIM_FRAME;
    const sa = (half - SSIM_FRAME) * rows;
    const sb = (m.width - SSIM_FRAME - half) * rows;
    expect((a.ssim * sa + b.ssim * sb) / (sa + sb)).toBeCloseTo(whole.ssim, 9);
  });

  it("give no number for an empty selection", () => {
    const empty = qualityMetrics(image, reference, createMask(m.width, m.height));
    expect(empty.mse).toBeNaN();
    expect(empty.psnr).toBeNaN();
  });
});
