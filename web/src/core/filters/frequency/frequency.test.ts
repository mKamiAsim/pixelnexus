import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";
import type { Params } from "@/core/filters/types";

import { frequencyResponse, hasFrequencyResponse } from "./index";
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
