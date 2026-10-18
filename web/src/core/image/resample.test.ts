import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  resampleKernel,
  resizeImageTo,
  rotatedSize,
  rotateImage,
  type Interpolation,
  type ResizeMethod,
} from "./resample";
import { createImage, type RgbaImage } from "./types";

const fixtures = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/geometry.json", import.meta.url), "utf8"),
) as {
  tolerance: number;
  width: number;
  height: number;
  input: number[];
  resize: { width: number; height: number; method: ResizeMethod; output: number[] }[];
  rotate: {
    degrees: number;
    interpolation: Interpolation;
    expand: boolean;
    fill: [number, number, number, number];
    width: number;
    height: number;
    output: number[];
  }[];
};

const input: RgbaImage = {
  width: fixtures.width,
  height: fixtures.height,
  data: Uint8ClampedArray.from(fixtures.input),
};

const worst = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let w = 0;
  for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return w;
};

describe("resize against the NumPy reference", () => {
  it.each(fixtures.resize)("$method to $width x $height", ({ width, height, method, output }) => {
    const out = resizeImageTo(input, width, height, method);
    expect([out.width, out.height]).toEqual([width, height]);
    expect(worst(out.data, output)).toBeLessThanOrEqual(fixtures.tolerance);
  });
});

describe("rotation against the NumPy reference", () => {
  it.each(fixtures.rotate)(
    "$degrees degrees, $interpolation, expand $expand",
    ({ degrees, interpolation, expand, fill, width, height, output }) => {
      const out = rotateImage(input, degrees, { interpolation, expand, fill });
      expect([out.width, out.height]).toEqual([width, height]);
      expect(worst(out.data, output)).toBeLessThanOrEqual(fixtures.tolerance);
    },
  );
});

describe("resampling rules", () => {
  it("uses the kernels of Pillow", () => {
    const cubic = resampleKernel("bicubic").weight;
    expect(cubic(0)).toBe(1);
    expect(cubic(1)).toBeCloseTo(0, 14);
    expect(cubic(0.5)).toBeCloseTo(0.5625, 14);
    expect(cubic(1.5)).toBeCloseTo(-0.0625, 14);
    expect(cubic(2)).toBe(0);
    const lanczos = resampleKernel("lanczos").weight;
    expect(lanczos(0)).toBe(1);
    expect(lanczos(1)).toBeCloseTo(0, 14);
    expect(lanczos(3)).toBe(0);
    expect(resampleKernel("bilinear").weight(0.25)).toBe(0.75);
  });

  it("keeps a flat color flat and the size the same when asked", () => {
    const flat = createImage(9, 6);
    for (let i = 0; i < 9 * 6; i++) flat.data.set([30, 120, 210, 255], i * 4);
    for (const method of ["nearest", "bilinear", "bicubic", "lanczos"] as const) {
      const out = resizeImageTo(flat, 20, 3, method);
      for (let i = 0; i < 20 * 3; i++) {
        expect(Array.from(out.data.subarray(i * 4, i * 4 + 4))).toEqual([30, 120, 210, 255]);
      }
    }
    expect(() => resizeImageTo(flat, 0, 3, "bilinear")).toThrow(RangeError);
  });

  it("does not let transparent pixels darken their neighbors", () => {
    const image = createImage(4, 1);
    image.data.set([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const out = resizeImageTo(image, 8, 1, "bilinear");
    for (let x = 0; x < 8; x++) {
      if ((out.data[x * 4 + 3] ?? 0) > 0) expect(out.data[x * 4]).toBe(255);
    }
  });

  it("turns by quarter turns exactly, and grows the canvas for other angles", () => {
    expect(rotatedSize(11, 7, 90)).toEqual([7, 11]);
    expect(rotatedSize(11, 7, 180)).toEqual([11, 7]);
    expect(rotatedSize(10, 10, 45)).toEqual([15, 15]);
    // 90 degrees counterclockwise: the top right pixel goes to the top left.
    const quad = createImage(2, 2);
    quad.data.set([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255]);
    const turned = rotateImage(quad, 90, {
      interpolation: "nearest",
      expand: true,
      fill: [0, 0, 0, 0],
    });
    expect([0, 1, 2, 3].map((i) => turned.data[i * 4])).toEqual([20, 40, 10, 30]);
  });

  it("fills the new corners with the fill color", () => {
    const flat = createImage(8, 8);
    for (let i = 0; i < 64; i++) flat.data.set([0, 0, 0, 255], i * 4);
    const white = rotateImage(flat, 45, {
      interpolation: "bilinear",
      expand: true,
      fill: [255, 255, 255, 255],
    });
    expect(Array.from(white.data.subarray(0, 4))).toEqual([255, 255, 255, 255]);
    const clear = rotateImage(flat, 45, {
      interpolation: "bilinear",
      expand: true,
      fill: [0, 0, 0, 0],
    });
    expect(clear.data[3]).toBe(0);
  });
});
