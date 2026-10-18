import { describe, expect, it } from "vitest";

import { binomialWeights, pascalRow } from "./binomial";
import { diskBoxArea, diskKernel, diskRadius } from "./disk-average";
import { besselI0, firTaps, firWindow } from "./fir-lowpass";
import { boostKernel } from "./high-pass";
import { laplacianSharpenKernel } from "./laplacian-sharpen";
import { tentRow, tentWeights } from "./triangular";
import { DEFAULT_KERNEL, parseKernel, weightedKernel } from "./weighted-average";

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

describe("binomial and tent weights", () => {
  it("are rows of Pascal's triangle and add up to 1", () => {
    expect(pascalRow(5)).toEqual([1, 4, 6, 4, 1]);
    expect(sum(binomialWeights(9))).toBeCloseTo(1, 14);
    // Variance (n - 1) / 4.
    const w = binomialWeights(9);
    const variance = sum(Array.from(w, (v, k) => v * (k - 4) ** 2));
    expect(variance).toBeCloseTo(2, 12);
  });

  it("rise in equal steps for the tent", () => {
    expect(tentRow(5)).toEqual({ row: [1, 2, 3, 2, 1], total: 9 });
    expect(sum(tentWeights(11))).toBeCloseTo(1, 14);
    expect(() => tentRow(4)).toThrow(RangeError);
  });
});

describe("disk kernel", () => {
  it("measures the exact area of a disk in a box", () => {
    // The whole disk, a quarter of it, and a square fully inside it.
    expect(diskBoxArea(2, -3, 3, -3, 3)).toBeCloseTo(Math.PI * 4, 12);
    expect(diskBoxArea(2, 0, 3, 0, 3)).toBeCloseTo(Math.PI, 12);
    expect(diskBoxArea(2, -0.5, 0.5, -0.5, 0.5)).toBeCloseTo(1, 12);
    expect(diskBoxArea(2, 3, 4, 0, 1)).toBe(0);
  });

  it("has the right size, symmetry and sum", () => {
    expect(diskRadius(3)).toBe(3);
    expect(diskRadius(0.5)).toBe(0);
    const k = diskKernel(2.3);
    expect(k.length).toBe(5);
    expect(sum(k.flat())).toBeCloseTo(1, 12);
    expect(k[0]?.[1]).toBeCloseTo(k[1]?.[0] ?? NaN, 14);
    expect(k[4]?.[4]).toBeCloseTo(k[0]?.[0] ?? NaN, 14);
    expect(diskKernel(0.5)).toEqual([[1]]);
  });
});

describe("low-pass FIR design", () => {
  it("computes I0 and the windows", () => {
    // I0(1) = 1.2660658777520082, from the power series.
    expect(besselI0(1)).toBeCloseTo(1.2660658777520082, 14);
    expect(besselI0(0)).toBe(1);
    const hamming = firWindow("hamming", 5);
    expect(hamming[0]).toBeCloseTo(0.08, 14);
    expect(hamming[2]).toBeCloseTo(1, 14);
    expect(firWindow("kaiser", 7, 6)[3]).toBeCloseTo(1, 14);
  });

  it("gives symmetric taps with a DC gain of 1", () => {
    const h = firTaps(15, 0.15, "hann");
    expect(sum(h)).toBeCloseTo(1, 14);
    for (let n = 0; n < 15; n++) expect(h[n]).toBeCloseTo(h[14 - n] ?? NaN, 14);
    expect(() => firTaps(8, 0.2, "hann")).toThrow(RangeError);
    expect(() => firTaps(7, 0.6, "hann")).toThrow(RangeError);
  });
});

describe("sharpening kernels", () => {
  it("keep flat areas for Laplacian sharpening, and add up to A - 1 for high-boost", () => {
    const s = laplacianSharpenKernel("4", 1);
    expect(s).toEqual([
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0],
    ]);
    expect(sum(laplacianSharpenKernel("8", 0.7).flat())).toBeCloseTo(1, 14);
    expect(sum(boostKernel(1.5, 1.7).flat())).toBeCloseTo(0.7, 12);
    expect(sum(boostKernel(1.5, 1).flat())).toBeCloseTo(0, 12);
  });
});

describe("kernel text", () => {
  it("reads rows and numbers in several notations", () => {
    expect(parseKernel("1 2 1; 2 4 2; 1 2 1")).toEqual({
      ok: true,
      rows: [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1],
      ],
    });
    expect(parseKernel("1,0,-1\n2,0,-2\n1,0,-1").ok).toBe(true);
    expect(parseKernel("0.5 1e-1 -3").ok).toBe(true);
  });

  it("explains what is wrong", () => {
    expect(parseKernel("")).toEqual({ ok: false, message: "The kernel is empty." });
    expect(parseKernel("1 2; 3 4")).toMatchObject({ ok: false });
    expect(parseKernel("1 2 3; 4 5")).toEqual({
      ok: false,
      message: "Every row needs the same number of values.",
    });
    expect(parseKernel("1 x 1")).toEqual({
      ok: false,
      message: "Row 1 has a value that is not a number.",
    });
    const big = Array.from({ length: 17 }, () => "1").join(" ");
    expect(parseKernel(big).ok).toBe(false);
  });

  it("normalizes when asked and the sum is not 0, and falls back to the default", () => {
    expect(sum(weightedKernel("1 2 1", true).flat())).toBeCloseTo(1, 14);
    expect(weightedKernel("-1 0 1", true)).toEqual([[-1, 0, 1]]);
    expect(weightedKernel("nonsense", false)).toEqual(
      parseKernel(DEFAULT_KERNEL).ok ? weightedKernel(DEFAULT_KERNEL, false) : [],
    );
  });
});
