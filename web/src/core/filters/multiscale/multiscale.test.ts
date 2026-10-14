import { describe, expect, it } from "vitest";

import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import type { Params, PlaneFilter } from "@/core/filters/types";

import {
  gaussianPyramid,
  gaussianPyramidFilter,
  laplacianPyramidFilter,
  laplacianRebuild,
} from "./pyramid";

const BORDERS: readonly BorderMode[] = ["reflect101", "reflect", "replicate", "wrap", "constant"];

function texture(width: number, height: number) {
  const plane = createPlane(width, height);
  plane.data.forEach((_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    plane.data[i] = 128 + 60 * Math.sin(0.9 * x + 0.4 * y) + ((x * 7 + y * 13) % 11);
  });
  return plane;
}

const run = (
  filter: PlaneFilter,
  plane: Plane,
  params: Params,
  border: BorderMode = "reflect101",
) => filter.plane(plane, params, { border, originX: 0, originY: 0, channel: 0 });

describe("pyramids", () => {
  it("halves each level, rounding up, and stops at one pixel", () => {
    const sizes = gaussianPyramid(createPlane(13, 7), 3, "reflect101").map((p) => [
      p.width,
      p.height,
    ]);
    expect(sizes).toEqual([
      [13, 7],
      [7, 4],
      [4, 2],
      [2, 1],
    ]);
    expect(gaussianPyramid(createPlane(3, 3), 8, "reflect101")).toHaveLength(3);
  });

  it("gives the image back from a Laplacian pyramid with all gains 1, for every border", () => {
    const plane = texture(23, 17);
    for (const border of BORDERS) {
      const out = laplacianRebuild(gaussianPyramid(plane, 4, border), [1, 1, 1, 1], border);
      expect(out.width).toBe(23);
      expect(out.height).toBe(17);
      out.data.forEach((v, i) => expect(v).toBeCloseTo(plane.data[i] ?? 0, 3));
    }
  });

  it("keeps a flat image flat, except with the constant border", () => {
    const flat = createPlane(10, 13);
    flat.data.fill(77);
    for (const border of BORDERS.filter((b) => b !== "constant")) {
      const out = run(gaussianPyramidFilter, flat, { levels: 3 }, border);
      out.data.forEach((v) => expect(v).toBeCloseTo(77, 4));
      const detail = run(laplacianPyramidFilter, flat, { levels: 3, gain1: 3, gain2: 0 }, border);
      detail.data.forEach((v) => expect(v).toBeCloseTo(77, 4));
    }
  });

  it("is not shift invariant: an impulse on an odd pixel spreads differently", () => {
    const line = (at: number) => {
      const plane = createPlane(21, 1);
      plane.data[at] = 1;
      return Array.from(run(gaussianPyramidFilter, plane, { levels: 1 }).data);
    };
    const even = line(10);
    const odd = line(11);
    // A shift-invariant filter would give the same response, moved by one pixel.
    const moved = odd.slice(1);
    expect(moved.some((v, i) => Math.abs(v - (even[i] ?? 0)) > 1e-6)).toBe(true);
    // Away from the border, REDUCE keeps 8 / 16 of the impulse and EXPAND spreads each coarse
    // pixel with total weight 2, so the response sums to the impulse.
    expect(even.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
  });
});
