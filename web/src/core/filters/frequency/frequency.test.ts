import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";
import type { Params } from "@/core/filters/types";

import { createImage } from "@/core/image/types";

import { frequencyAt, positionOf, snapToPeak, spectrumPicture, spectrumView } from "./display";
import { frequencyResponse, hasFrequencyResponse } from "./index";
import {
  findPeaks,
  formatNotches,
  harmonics,
  notchCenters,
  notchResponse,
  parseNotches,
  periodicPeaks,
  windowedSpectrum,
} from "./notch";
import { passFilters, passFormula, passResponse } from "./passband";
import {
  fftFrequencies,
  frequencyFilter,
  frequencyMargin,
  sampleResponse,
  spectrumOf,
} from "./spectral";

function randomPlane(width: number, height: number, seed: number): Plane {
  const plane = createPlane(width, height);
  let s = seed;
  for (let i = 0; i < plane.data.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    plane.data[i] = s % 256;
  }
  return plane;
}

const context = { border: "reflect" as const, originX: 0, originY: 0, channel: 0 };

describe("frequency filtering", () => {
  it("lists frequencies as numpy.fft.fftfreq", () => {
    expect([...fftFrequencies(4)]).toEqual([0, 0.25, -0.5, -0.25]);
    expect([...fftFrequencies(5)]).toEqual([0, 0.2, 0.4, -0.4, -0.2]);
  });

  it("extends by half the size, at most 256 pixels, to a fast size", () => {
    expect([1, 13, 100, 512, 2000].map(frequencyMargin)).toEqual([1, 7, 50, 256, 256]);
    const spectrum = spectrumOf(createPlane(13, 10), "reflect");
    expect([spectrum.width, spectrum.height, spectrum.left, spectrum.top]).toEqual([27, 20, 7, 5]);
  });

  it("returns the plane for a response of 1", () => {
    const plane = randomPlane(17, 11, 3);
    const out = frequencyFilter(plane, "reflect101", () => 1);
    out.data.forEach((v, i) => expect(v).toBeCloseTo(plane.data[i] ?? 0, 3));
  });

  it("keeps a flat plane through a low-pass filter and removes it with a high-pass one", () => {
    const flat = createPlane(9, 7, 100);
    const low = frequencyFilter(
      flat,
      "constant",
      passResponse({ shape: "gaussian", band: "lowpass", d0: 0.1, width: 0, order: 2 }),
    );
    expect(Math.abs((low.data[30] ?? 0) - 100)).toBeGreaterThan(1);
    for (const border of ["reflect", "replicate", "wrap"] as const) {
      const kept = frequencyFilter(
        flat,
        border,
        passResponse({ shape: "butterworth", band: "lowpass", d0: 0.1, width: 0, order: 2 }),
      );
      kept.data.forEach((v) => expect(v).toBeCloseTo(100, 3));
      const removed = frequencyFilter(
        flat,
        border,
        passResponse({ shape: "ideal", band: "highpass", d0: 0.1, width: 0, order: 2 }),
      );
      removed.data.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-3));
    }
  });

  it("splits the image into complementary parts", () => {
    const plane = randomPlane(15, 12, 7);
    const pairs: [string, string, Params][] = [
      ["lowpass", "highpass", { cutoff: 0.12, order: 3 }],
      ["bandreject", "bandpass", { center: 0.2, width: 0.08, order: 2 }],
    ];
    for (const shape of ["ideal", "butterworth", "gaussian"]) {
      for (const [a, b, params] of pairs) {
        const run = (band: string) => {
          const filter = passFilters.find((f) => f.id === `${shape}-${band}`);
          if (!filter) throw new Error(`no ${shape}-${band}`);
          return filter.plane(plane, params, context);
        };
        const pb = run(b);
        run(a).data.forEach((v, i) => {
          expect(v + (pb.data[i] ?? 0)).toBeCloseTo(plane.data[i] ?? 0, 2);
        });
      }
    }
  });

  it("follows the textbook values at the cutoff", () => {
    const at = (shape: "ideal" | "butterworth" | "gaussian", band: "lowpass" | "bandreject") =>
      passResponse({ shape, band, d0: 0.2, width: 0.1, order: 2 })(0.2, 0);
    expect(at("ideal", "lowpass")).toBe(1);
    expect(at("butterworth", "lowpass")).toBeCloseTo(0.5, 12);
    expect(at("gaussian", "lowpass")).toBeCloseTo(Math.exp(-0.5), 12);
    expect(at("ideal", "bandreject")).toBe(0);
    expect(at("butterworth", "bandreject")).toBe(0);
    expect(at("gaussian", "bandreject")).toBeCloseTo(0, 12);
    const origin = passResponse({
      shape: "gaussian",
      band: "bandreject",
      d0: 0.2,
      width: 0.1,
      order: 2,
    });
    expect(origin(0, 0)).toBe(1);
  });

  it("shares each response with the Frequency explorer", () => {
    for (const filter of passFilters) {
      expect(hasFrequencyResponse(filter.id)).toBe(true);
      const params = { cutoff: 0.15, center: 0.2, width: 0.1, order: 2 };
      const representation = filter.representation(params);
      if (representation.kind !== "frequency") throw new Error("not a frequency representation");
      const response = frequencyResponse(filter.id, params);
      expect(response).toBeDefined();
      expect(representation.values).toEqual(sampleResponse(response ?? (() => 0)).values);
    }
    expect(frequencyResponse("gaussian", {})).toBeUndefined();
  });

  it("writes the values into the formula", () => {
    const formula = passFormula({
      shape: "butterworth",
      band: "bandpass",
      d0: 0.2,
      width: 0.05,
      order: 3,
    });
    expect(formula).toContain("D_0 = 0.2");
    expect(formula).toContain("W = 0.05");
    expect(formula).toContain("n = 3");
  });
});

