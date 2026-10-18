import { describe, expect, it } from "vitest";

import { createPlane, type Plane } from "@/core/filters/planes";
import type { Params } from "@/core/filters/types";

import { chromaDenoiseFilter } from "./chroma";

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function planeOf(width: number, height: number, f: (i: number) => number): Plane {
  const p = createPlane(width, height);
  p.data.forEach((_, i) => (p.data[i] = f(i)));
  return p;
}

describe("chroma denoising", () => {
  const [width, height] = [20, 14];
  const rgb = [3, 5, 7].map((k) => planeOf(width, height, (i) => (i * k * 97) % 256)) as [
    Plane,
    Plane,
    Plane,
  ];

  const cases: Params[] = [
    { method: "gaussian", sigma: 2 },
    { method: "median", size: 5 },
  ];
  for (const params of cases) {
    it(`keeps the luma of every pixel (${String(params.method)})`, () => {
      const out = chromaDenoiseFilter.color(rgb, params, CONTEXT);
      for (let i = 0; i < width * height; i++) {
        const before = luma(...(rgb.map((p) => p.data[i] ?? 0) as [number, number, number]));
        const after = luma(...(out.map((p) => p.data[i] ?? 0) as [number, number, number]));
        expect(after).toBeCloseTo(before, 3);
      }
    });
  }

  it("leaves a gray image as it is", () => {
    const gray = planeOf(width, height, (i) => (i * 37) % 256);
    const out = chromaDenoiseFilter.color([gray, gray, gray], { sigma: 3 }, CONTEXT);
    out.forEach((p) => p.data.forEach((v, i) => expect(v).toBeCloseTo(gray.data[i] ?? NaN, 3)));
  });
});
