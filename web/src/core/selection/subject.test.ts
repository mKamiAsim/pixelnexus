import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { invertMask } from "@/core/mask/mask";
import { mulberry32 } from "@/core/math/random";

import { fft, frequencyTuned, spectralResidual } from "./saliency";
import { colorClusters, otsu, shrinkImage, subjectMask } from "./subject";

/** A gray, slightly noisy background with a red, textured disk. */
function scene(width: number, height: number, cx: number, cy: number, r: number): RgbaImage {
  const random = mulberry32(11);
  const image = createImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = (random() - 0.5) * 10;
      const inside = Math.hypot(x - cx, y - cy) <= r;
      const t = inside ? 25 * Math.sin(x / 3) * Math.cos(y / 4) : 0;
      const color = inside
        ? [200 + n + t, 50 + n, 45 + n]
        : [120 + n + (x / width) * 20, 125 + n, 130 + n];
      image.data.set([...color.map((v) => Math.round(v)), 255], (y * width + x) * 4);
    }
  }
  return image;
}

/** Intersection over union of a mask (values >= 128) with a disk. */
function iou(mask: { width: number; data: Uint8Array }, cx: number, cy: number, r: number) {
  let both = 0;
  let either = 0;
  for (let i = 0; i < mask.data.length; i++) {
    const x = i % mask.width;
    const y = Math.floor(i / mask.width);
    const a = (mask.data[i] ?? 0) >= 128;
    const b = Math.hypot(x - cx, y - cy) <= r;
    if (a && b) both++;
    if (a || b) either++;
  }
  return both / either;
}

describe("saliency maps", () => {
  it("transforms with the FFT and back", () => {
    const re = Float64Array.from([1, 2, 3, 4, 0, -1, 2, 5]);
    const im = new Float64Array(8);
    const copy = re.slice();
    fft(re, im);
    // The first term is the sum.
    expect(re[0]).toBeCloseTo(16, 10);
    fft(re, im, true);
    for (let i = 0; i < 8; i++) expect((re[i] ?? 0) / 8).toBeCloseTo(copy[i] ?? 0, 10);
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(RangeError);
  });

  it("finds the disk with both saliency maps", () => {
    const image = scene(128, 96, 64, 48, 20);
    const ft = frequencyTuned(image);
    expect(ft.data[48 * 128 + 64]).toBeGreaterThan(0.6);
    expect(ft.data[5 * 128 + 5]).toBeLessThan(0.3);
    const sr = spectralResidual(image);
    expect(sr.width).toBe(64);
    // The spectral residual is high somewhere on the disk, more than in the corners.
    let disk = 0;
    let corner = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = sr.data[y * 64 + x] ?? 0;
        if (Math.hypot(x - 32, y - 32) < 12) disk = Math.max(disk, v);
        if (x < 8 && y < 8) corner = Math.max(corner, v);
      }
    }
    expect(disk).toBeGreaterThan(corner);
  });
});

describe("subject selection", () => {
  it("selects a colorful object on a plain background, and the background is the rest", () => {
    const image = scene(200, 150, 90, 70, 38);
    const subject = subjectMask(image);
    expect(iou(subject, 90, 70, 38)).toBeGreaterThan(0.9);
    const background = invertMask(subject);
    expect(background.data[0]).toBe(255);
    expect(background.data[70 * 200 + 90]).toBe(0);
  });

  it("works on a large image through a smaller copy", () => {
    const image = scene(900, 600, 500, 300, 150);
    const shrunk = shrinkImage(image, 512);
    expect([shrunk.width, shrunk.height]).toEqual([512, 341]);
    expect(iou(subjectMask(image), 500, 300, 150)).toBeGreaterThan(0.9);
  });

  it("splits values with Otsu's threshold and clusters colors", () => {
    const values = [...new Array<number>(50).fill(0.2), ...new Array<number>(50).fill(0.8)];
    const t = otsu(values);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.8);
    const image = scene(60, 40, 30, 20, 10);
    const labels = colorClusters(image, 2);
    expect(labels[20 * 60 + 30]).not.toBe(labels[0]);
  });
});
