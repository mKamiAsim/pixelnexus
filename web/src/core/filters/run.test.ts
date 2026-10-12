import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";

import { createPlane, rgbToYcc, yccToRgb } from "./planes";
import { browserFilter, BROWSER_FILTERS } from "./registry";
import { mapValue, runFilter, type Rect } from "./run";
import type { BrowserFilter, Params } from "./types";

/** A random RGBA image. With `alpha`, a quarter of the pixels are partly transparent. */
function randomImage(width: number, height: number, seed: number, alpha = false): RgbaImage {
  const random = mulberry32(seed);
  const image = createImage(width, height);
  for (let i = 0; i < image.data.length; i++) {
    const isAlpha = i % 4 === 3;
    image.data[i] = isAlpha
      ? alpha && random() < 0.25
        ? Math.floor(random() * 256)
        : 255
      : Math.floor(random() * 256);
  }
  return image;
}

function crop(image: RgbaImage, rect: Rect): RgbaImage {
  const out = createImage(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    out.data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return out;
}

const get = (id: string): BrowserFilter => {
  const filter = browserFilter(id);
  if (!filter) throw new Error(`No filter ${id}`);
  return filter;
};

const CASES: [string, Params][] = [
  ["box", { size: 5, border: "reflect101" }],
  ["box", { size: 3, border: "constant", channelScope: "luminance" }],
  ["gaussian", { sigma: 1.5, truncate: 3, border: "reflect" }],
  ["gaussian", { sigma: 2, truncate: 3, border: "wrap", channelScope: "chroma" }],
  ["gaussian", { sigma: 1, truncate: 3, linearLight: true }],
  ["motion-blur", { length: 9, angle: 30, border: "replicate" }],
  ["sobel", { output: "magnitude", outputMapping: "abs", channelScope: "luminance" }],
  ["sobel", { output: "gx", outputMapping: "offset", channelScope: "rgb", border: "constant" }],
  ["laplacian", { neighbors: "8", outputMapping: "clip" }],
  ["median", { size: 5, border: "reflect" }],
  ["median", { size: 3, channelScope: "luminance" }],
  ["unsharp-mask", { sigma: 1.2, amount: 1.5, threshold: 4 }],
  ["gamma", { gamma: 0.6 }],
  ["gamma", { gamma: 1.8, channelScope: "luminance" }],
  ["grayscale", { method: "luminance" }],
  ["noise-gaussian", { sigma: 20, seed: 3 }],
  ["noise-salt-pepper", { amount: 0.2, seed: 9 }],
];

describe("a region gives the same pixels as the whole image", () => {
  const image = randomImage(23, 17, 1, true);
  const regions: Rect[] = [
    { x: 0, y: 0, width: 5, height: 4 },
    { x: 7, y: 3, width: 9, height: 8 },
    { x: 18, y: 12, width: 5, height: 5 },
  ];
  it.each(CASES.map(([id, params]) => [`${id} ${JSON.stringify(params)}`, id, params] as const))(
    "%s",
    (_name, id, params) => {
      const whole = runFilter(image, get(id), params).image;
      for (const region of regions) {
        // Normalize mapping depends on the region by design, so it is excluded here.
        expect(runFilter(image, get(id), params, region).image.data).toEqual(
          crop(whole, region).data,
        );
      }
    },
  );

  it("covers every registered filter", () => {
    const tested = new Set(CASES.map(([id]) => id));
    expect(BROWSER_FILTERS.filter((f) => !tested.has(f.id)).map((f) => f.id)).toEqual([]);
  });
});

describe("channels and alpha", () => {
  it("keeps alpha unchanged", () => {
    const image = randomImage(12, 9, 2, true);
    for (const [id, params] of CASES) {
      const out = runFilter(image, get(id), params).image;
      for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(image.data[i]);
    }
  });

  it("does not let hidden colors of transparent pixels bleed into a blur", () => {
    // Opaque red on the left, fully transparent green on the right.
    const image = createImage(10, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 10; x++) {
        const o = (y * 10 + x) * 4;
        image.data.set(x < 5 ? [255, 0, 0, 255] : [0, 255, 0, 0], o);
      }
    }
    const out = runFilter(image, get("gaussian"), { sigma: 2, truncate: 3 }).image;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 5; x++) {
        const o = (y * 10 + x) * 4;
        expect([out.data[o], out.data[o + 1], out.data[o + 2]]).toEqual([255, 0, 0]);
      }
    }
  });

  it("gives the same result for an opaque image with or without alpha weighting", () => {
    // Opaque images never use alpha weighting, so the result must match plain correlation.
    const image = randomImage(11, 8, 3);
    const out = runFilter(image, get("box"), { size: 3 }).image;
    const o = (4 * 11 + 5) * 4;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) sum += image.data[((4 + dy) * 11 + 5 + dx) * 4] ?? 0;
    }
    expect(out.data[o]).toBe(Math.round(sum / 9));
  });

  it("round-trips Y'CbCr exactly", () => {
    const r = createPlane(4, 1);
    const g = createPlane(4, 1);
    const b = createPlane(4, 1);
    r.data.set([0, 255, 12, 200]);
    g.data.set([0, 255, 240, 10]);
    b.data.set([0, 255, 33, 99]);
    const [r2, g2, b2] = yccToRgb(...rgbToYcc(r, g, b));
    [r, g, b].forEach((plane, c) =>
      plane.data.forEach((v, i) => expect([r2, g2, b2][c]?.data[i]).toBeCloseTo(v, 3)),
    );
  });

  it("changes only brightness with the brightness scope on a gray image", () => {
    const image = createImage(9, 9);
    for (let i = 0; i < 81; i++) image.data.set([i * 3, i * 3, i * 3, 255], i * 4);
    const scoped = runFilter(image, get("gaussian"), { sigma: 1, channelScope: "luminance" }).image;
    const rgb = runFilter(image, get("gaussian"), { sigma: 1, channelScope: "rgb" }).image;
    scoped.data.forEach((v, i) => expect(Math.abs(v - (rgb.data[i] ?? 0))).toBeLessThanOrEqual(1));
  });

  it("gives a gray result for gradients of brightness", () => {
    const image = randomImage(8, 8, 4);
    const out = runFilter(image, get("sobel"), { channelScope: "luminance" }).image;
    for (let o = 0; o < out.data.length; o += 4) {
      expect(out.data[o]).toBe(out.data[o + 1]);
      expect(out.data[o + 1]).toBe(out.data[o + 2]);
    }
  });

  it("reports that linear light is RGB only", () => {
    const result = runFilter(randomImage(5, 5, 5), get("gaussian"), {
      linearLight: true,
      channelScope: "luminance",
    });
    expect(result.warnings).toHaveLength(1);
  });
});