describe("spectrum picture", () => {
  it("maps frequencies to picture positions and back", () => {
    const image = createImage(40, 30);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        const v = Math.round(128 + 100 * Math.sin(2 * Math.PI * 0.25 * x));
        image.data.set([v, v, v, 255], (y * 40 + x) * 4);
      }
    }
    const view = spectrumView(image);
    expect(view.cropped).toBe(false);
    expect([view.spectrum.width, view.spectrum.height]).toEqual([40, 30]);
    const p = positionOf(view, 0.25, 0);
    expect(frequencyAt(view, p.column, p.row)).toEqual({ fx: 0.25, fy: 0 });
    // The wave is the brightest point of the picture, apart from what the window leaves at 0.
    const picture = spectrumPicture(view);
    const at = (column: number, row: number) => picture.data[(row * 40 + column) * 4] ?? 0;
    expect(at(p.column, p.row)).toBe(255);
    expect(snapToPeak(view, p.column + 1, p.row - 2)).toEqual(p);
    expect(snapToPeak(view, p.column + 4, p.row)).not.toEqual(p);
    const tinted = spectrumPicture(view, () => 0);
    expect(tinted.data[(p.row * 40 + p.column) * 4]).toBeGreaterThan(
      tinted.data[(p.row * 40 + p.column) * 4 + 1] ?? 0,
    );
  });

  it("transforms the center of a large image", () => {
    expect(spectrumView(createImage(600, 20)).cropped).toBe(true);
    expect(spectrumView(createImage(600, 20)).plane.width).toBe(512);
  });
});

describe("notch filters", () => {
  it("reads and writes notch lists", () => {
    const parsed = parseNotches("0.2 0.1\n-0.15, 0.3; ");
    expect(parsed).toEqual({
      ok: true,
      notches: [
        { fx: 0.2, fy: 0.1 },
        { fx: -0.15, fy: 0.3 },
      ],
    });
    if (parsed.ok) expect(formatNotches(parsed.notches)).toBe("0.2 0.1; -0.15 0.3");
    expect(parseNotches("")).toEqual({ ok: true, notches: [] });
    expect(parseNotches("0.6 0").ok).toBe(false);
    expect(parseNotches("0.1").ok).toBe(false);
    expect(parseNotches(Array(33).fill("0.1 0.1").join(";")).ok).toBe(false);
  });

  it("adds the mirror points, and across the axes for a mirror border", () => {
    expect(notchCenters([{ fx: 0.2, fy: 0.1 }], false)).toHaveLength(2);
    expect(notchCenters([{ fx: 0.2, fy: 0.1 }], true)).toEqual([
      { fx: 0.2, fy: 0.1 },
      { fx: -0.2, fy: -0.1 },
      { fx: -0.2, fy: 0.1 },
      { fx: 0.2, fy: -0.1 },
    ]);
    // On an axis, the mirror points across the axes are the same two points.
    expect(notchCenters([{ fx: 0.2, fy: 0 }], true)).toHaveLength(2);
  });

  it("is 0 at a notch and its mirror point and near 1 far away", () => {
    const h = notchResponse([{ fx: 0.2, fy: 0.1 }], "gaussian", 0.02, 1, false, false);
    expect(h(0.2, 0.1)).toBe(0);
    expect(h(-0.2, -0.1)).toBe(0);
    expect(h(0, 0)).toBeCloseTo(1, 10);
    const pass = notchResponse([{ fx: 0.2, fy: 0.1 }], "ideal", 0.02, 1, true, false);
    expect(pass(0.2, 0.1)).toBe(1);
    expect(pass(0.1, 0.1)).toBe(0);
  });

  it("lists the harmonics inside the spectrum", () => {
    expect(harmonics(0.15, 0.05, 5)).toEqual([
      { fx: 0.15, fy: 0.05 },
      { fx: 0.3, fy: 0.1 },
      { fx: 0.44999999999999996, fy: 0.15000000000000002 },
    ]);
    expect(harmonics(0, 0, 3)).toEqual([]);
  });

  it("finds the peak of a wave and removes the wave", () => {
    const width = 128;
    const height = 96;
    const plane = createPlane(width, height);
    const clean = createPlane(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const base = 80 + 0.6 * x + 0.4 * y;
        clean.data[y * width + x] = base;
        plane.data[y * width + x] = base + 40 * Math.sin(2 * Math.PI * (0.13 * x + 0.05 * y));
      }
    }
    const peaks = findPeaks(windowedSpectrum(plane), {
      minFrequency: 0.05,
      threshold: 3,
      maxPeaks: 8,
    });
    expect(peaks.some((p) => Math.abs(p.fx - 0.13) < 0.01 && Math.abs(p.fy - 0.05) < 0.01)).toBe(
      true,
    );
    expect(periodicPeaks(plane, {})).toEqual(peaks);
    const response = frequencyResponse(
      "periodic-noise",
      { radius: 0.02, border: "reflect" },
      plane,
    );
    expect(response).toBeDefined();
    const out = frequencyFilter(plane, "reflect", response ?? (() => 1));
    let sum = 0;
    let count = 0;
    for (let y = 24; y < height - 24; y++) {
      for (let x = 32; x < width - 32; x++) {
        sum += ((out.data[y * width + x] ?? 0) - (clean.data[y * width + x] ?? 0)) ** 2;
        count += 1;
      }
    }
    expect(Math.sqrt(sum / count)).toBeLessThan(2);
    expect(frequencyResponse("periodic-noise", {})).toBeUndefined();
  });
});
