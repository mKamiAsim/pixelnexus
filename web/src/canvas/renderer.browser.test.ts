import { afterEach, describe, expect, it } from "vitest";

import { ImageRenderer, type RenderRequest } from "@/canvas/renderer";
import { createImage, type RgbaImage } from "@/core/image/types";

const COLORS = {
  // Whole steps of 1/255, like the hex tokens the app uses.
  pasteboard: [26 / 255, 51 / 255, 77 / 255],
  checkerA: [1, 1, 1],
  checkerB: [0, 0, 0],
} as const;

/** A 2x2 image: red, green / blue, transparent. */
function quad(): RgbaImage {
  const image = createImage(2, 2);
  image.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
  return image;
}

function request(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    view: { zoom: 10, panX: 0, panY: 0 },
    width: 40,
    height: 30,
    dpr: 1,
    mode: "current",
    sideBySide: false,
    splitX: 20,
    overlayOpacity: 0.5,
    pixelGrid: false,
    colors: COLORS,
    ...overrides,
  };
}

let canvas: HTMLCanvasElement | null = null;

function setup() {
  canvas = document.createElement("canvas");
  document.body.append(canvas);
  return new ImageRenderer(canvas);
}

/** Read one pixel, with (x, y) measured from the top left in device pixels. */
function read(x: number, y: number): number[] {
  const gl = canvas?.getContext("webgl2");
  if (!gl || !canvas) throw new Error("no context");
  const out = new Uint8Array(4);
  gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return Array.from(out);
}

afterEach(() => canvas?.remove());

describe("ImageRenderer", () => {
  it("draws each image pixel as an exact square when zoomed in", () => {
    const renderer = setup();
    renderer.setImages(quad(), quad());
    renderer.render(request());
    expect(read(5, 5)).toEqual([255, 0, 0, 255]);
    expect(read(15, 5)).toEqual([0, 255, 0, 255]);
    expect(read(5, 15)).toEqual([0, 0, 255, 255]);
  });

  it("shows the checkerboard through transparent pixels and the pasteboard outside", () => {
    const renderer = setup();
    renderer.setImages(quad(), quad());
    renderer.render(request());
    const checker = read(12, 12);
    expect([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]).toContainEqual(checker);
    expect(read(30, 25)).toEqual([26, 51, 77, 255]);
  });

  it("applies pan and device pixel ratio", () => {
    const renderer = setup();
    renderer.setImages(quad(), quad());
    renderer.render(request({ view: { zoom: 10, panX: 10, panY: 0 }, dpr: 2 }));
    expect(read(2 * 15, 2 * 5)).toEqual([255, 0, 0, 255]);
    expect(read(2 * 5, 2 * 5)).toEqual([26, 51, 77, 255]);
  });

  it("splits between original and current", () => {
    const renderer = setup();
    const original = quad();
    const current = createImage(2, 2);
    current.data.fill(255);
    renderer.setImages(current, original);
    renderer.render(request({ mode: "split", splitX: 10 }));
    expect(read(5, 5)).toEqual([255, 0, 0, 255]);
    expect(read(15, 5)).toEqual([255, 255, 255, 255]);
  });

  it("shows the absolute difference", () => {
    const renderer = setup();
    const original = quad();
    const current = quad();
    current.data.set([200, 0, 0, 255], 0);
    renderer.setImages(current, original);
    renderer.render(request({ mode: "difference" }));
    expect(read(5, 5)).toEqual([55, 0, 0, 255]);
  });

  it("keeps the original texture after the current image changes", () => {
    const renderer = setup();
    const original = quad();
    renderer.setImages(original, original);
    const edited = createImage(2, 2);
    edited.data.fill(255);
    renderer.setImages(edited, original);
    renderer.render(request({ mode: "original" }));
    expect(read(5, 5)).toEqual([255, 0, 0, 255]);
    renderer.render(request({ mode: "current" }));
    expect(read(5, 5)).toEqual([255, 255, 255, 255]);
  });

  it("draws the pixel grid from 800%", () => {
    const renderer = setup();
    const white = createImage(2, 2);
    white.data.fill(255);
    renderer.setImages(white, white);
    renderer.render(request({ pixelGrid: true }));
    expect(read(10, 5)[0]).toBeLessThan(255);
    expect(read(15, 5)).toEqual([255, 255, 255, 255]);
  });
});
