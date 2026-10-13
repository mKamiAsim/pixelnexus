import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { kernelFromRows, correlate2d } from "./convolve";
import { gammaTransfer } from "./enhancement/gamma";
import { grayValue, type GrayscaleMethod } from "./enhancement/grayscale";
import { diskKernel } from "./linear/disk-average";
import { firTaps, type FirWindow } from "./linear/fir-lowpass";
import { motionKernel } from "./linear/motion-blur";
import { borderIndex, createPlane, isBorderMode, type BorderMode, type Plane } from "./planes";
import { browserFilter, BROWSER_FILTERS } from "./registry";
import type { Params, PlaneFilter } from "./types";

interface FilterCase {
  filter: string;
  params: Params & { border: BorderMode };
  source: string;
  output: number[];
  /** A named input from `inputs`, when the case does not use the main input. */
  input?: string;
}

const fixtures = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/filters.json", import.meta.url), "utf8"),
) as {
  tolerance: number;
  width: number;
  height: number;
  input: number[];
  inputs: Record<string, number[]>;
  cases: FilterCase[];
  gamma: { gamma: number; output: number[] }[];
  grayscale: Record<GrayscaleMethod, number[]> & { rgb: number[] };
  borders: { pad: number; constant: number; tables: Record<string, number[]> };
  motionKernels: { length: number; angle: number; rows: number[][] }[];
  firTaps: { taps: number; cutoff: number; window: FirWindow; beta: number; output: number[] }[];
  diskKernels: { radius: number; rows: number[][] }[];
};

const input: Plane = {
  width: fixtures.width,
  height: fixtures.height,
  data: Float32Array.from(fixtures.input),
};

const describeCase = (c: FilterCase) =>
  `${c.filter} ${Object.entries(c.params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ")}`;

describe("border rule against numpy.pad", () => {
  const { pad, constant, tables } = fixtures.borders;
  it.each(Object.entries(tables))("%s", (name, expected) => {
    const [mode, size] = [name.slice(0, name.lastIndexOf("-")), Number(name.split("-").pop())];
    if (!isBorderMode(mode)) throw new Error(`Unknown border ${mode}`);
    const ours = expected.map((_, i) => {
      const index = borderIndex(i - pad, size, mode);
      return index < 0 ? constant : index;
    });
    expect(ours).toEqual(expected);
  });
});

describe("browser filters against SciPy and scikit-image", () => {
  it.each(fixtures.cases.map((c) => [describeCase(c), c] as const))("%s", (_name, c) => {
    const filter = browserFilter(c.filter) as PlaneFilter;
    expect(filter.kind === "smooth" || filter.kind === "derived").toBe(true);
    const plane = c.input
      ? { ...input, data: Float32Array.from(fixtures.inputs[c.input] ?? []) }
      : input;
    const output = filter.plane(plane, c.params, {
      border: c.params.border,
      originX: 0,
      originY: 0,
      channel: 0,
    });
    expect(output.data).toHaveLength(c.output.length);
    // Tolerance relative to the size of the value, and at least the stated absolute tolerance.
    // Float32 holds about 7 digits, so values near 2000 cannot be closer than about 2e-4.
    let worst = 0;
    output.data.forEach((v, i) => {
      const expected = c.output[i] ?? NaN;
      worst = Math.max(worst, Math.abs(v - expected) / Math.max(1, Math.abs(expected)));
    });
    expect(worst, `largest relative difference from ${c.source}`).toBeLessThan(fixtures.tolerance);
  });
});

