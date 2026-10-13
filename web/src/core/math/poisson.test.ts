import { describe, expect, it } from "vitest";

import { logGamma, poissonSample } from "./poisson";
import { mulberry32 } from "./random";

describe("Poisson numbers", () => {
  it("compute log gamma for whole and half numbers", () => {
    // Gamma(5) = 24, Gamma(0.5) = sqrt(pi), Gamma(101) = 100!.
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 12);
    let log100 = 0;
    for (let k = 2; k <= 100; k++) log100 += Math.log(k);
    expect(logGamma(101)).toBeCloseTo(log100, 9);
  });

  it.each([0.5, 3, 9.5, 10, 30, 300])("have mean and variance lambda = %s", (lambda) => {
    const random = mulberry32(Math.round(lambda * 100));
    const n = 40_000;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < n; i++) {
      const k = poissonSample(lambda, () => random());
      sum += k;
      squares += k * k;
    }
    const mean = sum / n;
    const variance = squares / n - mean * mean;
    // Five standard errors of the mean, and a 5 percent band for the variance.
    expect(Math.abs(mean - lambda)).toBeLessThan(5 * Math.sqrt(lambda / n));
    expect(Math.abs(variance / lambda - 1)).toBeLessThan(0.05);
  });

  it("gives 0 for a mean of 0", () => {
    expect(poissonSample(0, () => 0.5)).toBe(0);
  });
});
