import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { maskBounds, type Mask } from "@/core/mask/mask";

import { distance, sampleColor, toCoords } from "./color";
import { colorRange, ramp, selectBrightness, selectHsv, toneWeight } from "./range";
import { antiAliasEdges, magicWand } from "./wand";

/** Build an image from rows of letters, each letter one color. */
function paint(rows: string[], colors: Record<string, [number, number, number]>): RgbaImage {
  const image = createImage(rows[0]?.length ?? 1, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) =>
      image.data.set([...(colors[c] ?? [0, 0, 0]), 255], (y * image.width + x) * 4),
    ),
  );
  return image;
}
const toRows = (mask: Mask) =>
  Array.from({ length: mask.height }, (_, y) =>
    Array.from({ length: mask.width }, (_, x) =>
      (mask.data[y * mask.width + x] ?? 0) >= 128 ? "#" : ".",
    ).join(""),
  );

const colors: Record<string, [number, number, number]> = {
  r: [200, 30, 30],
  s: [210, 40, 25],
  b: [20, 40, 220],
  w: [250, 250, 250],
};
// Two red areas that do not touch, a nearly red "s" pixel, blue between them.
const scene = paint(["rrbbbrr", "rsbbbrr", "bbbbbbb", "wwwwwww"], colors);
const wand = {
  tolerance: 32,
  contiguous: true,
  sampleSize: 1,
  antiAlias: false,
  colorSpace: "rgb" as const,
};

describe("color distances", () => {
  it("puts black and white 255 apart in every space", () => {
    for (const space of ["rgb", "lab"] as const) {
      expect(distance(toCoords(0, 0, 0, space), toCoords(255, 255, 255, space))).toBeCloseTo(
        space === "rgb" ? 255 * Math.sqrt(3) : 255,
        0,
      );
    }
    expect(distance(toCoords(0, 0, 0, "hsv"), toCoords(255, 255, 255, "hsv"))).toBeCloseTo(255, 6);
  });

  it("treats hue as a circle in HSV", () => {
    const a = toCoords(255, 0, 10, "hsv");
    const b = toCoords(255, 10, 0, "hsv");
    const far = toCoords(0, 255, 255, "hsv");
    expect(distance(a, b)).toBeLessThan(distance(a, far) / 10);
  });

  it("samples the mean of a square, leaving out pixels outside the image", () => {
    const image = paint(["wb", "bb"], colors);
    expect(sampleColor(image, 0, 0, 1)).toEqual([250, 250, 250]);
    const [r] = sampleColor(image, 0, 0, 3);
    expect(r).toBeCloseTo((250 + 20 * 3) / 4, 10);
  });
});

describe("Magic Wand", () => {
  it("selects only the connected area in contiguous mode", () => {
    expect(toRows(magicWand(scene, 0, 0, wand))).toEqual([
      "##.....",
      "##.....",
      ".......",
      ".......",
    ]);
  });

  it("selects every matching pixel when not contiguous", () => {
    expect(toRows(magicWand(scene, 0, 0, { ...wand, contiguous: false }))).toEqual([
      "##...##",
      "##...##",
      ".......",
      ".......",
    ]);
  });

  it("follows the tolerance", () => {
    // "s" is 15 away from "r" in RGB: the differences are 10, 10 and 5.
    expect(toRows(magicWand(scene, 0, 0, { ...wand, tolerance: 14 }))[1]).toBe("#......");
    expect(toRows(magicWand(scene, 0, 0, { ...wand, tolerance: 15 }))[1]).toBe("##.....");
    expect(toRows(magicWand(scene, 0, 0, { ...wand, tolerance: 0 }))[1]).toBe("#......");
  });

  it("selects nothing outside the image, and softens edges with anti-aliasing", () => {
    expect(maskBounds(magicWand(scene, -1, 0, wand))).toBeNull();
    const soft = magicWand(scene, 3, 3, { ...wand, antiAlias: true });
    // On the bottom row, the window holds 6 pixels inside the image, 3 of them white.
    expect(soft.data[3 * 7 + 3]).toBe(128);
    // Just above, 3 of the 9 pixels in the window are white.
    expect(soft.data[2 * 7 + 3]).toBe(85);
    expect(antiAliasEdges(soft).width).toBe(7);
  });
});

