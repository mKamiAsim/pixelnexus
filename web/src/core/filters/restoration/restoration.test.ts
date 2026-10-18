import { describe, expect, it } from "vitest";

import { createPlane } from "@/core/filters/planes";

import { deconvolve, psfKernel, wienerGain } from "./deconvolve";
import { iterate } from "./iterative";
import { correlate2d } from "../convolve";

function blurredPlane() {
  const plane = createPlane(40, 32);
  plane.data.forEach((_, i) => {
    const x = i % 40;
    const y = Math.floor(i / 40);
    plane.data[i] = (x - 20) ** 2 + (y - 16) ** 2 < 64 ? 220 : 40 + x + 0.5 * y;
  });
  const params = { psf: "gaussian", sigma: 1.5 };
  return { plane, params, blurred: correlate2d(plane, psfKernel(params), "reflect") };
}

describe("iterative deconvolution", () => {
  it("reports every iteration, and Landweber never raises the residual", () => {
    const { blurred, params } = blurredPlane();
    const residuals: number[] = [];
    iterate(blurred, "reflect", { ...params, iterations: 8, tau: 1 }, "landweber", (i, est, r) => {
      expect(i).toBe(residuals.length + 1);
      expect(est.width).toBe(40);
      residuals.push(r);
    });
    expect(residuals).toHaveLength(8);
    for (let i = 1; i < residuals.length; i++) {
      expect(residuals[i] ?? 0).toBeLessThanOrEqual((residuals[i - 1] ?? 0) + 1e-9);
    }
  });

  it("keeps Richardson-Lucy and projected Landweber non-negative", () => {
    const { blurred, params } = blurredPlane();
    for (const method of ["richardson-lucy", "projected-landweber"] as const) {
      const out = iterate(blurred, "reflect", { ...params, iterations: 10, tau: 1.8 }, method);
      expect(Math.min(...out.data)).toBeGreaterThanOrEqual(0);
    }
  });

  it("brings a blurred disk closer to the original, as Wiener deconvolution does", () => {
    const { plane, blurred, params } = blurredPlane();
    const error = (a: Float32Array) =>
      Math.sqrt(a.reduce((s, v, i) => s + (v - (plane.data[i] ?? 0)) ** 2, 0) / a.length);
    const before = error(blurred.data);
    const rl = iterate(blurred, "reflect", { ...params, iterations: 30 }, "richardson-lucy");
    const wiener = deconvolve(blurred, "reflect", psfKernel(params), wienerGain(1e-3));
    expect(error(rl.data)).toBeLessThan(0.8 * before);
    expect(error(wiener.data)).toBeLessThan(0.8 * before);
  });
});
