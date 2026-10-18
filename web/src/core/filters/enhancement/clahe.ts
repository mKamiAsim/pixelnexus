/**
 * Adaptive histogram equalization (AHE) and contrast limited AHE (CLAHE). Catalog entries:
 * catalog/filters/enhancement/{ahe,clahe}.yaml.
 *
 * The steps follow cv::CLAHE of OpenCV for 8-bit images, so the results can be checked against
 * it:
 *
 * 1. The image is cut into a grid of tiles. When the size is not a multiple of the grid, it is
 *    extended at the right and bottom with the reflect 101 rule first. The grid is never finer
 *    than one pixel per tile.
 * 2. Each tile gets a histogram of its levels. With a clip limit c above 0, no bin may hold more
 *    than max(1, floor(c * tile pixels / 256)) pixels. The clipped pixels are spread over all
 *    bins: floor(clipped / 256) to each, and the remainder one at a time from bin 0 with a step
 *    of max(1, floor(256 / remainder)). A clip limit of 0 means no clipping, which is AHE.
 * 3. Each tile's curve is 255 / (tile pixels) times its cumulative histogram, rounded to whole
 *    levels in 32-bit floats as OpenCV does.
 * 4. Each pixel blends the curves of the four nearest tile centers bilinearly. Tile centers sit
 *    at (i + 0.5) times the tile size. Outside the outermost centers the nearest curve is used.
 *
 * Values are rounded to levels before they enter a histogram. A value between two levels takes
 * each curve interpolated between them.
 */
import { borderIndex, createPlane, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

/** Round half to even, as cvRound does. */
function roundEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - Math.trunc(v)) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export interface TileCurves {
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** tilesY x tilesX curves of 256 levels each, row by row. */
  readonly luts: Float64Array;
}

const level = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Clip a histogram and spread the clipped pixels, as OpenCV does. Changes it in place. */
export function clipHistogram(histogram: Int32Array | number[], limit: number): void {
  let clipped = 0;
  for (let i = 0; i < 256; i++) {
    const h = histogram[i] ?? 0;
    if (h > limit) {
      clipped += h - limit;
      histogram[i] = limit;
    }
  }
  const batch = Math.floor(clipped / 256);
  let residual = clipped - batch * 256;
  for (let i = 0; i < 256; i++) histogram[i] = (histogram[i] ?? 0) + batch;
  if (residual > 0) {
    const step = Math.max(Math.floor(256 / residual), 1);
    for (let i = 0; i < 256 && residual > 0; i += step, residual--) {
      histogram[i] = (histogram[i] ?? 0) + 1;
    }
  }
}

export function tileCurves(
  plane: Plane,
  gridX: number,
  gridY: number,
  clipLimit: number,
): TileCurves {
  const { width, height } = plane;
  const tilesX = Math.min(width, Math.max(1, Math.round(gridX)));
  const tilesY = Math.min(height, Math.max(1, Math.round(gridY)));
  const extWidth = width % tilesX === 0 ? width : width + tilesX - (width % tilesX);
  const extHeight = height % tilesY === 0 ? height : height + tilesY - (height % tilesY);
  const tileWidth = extWidth / tilesX;
  const tileHeight = extHeight / tilesY;
  const total = tileWidth * tileHeight;
  const limit = clipLimit > 0 ? Math.max(1, Math.floor((clipLimit * total) / 256)) : 0;
  const scale = Math.fround(255 / total);
  const luts = new Float64Array(tilesX * tilesY * 256);
  const histogram = new Int32Array(256);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      histogram.fill(0);
      for (let y = ty * tileHeight; y < (ty + 1) * tileHeight; y++) {
        const sy = borderIndex(y, height, "reflect101");
        for (let x = tx * tileWidth; x < (tx + 1) * tileWidth; x++) {
          const sx = borderIndex(x, width, "reflect101");
          const k = level(plane.data[sy * width + sx] ?? 0);
          histogram[k] = (histogram[k] ?? 0) + 1;
        }
      }
      if (limit > 0) clipHistogram(histogram, limit);
      const base = (ty * tilesX + tx) * 256;
      let sum = 0;
      for (let k = 0; k < 256; k++) {
        sum += histogram[k] ?? 0;
        luts[base + k] = Math.min(255, roundEven(Math.fround(sum * scale)));
      }
    }
  }
  return { tilesX, tilesY, tileWidth, tileHeight, luts };
}

/** The tiles and weights that a position blends, as in OpenCV. */
function blend(position: number, tileSize: number, tiles: number) {
  const f = position / tileSize - 0.5;
  const first = Math.floor(f);
  const weight = f - first;
  return { a: Math.max(first, 0), b: Math.min(first + 1, tiles - 1), weight };
}

