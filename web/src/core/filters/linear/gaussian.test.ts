import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { gaussianKernel1d, gaussianKernel2d, gaussianRadius } from "@/core/filters/linear/gaussian";

const fixtures = JSON.parse(
  readFileSync(new URL("../../../../tests/fixtures/gaussian.json", import.meta.url), "utf8"),
) as {
  tolerance: number;
  cases: { sigma: number; truncate: number; radius: number; kernel: number[] }[];
};

describe("Gaussian kernel against SciPy", () => {
  it.each(fixtures.cases)(
    "sigma $sigma, truncate $truncate",
    ({ sigma, truncate, radius, kernel }) => {
      expect(gaussianRadius(sigma, truncate)).toBe(radius);
      const ours = gaussianKernel1d(sigma, truncate);
      expect(ours).toHaveLength(kernel.length);
      ours.forEach((value, i) =>
        expect(Math.abs(value - (kernel[i] ?? 0))).toBeLessThan(fixtures.tolerance),
      );
    },
  );
});

describe("Gaussian kernel properties", () => {
  it("sums to one and is symmetric", () => {
    const g = gaussianKernel1d(1.7);
    expect(g.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let i = 0; i < g.length; i++) expect(g[i]).toBeCloseTo(g[g.length - 1 - i] ?? NaN, 15);
  });

  it("2D kernel is the outer product and sums to one", () => {
    const k = gaussianKernel2d(1);
    expect(k).toHaveLength(7);
    expect(k.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("rejects invalid sigma", () => {
    expect(() => gaussianKernel1d(0)).toThrow(RangeError);
  });
});
