import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { maskBounds, maskStats } from "@/core/mask/mask";
import { rectMask } from "@/core/mask/raster";

import { snapToEdges } from "./snap";
import { antiAliasEdges } from "./wand";

/** A light image with a dark square from (20, 15) to (40, 35), ends excluded. */
function scene(): RgbaImage {
  const image = createImage(60, 50);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 60; x++) {
      const v = x >= 20 && x < 40 && y >= 15 && y < 35 ? 40 : 210;
      image.data.set([v, v, v, 255], (y * 60 + x) * 4);
    }
  }
  return image;
}

const options = { radius: 6, contrast: 0.1, smoothing: 0 };

describe("snap to edges", () => {
  it("moves a selection that is a few pixels off onto the edge", () => {
    const off = rectMask(60, 50, { x0: 23, y0: 12, x1: 43, y1: 32 }, false);
    const snapped = snapToEdges(scene(), off, options);
    // Hard pixels match the square. The anti-aliased edge pixels are half selected.
    expect(maskBounds({ ...snapped, data: snapped.data.map((v) => (v >= 128 ? v : 0)) })).toEqual({
      x: 20,
      y: 15,
      width: 20,
      height: 20,
    });
    expect(Math.abs(maskStats(snapped).area - 400)).toBeLessThan(20);
  });

  it("leaves the edge where it was when there is no edge nearby", () => {
    const flat = createImage(60, 50);
    flat.data.fill(128);
    const rect = rectMask(60, 50, { x0: 20, y0: 15, x1: 40, y1: 35 }, false);
    // Only the four corner pixels change: both floods reach them at the same time, and a
    // sharp corner rounds by one pixel. Then the edge is anti-aliased.
    const corners = [
      [20, 15],
      [39, 15],
      [20, 34],
      [39, 34],
    ].map(([x, y]) => (y ?? 0) * 60 + (x ?? 0));
    const cut = { ...rect, data: rect.data.map((v, i) => (corners.includes(i) ? 0 : v)) };
    expect(snapToEdges(flat, rect, options).data).toEqual(antiAliasEdges(cut).data);
  });

  it("does not reach edges farther away than the radius", () => {
    const far = rectMask(60, 50, { x0: 30, y0: 15, x1: 50, y1: 35 }, false);
    const snapped = snapToEdges(scene(), far, { ...options, radius: 3 });
    // The square's left edge is 10 pixels away, out of reach. The right edges agree anyway.
    expect(maskBounds({ ...snapped, data: snapped.data.map((v) => (v >= 128 ? v : 0)) })?.x).toBe(
      30,
    );
  });
});