describe("Color Range and tone selections", () => {
  it("ramps from full to none", () => {
    expect(ramp(5, 10, 10)).toBe(1);
    expect(ramp(15, 10, 10)).toBe(0.5);
    expect(ramp(25, 10, 10)).toBe(0);
    expect(ramp(11, 10, 0)).toBe(0);
  });

  it("selects sampled colors everywhere, with a soft fall-off", () => {
    const base = {
      preset: "sampled" as const,
      samples: [{ x: 0, y: 0 }],
      tolerance: 0,
      fuzziness: 30,
      colorSpace: "rgb" as const,
      localized: false,
      range: 50,
    };
    const mask = colorRange(scene, base);
    expect(mask.data[0]).toBe(255);
    expect(mask.data[6]).toBe(255);
    // "s" is 15 away, half of the fuzziness.
    expect(mask.data[1 * 7 + 1]).toBe(128);
    expect(mask.data[2 * 7]).toBe(0);
    const local = colorRange(scene, { ...base, localized: true, range: 50 });
    expect(local.data[6] ?? 0).toBeLessThan(mask.data[6] ?? 0);
    expect(local.data[0]).toBe(255);
    // A sample that carries its color uses that color, not the pixel under it.
    const given = colorRange(scene, {
      ...base,
      samples: [{ x: 2, y: 3, color: sampleColor(scene, 0, 0, 1) }],
    });
    expect(given.data).toEqual(mask.data);
  });

  it("splits tones into shadows, midtones and highlights that add up to 1", () => {
    for (let y = 0; y <= 255; y += 5) {
      const sum =
        toneWeight("shadows", y) + toneWeight("midtones", y) + toneWeight("highlights", y);
      expect(sum).toBeCloseTo(1, 10);
    }
    const mask = colorRange(scene, {
      preset: "highlights",
      samples: [],
      tolerance: 0,
      fuzziness: 0,
      colorSpace: "rgb",
      localized: false,
      range: 50,
    });
    expect(toRows(mask)[3]).toBe("#######");
    expect(toRows(mask)[2]).toBe(".......");
  });

  it("selects by brightness with soft edges", () => {
    const mask = selectBrightness(scene, { low: 200, high: 255, softness: 0 });
    expect(toRows(mask)).toEqual([".......", ".......", ".......", "#######"]);
    // Blue has luma 0.2126 * 20 + 0.7152 * 40 + 0.0722 * 220 = 48.744, 11.256 below 60.
    const soft = selectBrightness(scene, { low: 60, high: 255, softness: 22.512 });
    expect(Math.abs((soft.data[2 * 7] ?? 0) - 127.5)).toBeLessThanOrEqual(0.5);
  });

  it("selects by hue around the circle, and by saturation and value", () => {
    const hues = paint(["abc"], { a: [255, 0, 20], b: [255, 20, 0], c: [0, 255, 0] });
    const reds = selectHsv(hues, {
      hue: 0,
      hueWidth: 10,
      saturationMin: 50,
      saturationMax: 100,
      valueMin: 0,
      valueMax: 100,
      softness: 0,
    });
    expect([...reds.data]).toEqual([255, 255, 0]);
    const gray = selectHsv(scene, {
      hue: 0,
      hueWidth: 180,
      saturationMin: 0,
      saturationMax: 5,
      valueMin: 90,
      valueMax: 100,
      softness: 0,
    });
    expect(toRows(gray)[3]).toBe("#######");
    expect(toRows(gray)[0]).toBe(".......");
  });
});
