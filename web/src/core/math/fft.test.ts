import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fft, fft2d, nextFastSize, nextPow2 } from "@/core/math/fft";

interface Complex {
  re: number[];
  im: number[];
}

const fixtures = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/fft.json", import.meta.url), "utf8"),
) as {
  tolerance: number;
  cases: { n: number; input: Complex; forward: Complex; inverse: Complex }[];
  grids: { rows: number; cols: number; input: Complex; forward: Complex }[];
};

/** The largest difference, relative to the largest value of the expected result. */
function error(re: Float64Array, im: Float64Array, expected: Complex): number {
  let worst = 0;
  let scale = 1;
  expected.re.forEach((value, k) => {
    scale = Math.max(scale, Math.abs(value), Math.abs(expected.im[k] ?? 0));
    worst = Math.max(
      worst,
      Math.abs((re[k] ?? 0) - value),
      Math.abs((im[k] ?? 0) - (expected.im[k] ?? 0)),
    );
  });
  return worst / scale;
}

describe("FFT against NumPy", () => {
  it.each(fixtures.cases)("length $n", ({ n, input, forward, inverse }) => {
    const re = Float64Array.from(input.re);
    const im = Float64Array.from(input.im);
    fft(re, im);
    expect(re).toHaveLength(n);
    expect(error(re, im, forward)).toBeLessThan(fixtures.tolerance);

    const ire = Float64Array.from(input.re);
    const iim = Float64Array.from(input.im);
    fft(ire, iim, true);
    expect(error(ire, iim, inverse)).toBeLessThan(fixtures.tolerance);
  });

  it.each(fixtures.grids)("2D grid $rows x $cols", ({ rows, cols, input, forward }) => {
    const re = Float64Array.from(input.re);
    const im = Float64Array.from(input.im);
    fft2d(re, im, rows, cols, false);
    expect(error(re, im, forward)).toBeLessThan(fixtures.tolerance);
  });
});

describe("FFT", () => {
  it("returns the input after a forward and an inverse transform, divided by n", () => {
    for (const n of [1, 2, 13, 48, 81, 200, 1000, 1009]) {
      const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + i / n);
      const im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 1.3));
      const [r0, i0] = [re.slice(), im.slice()];
      fft(re, im);
      fft(re, im, true);
      re.forEach((v, i) => expect(v / n).toBeCloseTo(r0[i] ?? 0, 10));
      im.forEach((v, i) => expect(v / n).toBeCloseTo(i0[i] ?? 0, 10));
    }
  });

  it("gives the same result on a second call with a cached plan", () => {
    for (const n of [12, 23]) {
      const first = [new Float64Array(n).fill(1), new Float64Array(n)] as const;
      const second = [new Float64Array(n).fill(1), new Float64Array(n)] as const;
      fft(...first);
      fft(...second);
      expect(second[0]).toEqual(first[0]);
      expect(first[0][0]).toBeCloseTo(n, 10);
      expect(Math.abs(first[0][1] ?? 1)).toBeLessThan(1e-9);
    }
  });

  it("rejects parts of different lengths", () => {
    expect(() => fft(new Float64Array(4), new Float64Array(3))).toThrow(RangeError);
  });

  it("finds the next power of 2 and the next fast size", () => {
    expect([1, 2, 3, 5, 513].map(nextPow2)).toEqual([1, 2, 4, 8, 1024]);
    expect([0, 1, 7, 11, 13, 17, 31, 97, 513, 1025].map(nextFastSize)).toEqual([
      1, 1, 8, 12, 15, 18, 32, 100, 540, 1080,
    ]);
  });
});
