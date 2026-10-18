import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";

import { mirrorGaussian } from "./retinex";
import { bilateralTonemap, piecewiseBilateral, toneSettings } from "./tonemap";

describe("piecewise-linear bilateral filter", () => {
  const [width, height] = [30, 20];
  const values = Float64Array.from(
    { length: width * height },
    (_, i) => -2 + (((i * 7919) % 97) / 97) * 2,
  );

  it("is the Gaussian blur when sigma_r is huge", () => {
    const wide = piecewiseBilateral(values, width, height, 2.5, 1e6, 1);
    const blur = mirrorGaussian(values, width, height, 2.5);
    wide.forEach((v, i) => expect(v).toBeCloseTo(blur[i] ?? NaN, 9));
  });

  it("keeps two far levels apart, also when it filters every second pixel", () => {
    const two = Float64Array.from({ length: width * height }, (_, i) => (i % width < 15 ? -3 : 0));
    for (const z of [1, 2]) {
      const kept = piecewiseBilateral(two, width, height, 3, 0.4, z);
      kept.forEach((v, i) => expect(v).toBeCloseTo(two[i] ?? NaN, 5));
    }
  });

  it("leaves a flat image as it is", () => {
    const flat = new Float64Array(width * height).fill(-1.5);
    expect(Array.from(piecewiseBilateral(flat, width, height, 3, 0.4, 1))).toEqual(
      Array.from(flat),
    );
  });
});

describe("bilateral tone mapping", () => {
  it("brings two flat areas to the target contrast, the brighter one to white", () => {
    // Gray halves 100 : 1 apart, read without decoding, so the intensity is the value / 255.
    const [width, height] = [100, 50];
    const plane = (): Plane => {
      const p = createPlane(width, height);
      for (let i = 0; i < p.data.length; i++) p.data[i] = i % width < 50 ? 2.55 : 255;
      return p;
    };
    const settings = { ...toneSettings({}), downsample: 1, linearLight: false };
    const [r, g, b] = bilateralTonemap([plane(), plane(), plane()], settings);
    // Far from the edge, more than 20 sigma_s away.
    const dark = 10 * width + 5;
    const bright = 10 * width + 95;
    for (const p of [r, g, b]) {
      expect(p.data[bright]).toBeCloseTo(255, 3);
      expect(p.data[dark]).toBeCloseTo(255 / 5, 3);
    }
  });
});
