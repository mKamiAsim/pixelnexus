import { describe, expect, it } from "vitest";

import { mulberry32 } from "@/core/math/random";

import { correlate2d, planeSpectrum, type Kernel2d } from "./convolve";
import { BORDER_MODES, createPlane } from "./planes";

describe("correlation through the FFT", () => {
  const random = mulberry32(5);
  const plane = createPlane(23, 14);
  for (let i = 0; i < plane.data.length; i++) plane.data[i] = Math.floor(random() * 256);
  const kernel = (width: number, height: number, anchorX: number, anchorY: number): Kernel2d => ({
    width,
    height,
    anchorX,
    anchorY,
    weights: Float64Array.from({ length: width * height }, () => random() - 0.5),
  });
  const shapes = [
    [5, 3, 2, 1],
    [4, 7, 0, 5],
    [9, 9, 4, 4],
  ] as const;

  it.each(BORDER_MODES)("equals direct correlation with the %s border", (border) => {
    const spectrum = planeSpectrum(plane, 6, border);
    for (const [w, h, ax, ay] of shapes) {
      const re = kernel(w, h, ax, ay);
      const im = kernel(w, h, ax, ay);
      const [a, b] = spectrum.correlate(re, im);
      const directRe = correlate2d(plane, re, border);
      const directIm = correlate2d(plane, im, border);
      directRe.data.forEach((v, i) => expect(a.data[i]).toBeCloseTo(v, 2));
      directIm.data.forEach((v, i) => expect(b.data[i]).toBeCloseTo(v, 2));
    }
  });

  it("refuses a kernel that reaches further than the spectrum", () => {
    expect(() => planeSpectrum(plane, 2, "reflect").correlate(kernel(7, 7, 3, 3))).toThrow(
      RangeError,
    );
  });
});
