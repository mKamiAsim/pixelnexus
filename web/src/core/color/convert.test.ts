import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  hslToRgb,
  hsvToRgb,
  linearToSrgb,
  luma709,
  rgbToHsl,
  rgbToHsv,
  rgbToLab,
  srgbToLinear,
} from "@/core/color/convert";

const fixtures = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/color.json", import.meta.url), "utf8"),
) as {
  tolerance: { hue: number; other: number; lab: number };
  cases: { rgb: [number, number, number]; hsv: number[]; lab: number[] }[];
};

describe("color conversion against scikit-image", () => {
  it.each(fixtures.cases)("rgb $rgb", ({ rgb, hsv, lab }) => {
    const [h, s, v] = rgbToHsv(...rgb);
    // scikit-image reports hue 0 for grays, as we do.
    expect(h).toBeCloseTo(hsv[0] ?? 0, 6);
    expect(s).toBeCloseTo(hsv[1] ?? 0, 6);
    expect(v).toBeCloseTo(hsv[2] ?? 0, 6);
    const ours = rgbToLab(...rgb);
    ours.forEach((value, i) => expect(Math.abs(value - (lab[i] ?? 0))).toBeLessThan(1e-4));
  });
});

describe("round trips and known values", () => {
  it("sRGB transfer function inverts", () => {
    for (let v = 0; v <= 255; v++) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 9);
  });

  it("HSV round trip", () => {
    for (const rgb of fixtures.cases.map((c) => c.rgb)) {
      const back = hsvToRgb(...rgbToHsv(...rgb));
      back.forEach((value, i) => expect(value).toBeCloseTo(rgb[i] ?? 0, 9));
    }
  });

  it("luma weights add up to one", () => {
    expect(luma709(255, 255, 255)).toBeCloseTo(255, 10);
    expect(luma709(0, 255, 0)).toBeCloseTo(0.7152 * 255, 10);
  });
});

describe("HSL", () => {
  it("uses lightness (max + min) / 2 and the HSL saturation", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual([0, 1, 0.5]);
    const [h, s, l] = rgbToHsl(51, 102, 204);
    expect(h).toBeCloseTo(220, 9);
    expect(l).toBeCloseTo(0.5, 9);
    expect(s).toBeCloseTo(0.6, 9);
    expect(rgbToHsl(128, 128, 128)).toEqual([0, 0, 128 / 255]);
  });

  it("goes back to the same color", () => {
    const colors: [number, number, number][] = [
      [12, 200, 77],
      [255, 255, 255],
      [0, 0, 0],
      [240, 230, 250],
      [3, 1, 2],
    ];
    for (const rgb of colors) {
      const back = hslToRgb(...rgbToHsl(...rgb));
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i] ?? 0, 9));
    }
  });
});