const curveValue = (luts: Float64Array, tile: number, v: number) => {
  const c = Math.min(255, Math.max(0, v));
  const k = Math.floor(c);
  const low = luts[tile * 256 + k] ?? 0;
  return c > k ? low + (c - k) * ((luts[tile * 256 + k + 1] ?? low) - low) : low;
};

/** The curve that applies at pixel (x, y): the blend of the four nearest tile curves. */
export function curveAt(curves: TileCurves, x: number, y: number): Float64Array {
  const bx = blend(x, curves.tileWidth, curves.tilesX);
  const by = blend(y, curves.tileHeight, curves.tilesY);
  const t = (ty: number, tx: number) => ty * curves.tilesX + tx;
  return Float64Array.from({ length: 256 }, (_, v) => {
    const top =
      curveValue(curves.luts, t(by.a, bx.a), v) * (1 - bx.weight) +
      curveValue(curves.luts, t(by.a, bx.b), v) * bx.weight;
    const bottom =
      curveValue(curves.luts, t(by.b, bx.a), v) * (1 - bx.weight) +
      curveValue(curves.luts, t(by.b, bx.b), v) * bx.weight;
    return top * (1 - by.weight) + bottom * by.weight;
  });
}

export function applyCurves(plane: Plane, curves: TileCurves): Plane {
  const out = createPlane(plane.width, plane.height);
  const t = (ty: number, tx: number) => ty * curves.tilesX + tx;
  const columns = Array.from({ length: plane.width }, (_, x) =>
    blend(x, curves.tileWidth, curves.tilesX),
  );
  for (let y = 0; y < plane.height; y++) {
    const by = blend(y, curves.tileHeight, curves.tilesY);
    for (let x = 0; x < plane.width; x++) {
      const bx = columns[x] ?? { a: 0, b: 0, weight: 0 };
      const v = plane.data[y * plane.width + x] ?? 0;
      const top =
        curveValue(curves.luts, t(by.a, bx.a), v) * (1 - bx.weight) +
        curveValue(curves.luts, t(by.a, bx.b), v) * bx.weight;
      const bottom =
        curveValue(curves.luts, t(by.b, bx.a), v) * (1 - bx.weight) +
        curveValue(curves.luts, t(by.b, bx.b), v) * bx.weight;
      out.data[y * plane.width + x] = top * (1 - by.weight) + bottom * by.weight;
    }
  }
  return out;
}

const gridOf = (params: Params) =>
  [read.number(params, "tilesX", 8), read.number(params, "tilesY", 8)] as const;

function stages(params: Params, clipped: boolean): Representation {
  const [gx, gy] = gridOf(params);
  const clip = read.number(params, "clipLimit", 2);
  return {
    kind: "stages",
    stages: [
      {
        name: "Tiles",
        formula: `${gx} \\times ${gy}\\ \\text{tiles},\\quad h^{(t)}_k = \\#\\{\\text{pixels of tile } t \\text{ at level } k\\}`,
      },
      ...(clipped
        ? [
            {
              name: "Clip",
              formula: `\\beta = \\max\\left(1, \\left\\lfloor ${clip} \\cdot \\frac{M}{256} \\right\\rfloor\\right),\\quad h_k \\leftarrow \\min(h_k, \\beta) + \\text{share of the excess}`,
              note: "M is the number of pixels in a tile. The clipped pixels are spread over all bins.",
            },
          ]
        : []),
      {
        name: "Tile curves",
        formula:
          "T^{(t)}(k) = \\operatorname{round}\\left(\\frac{255}{M} \\sum_{j=0}^{k} h^{(t)}_j\\right)",
      },
      {
        name: "Blend",
        formula: "I_{\\text{out}} = \\sum_{t \\in \\text{4 nearest}} w_t(x, y)\\, T^{(t)}(I)",
        note: "Bilinear weights from the distances to the four nearest tile centers.",
      },
    ],
    note: "The curves depend on the image. The Point-op curve in the Learn panel draws the curve at the probe.",
  };
}

function claheLike(clipped: boolean) {
  const clipOf = (params: Params) => (clipped ? read.number(params, "clipLimit", 2) : 0);
  const curvesOf = (plane: Plane, params: Params) =>
    tileCurves(plane, ...gridOf(params), clipOf(params));
  return {
    kind: "smooth" as const,
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input: Plane, params: Params) => applyCurves(input, curvesOf(input, params)),
    pointTableAt: (params: Params, plane: Plane, x: number, y: number) =>
      curveAt(curvesOf(plane, params), x, y),
    representation: (params: Params) => stages(params, clipped),
  };
}

export const claheFilter: PlaneFilter = { id: "clahe", ...claheLike(true) };
export const aheFilter: PlaneFilter = { id: "ahe", ...claheLike(false) };
