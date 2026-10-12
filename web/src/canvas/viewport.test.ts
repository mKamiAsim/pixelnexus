import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEPS,
  centeredView,
  clampPan,
  fillZoom,
  fitZoom,
  formatZoom,
  imageToScreen,
  nextZoomStep,
  pixelAt,
  rulerSteps,
  screenToImage,
  showPixelGrid,
  zoomAt,
} from "./viewport";

const image = { width: 400, height: 200 };
const view = { width: 1000, height: 800 };

describe("viewport", () => {
  it("fits large images and leaves small ones at 100%", () => {
    expect(fitZoom({ width: 4000, height: 2000 }, view)).toBeCloseTo((1000 - 48) / 4000);
    expect(fitZoom(image, view)).toBe(1);
    expect(fitZoom(image, view, 24, true)).toBeCloseTo((1000 - 48) / 400);
  });

  it("centers the image", () => {
    const state = centeredView(image, view, 1);
    expect(state).toEqual({ zoom: 1, panX: 300, panY: 300 });
  });

  it("maps screen to image and back at many zooms", () => {
    for (const zoom of ZOOM_STEPS) {
      const state = { zoom, panX: 13.5, panY: -7.25 };
      const { x, y } = screenToImage(state, 321.5, 123.25);
      const { sx, sy } = imageToScreen(state, x, y);
      expect(sx).toBeCloseTo(321.5, 9);
      expect(sy).toBeCloseTo(123.25, 9);
    }
  });

  it("finds the pixel under the cursor, including edges", () => {
    const state = { zoom: 4, panX: 10, panY: 20 };
    expect(pixelAt(state, image, 10, 20)).toEqual({ x: 0, y: 0 });
    expect(pixelAt(state, image, 13.99, 23.99)).toEqual({ x: 0, y: 0 });
    expect(pixelAt(state, image, 14, 24)).toEqual({ x: 1, y: 1 });
    expect(pixelAt(state, image, 9.99, 20)).toBeNull();
    expect(pixelAt(state, image, 10 + 400 * 4, 20)).toBeNull();
  });

  it("keeps the point under the cursor fixed when zooming", () => {
    const state = { zoom: 1, panX: 50, panY: 60 };
    const before = screenToImage(state, 200, 150);
    const after = screenToImage(zoomAt(state, 3, 200, 150), 200, 150);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("steps through zoom levels and stops at the limits", () => {
    expect(nextZoomStep(1, 1)).toBe(2);
    expect(nextZoomStep(1, -1)).toBeCloseTo(2 / 3);
    expect(nextZoomStep(0.7, 1)).toBe(1);
    expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(nextZoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it("does not let the image leave the view", () => {
    const lost = clampPan({ zoom: 1, panX: 5000, panY: -5000 }, image, view);
    expect(lost.panX).toBe(1000 - 48);
    expect(lost.panY).toBe(48 - 200);
  });

  it("shows the pixel grid from 800%", () => {
    expect(showPixelGrid(7)).toBe(false);
    expect(showPixelGrid(8)).toBe(true);
  });

  it("formats zoom labels", () => {
    expect(formatZoom(1)).toBe("100%");
    expect(formatZoom(2 / 3)).toBe("66.7%");
    expect(formatZoom(0.0625)).toBe("6.3%");
    expect(formatZoom(8)).toBe("800%");
  });
});

describe("fill zoom and rulers", () => {
  it("fills the view with the image, cropping the longer side", () => {
    expect(fillZoom(image, view)).toBeCloseTo(4);
    expect(fillZoom({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toBeCloseTo(0.5);
  });

  it("keeps ruler labels at least 56 screen pixels apart", () => {
    for (const zoom of [0.02, 0.1, 0.5, 1, 3, 8, 32, 64]) {
      const { major, minor } = rulerSteps(zoom);
      expect(major * zoom).toBeGreaterThanOrEqual(56);
      expect(major % minor).toBe(0);
      expect(minor).toBeGreaterThanOrEqual(1);
    }
    expect(rulerSteps(1)).toEqual({ major: 100, minor: 20 });
    expect(rulerSteps(64)).toEqual({ major: 1, minor: 1 });
  });
});
