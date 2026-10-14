import { describe, expect, it } from "vitest";

import { correlateSeparable } from "@/core/filters/convolve";
import { gaussianKernel1d } from "@/core/filters/linear/gaussian";
import { createPlane, type Plane } from "@/core/filters/planes";

import {
  balanceRange,
  mirrorGaussian,
  multiscaleRetinex,
  retinexMsrFilter,
  retinexSsrFilter,
  simplestColorBalance,
} from "./retinex";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

function patternValues(width: number, height: number, seed: number): Float64Array {
  return Float64Array.from(
    { length: width * height },
    (_, i) => ((i * 7919 + seed * 104729) % 251) + 0.25 * ((i * 31) % 4),
  );
}

const planeOf = (width: number, height: number, values: ArrayLike<number>): Plane => {
  const p = createPlane(width, height);
  p.data.set(values);
  return p;
};

describe("Gaussian on the mirrored image", () => {
  const [width, height] = [64, 48];
  const values = patternValues(width, height, 1);

  it("matches the spatial Gaussian with the reflect border", () => {
    const g = gaussianKernel1d(3, 8);
    const spatial = correlateSeparable(planeOf(width, height, values), g, g, "reflect");
    const exact = mirrorGaussian(values, width, height, 3);
    exact.forEach((v, i) => expect(v).toBeCloseTo(spatial.data[i] ?? NaN, 3));
  });

  it("keeps the mean of the image, for any sigma", () => {
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    for (const sigma of [0.5, 7, 250]) {
      expect(mean(mirrorGaussian(values, width, height, sigma))).toBeCloseTo(mean(values), 9);
    }
  });

  it("turns a very wide blur into the image mean", () => {
    const blurred = mirrorGaussian(values, width, height, 5000);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    blurred.forEach((v) => expect(v).toBeCloseTo(mean, 6));
  });
});

describe("Simplest Color Balance", () => {
  // The values 0 to 99 in a scrambled order.
  const values = Float64Array.from({ length: 100 }, (_, i) => (i * 37) % 100);

  it("takes the values at floor(N s1 / 100) and floor(N (100 - s2) / 100) - 1", () => {
    expect(balanceRange(values, 0, 0)).toEqual([0, 99]);
    expect(balanceRange(values, 1, 1)).toEqual([1, 98]);
    expect(balanceRange(values, 2.5, 10)).toEqual([2, 89]);
  });

  it("clips beyond the range and stretches the rest to 0..255", () => {
    const out = simplestColorBalance(values, 1, 1);
    values.forEach((v, i) => {
      const expected = ((Math.min(Math.max(v, 1), 98) - 1) * 255) / 97;
      expect(out[i]).toBeCloseTo(expected, 9);
    });
  });

  it("makes a result with no spread mid gray", () => {
    expect(Array.from(simplestColorBalance(new Float64Array([3, 3, 3]), 1, 1))).toEqual([
      127.5, 127.5, 127.5,
    ]);
  });
});

describe("Retinex", () => {
  const [width, height] = [24, 18];

  it("gives a flat image no detail at all", () => {
    const flat = new Float64Array(width * height).fill(90);
    multiscaleRetinex(flat, width, height, [15, 80, 250]).forEach((v) =>
      expect(Math.abs(v)).toBeLessThan(1e-12),
    );
    const plane = planeOf(width, height, flat);
    const out = retinexMsrFilter.color([plane, plane, plane], {}, CONTEXT);
    out.forEach((p) => p.data.forEach((v) => expect(v).toBe(127.5)));
  });

  it("does not depend on a gain applied to the whole image", () => {
    // log(k (I + 1)) - log(G * k (I + 1)) does not depend on k. With I + 1 in the logs, the
    // image is scaled around -1 so that I + 1 scales by k.
    const values = patternValues(width, height, 2);
    const scaled = values.map((v) => 0.5 * (v + 1) - 1);
    const a = multiscaleRetinex(values, width, height, [3]);
    const b = multiscaleRetinex(scaled, width, height, [3]);
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 9));
  });

  it("keeps each pixel's color in intensity mode", () => {
    const r = planeOf(width, height, patternValues(width, height, 3));
    const g = planeOf(width, height, patternValues(width, height, 4));
    const b = planeOf(width, height, patternValues(width, height, 5));
    const out = retinexSsrFilter.color([r, g, b], { sigma: 4, apply: "intensity" }, CONTEXT);
    for (let i = 0; i < width * height; i++) {
      const before = [r, g, b].map((p) => p.data[i] ?? 0);
      const after = out.map((p) => p.data[i] ?? 0);
      expect(Math.max(...after)).toBeLessThanOrEqual(255 + 1e-3);
      const top = before.indexOf(Math.max(...before));
      const ratio = (after[top] ?? 0) / (before[top] ?? 1);
      before.forEach((v, c) => expect(after[c]).toBeCloseTo(v * ratio, 3));
    }
  });
});
