/**
 * Viewport maths for the canvas. Pure functions, so they are easy to test.
 *
 * Coordinates: a screen point (sx, sy) in CSS pixels relative to the viewport's top left maps to
 * the image point (x, y) by  sx = x * zoom + panX  and  sy = y * zoom + panY.
 * Image coordinates are continuous. Pixel (i, j) covers the square from (i, j) to (i + 1, j + 1).
 */

export interface ViewState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;

/** Zoom steps as in Photoshop, from 1% to 6400%. */
export const ZOOM_STEPS: readonly number[] = [
  0.01,
  0.02,
  0.03,
  0.04,
  0.05,
  0.0625,
  1 / 12,
  0.125,
  1 / 6,
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  12,
  16,
  32,
  64,
];

/** The pixel grid appears from this zoom up. */
export const PIXEL_GRID_ZOOM = 8;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The largest zoom that shows the whole image with a margin. Small images are not enlarged. */
export function fitZoom(image: Size, view: Size, margin = 24, allowEnlarge = false): number {
  const zoom = Math.min(
    (view.width - 2 * margin) / image.width,
    (view.height - 2 * margin) / image.height,
  );
  return clampZoom(allowEnlarge ? zoom : Math.min(1, zoom));
}

/** The smallest zoom at which the image covers the whole view. */
export function fillZoom(image: Size, view: Size): number {
  return clampZoom(Math.max(view.width / image.width, view.height / image.height));
}

/** A view that centers the image at the given zoom. */
export function centeredView(image: Size, view: Size, zoom: number): ViewState {
  const z = clampZoom(zoom);
  return {
    zoom: z,
    panX: (view.width - image.width * z) / 2,
    panY: (view.height - image.height * z) / 2,
  };
}

export function fitView(image: Size, view: Size): ViewState {
  return centeredView(image, view, fitZoom(image, view));
}

export function screenToImage(state: ViewState, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
}

export function imageToScreen(state: ViewState, x: number, y: number): { sx: number; sy: number } {
  return { sx: x * state.zoom + state.panX, sy: y * state.zoom + state.panY };
}

/** The pixel under a screen point, or null when the point is outside the image. */
export function pixelAt(
  state: ViewState,
  image: Size,
  sx: number,
  sy: number,
): { x: number; y: number } | null {
  const { x, y } = screenToImage(state, sx, sy);
  const px = Math.floor(x);
  const py = Math.floor(y);
  return px >= 0 && py >= 0 && px < image.width && py < image.height ? { x: px, y: py } : null;
}

/** Change the zoom while the image point under (sx, sy) stays under the cursor. */
export function zoomAt(state: ViewState, zoom: number, sx: number, sy: number): ViewState {
  const z = clampZoom(zoom);
  const { x, y } = screenToImage(state, sx, sy);
  return { zoom: z, panX: sx - x * z, panY: sy - y * z };
}

/** The next zoom step in or out. Values between steps snap to the neighbor in that direction. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const epsilon = 1e-9;
  if (direction > 0) return ZOOM_STEPS.find((step) => step > zoom + epsilon) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - epsilon) ?? MIN_ZOOM;
}

export function panBy(state: ViewState, dx: number, dy: number): ViewState {
  return { ...state, panX: state.panX + dx, panY: state.panY + dy };
}

/** Keep at least `keep` screen pixels of the image inside the view, so it cannot be lost. */
export function clampPan(state: ViewState, image: Size, view: Size, keep = 48): ViewState {
  const w = image.width * state.zoom;
  const h = image.height * state.zoom;
  const kx = Math.min(keep, w);
  const ky = Math.min(keep, h);
  return {
    ...state,
    panX: Math.min(view.width - kx, Math.max(kx - w, state.panX)),
    panY: Math.min(view.height - ky, Math.max(ky - h, state.panY)),
  };
}

export function showPixelGrid(zoom: number): boolean {
  return zoom >= PIXEL_GRID_ZOOM;
}

/** Zoom as a percentage label, for example "66.7%" or "800%". */
export function formatZoom(zoom: number): string {
  const percent = zoom * 100;
  return `${Number.isInteger(Math.round(percent * 10) / 10) ? Math.round(percent) : percent.toFixed(1)}%`;
}

/** Ruler steps for labeled ticks, in image pixels. Labels stay MIN_LABEL_GAP screen pixels apart. */
const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MIN_LABEL_GAP = 56;

/** The labeled tick step and the minor tick step of a ruler at a zoom level. */
export function rulerSteps(zoom: number): { major: number; minor: number } {
  const major = RULER_STEPS.find((step) => step * zoom >= MIN_LABEL_GAP) ?? RULER_STEPS.at(-1) ?? 1;
  const minor = major % 5 === 0 ? major / 5 : major / 2;
  return { major, minor: Math.max(1, minor) };
}