describe("output mapping", () => {
  it("maps signed values to 8 bits", () => {
    expect(mapValue(-30.4, "abs")).toBe(30);
    expect(mapValue(-30.4, "offset")).toBe(98);
    expect(mapValue(-30.4, "clip")).toBe(0);
    expect(mapValue(300, "clip")).toBe(255);
    expect(mapValue(5, "normalize", { min: -5, max: 15 })).toBe(128);
    expect(mapValue(3, "normalize", { min: 3, max: 3 })).toBe(0);
    expect(mapValue(Number.NaN, "abs")).toBe(0);
  });

  it("stretches the full result range with normalize", () => {
    const image = randomImage(16, 12, 6);
    const out = runFilter(image, get("sobel"), {
      channelScope: "luminance",
      outputMapping: "normalize",
    }).image;
    const values = Array.from(out.data.filter((_, i) => i % 4 === 0));
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(255);
  });
});

describe("noise", () => {
  const flat = createImage(256, 256);
  for (let i = 0; i < flat.data.length; i += 4) flat.data.set([128, 128, 128, 255], i);

  it("has the requested standard deviation", () => {
    const out = runFilter(flat, get("noise-gaussian"), { sigma: 10, seed: 1 }).image;
    const values = Array.from(out.data.filter((_, i) => i % 4 === 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeCloseTo(128, 0);
    // Rounding to whole levels adds a variance of 1/12, so allow a small margin.
    expect(Math.abs(sd - 10)).toBeLessThan(0.3);
  });

  it("changes the requested share of pixels to salt and pepper", () => {
    const out = runFilter(flat, get("noise-salt-pepper"), {
      amount: 0.1,
      salt: 0.5,
      seed: 2,
    }).image;
    let salt = 0;
    let pepper = 0;
    for (let o = 0; o < out.data.length; o += 4) {
      if (out.data[o] === 255) salt++;
      if (out.data[o] === 0) pepper++;
    }
    const n = 256 * 256;
    expect(Math.abs((salt + pepper) / n - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(salt / (salt + pepper) - 0.5)).toBeLessThan(0.05);
  });

  it("depends on the seed", () => {
    const a = runFilter(flat, get("noise-gaussian"), { seed: 1 }).image.data;
    const b = runFilter(flat, get("noise-gaussian"), { seed: 1 }).image.data;
    const c = runFilter(flat, get("noise-gaussian"), { seed: 2 }).image.data;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
