import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  hsvToRgb,
  linearToSrgb,
  luma709,
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