describe("motion blur kernel against the Python twin", () => {
  it.each(fixtures.motionKernels)("length $length, angle $angle", ({ length, angle, rows }) => {
    const kernel = motionKernel(length, angle);
    expect([kernel.height, kernel.width]).toEqual([rows.length, rows[0]?.length]);
    rows.flat().forEach((w, i) => expect(kernel.weights[i]).toBeCloseTo(w, 10));
  });

  it("is a plain row of equal weights for a horizontal odd length", () => {
    const kernel = motionKernel(5, 0);
    const center = Array.from(kernel.weights.subarray(5 * 2, 5 * 3));
    center.forEach((w) => expect(w).toBeCloseTo(0.2, 12));
    expect(kernel.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe("Phase 5a kernels against SciPy", () => {
  it.each(fixtures.firTaps)(
    "FIR taps $taps, cutoff $cutoff, $window match scipy.signal.firwin",
    ({ taps, cutoff, window, beta, output }) => {
      const h = firTaps(taps, cutoff, window, beta);
      output.forEach((expected, n) => expect(h[n]).toBeCloseTo(expected, 6));
    },
  );

  it.each(fixtures.diskKernels)(
    "disk radius $radius matches the integrated areas",
    ({ radius, rows }) => {
      const kernel = diskKernel(radius);
      expect(kernel.length).toBe(rows.length);
      rows.flat().forEach((w, i) => expect(kernel.flat()[i]).toBeCloseTo(w, 10));
    },
  );
});

describe("point and pixel operations", () => {
  it.each(fixtures.gamma)(
    "gamma $gamma matches skimage.exposure.adjust_gamma",
    ({ gamma, output }) => {
      const transfer = gammaTransfer(gamma);
      output.forEach((expected, v) => expect(transfer(v)).toBeCloseTo(expected, 6));
    },
  );

  it.each(["luma709", "luma601", "luminance"] as const)("grayscale %s", (method) => {
    const { rgb } = fixtures.grayscale;
    fixtures.grayscale[method].forEach((expected, i) => {
      const [r, g, b] = [rgb[3 * i] ?? 0, rgb[3 * i + 1] ?? 0, rgb[3 * i + 2] ?? 0];
      expect(grayValue(r, g, b, method)).toBeCloseTo(expected, 5);
    });
  });
});

describe("the Inspector kernel is the kernel that runs", () => {
  const params: Record<string, Params> = {
    box: { size: 5 },
    gaussian: { sigma: 1.3, truncate: 3 },
    "motion-blur": { length: 7, angle: 30 },
    laplacian: { neighbors: "8", sign: "positive-center" },
    "unsharp-mask": { sigma: 1.2, amount: 0.8, threshold: 0 },
    binomial: { size: 7 },
    triangular: { size: 5 },
    "disk-average": { radius: 2.3 },
    "fir-lowpass": { taps: 9, cutoff: 0.2, window: "blackman" },
    "laplacian-sharpen": { neighbors: "8", amount: 0.6 },
    "high-pass": { sigma: 1.5 },
    "high-boost": { sigma: 1.5, boost: 1.7 },
    "weighted-average": { kernel: "0 1 2 1 0; 1 2 4 2 1; 0 1 2 1 0", normalize: true },
  };
  it.each(Object.entries(params))("%s", (id, p) => {
    const filter = browserFilter(id) as PlaneFilter;
    const representation = filter.representation(p);
    if (representation.kind !== "kernels") throw new Error("expected kernels");
    const [kernel] = representation.kernels;
    if (!kernel) throw new Error("expected one kernel");
    const context = { border: "reflect101" as const, originX: 0, originY: 0, channel: 0 };
    const viaKernel = correlate2d(input, kernelFromRows(kernel.rows), "reflect101");
    const viaFilter = filter.plane(input, p, context);
    viaFilter.data.forEach((v, i) => expect(v).toBeCloseTo(viaKernel.data[i] ?? NaN, 3));
  });

  it("Sobel K_x and K_y give Gx and Gy", () => {
    const sobel = browserFilter("sobel") as PlaneFilter;
    const representation = sobel.representation({});
    if (representation.kind !== "kernels") throw new Error("expected kernels");
    const context = { border: "reflect101" as const, originX: 0, originY: 0, channel: 0 };
    for (const [index, output] of [
      [0, "gx"],
      [1, "gy"],
    ] as const) {
      const rows = representation.kernels[index]?.rows ?? [];
      const viaKernel = correlate2d(input, kernelFromRows(rows), "reflect101");
      const viaFilter = sobel.plane(input, { output }, context);
      viaFilter.data.forEach((v, i) => expect(v).toBeCloseTo(viaKernel.data[i] ?? NaN, 4));
    }
  });
});

describe("registry", () => {
  it("has unique ids and a radius for default parameters", () => {
    const ids = BROWSER_FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const filter of BROWSER_FILTERS) expect(filter.radius({})).toBeGreaterThanOrEqual(0);
  });

  it("keeps flat images flat for every smoothing filter", () => {
    const flat = createPlane(9, 7, 77);
    const context = { border: "reflect101" as const, originX: 0, originY: 0, channel: 0 };
    for (const id of ["box", "gaussian", "motion-blur", "median", "unsharp-mask"]) {
      const filter = browserFilter(id) as PlaneFilter;
      filter.plane(flat, {}, context).data.forEach((v) => expect(v).toBeCloseTo(77, 4));
    }
  });
});
