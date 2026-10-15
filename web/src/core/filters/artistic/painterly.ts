/**
 * Oil painting, pencil sketch, cartoon and halftone. Catalog entries:
 * catalog/filters/artistic/{oil-painting,pencil-sketch,cartoon,halftone}.yaml.
 *
 * - Oil painting: in the window around each pixel, the luma values fall into `levels` equal
 *   bins. The most common bin wins (ties go to the darker bin), and the output is the mean color
 *   of the window pixels in that bin. OpenCV's xphoto module cites Holzmann (1988) for this
 *   effect. OpenCV leaves pixels outside the image out of the window and quantizes the result;
 *   here the window follows the border mode and nothing is quantized.
 * - Pencil sketch: the luma blended with its own blurred negative by color dodge, the blend mode
 *   of the W3C Compositing and Blending spec. Edges stay dark lines, flat areas turn white. This
 *   recipe is PixelNexus's own.
 * - Cartoon: colors smoothed by repeated bilateral filtering in color mode, and black lines where
 *   the 5 x 5 median of the luma, rounded to whole levels as the median filter does, is darker
 *   than its local mean by more than an offset. This recipe is PixelNexus's own.
 * - Halftone: a screen of cells, turned by an angle. Each cell holds a round dot whose area inside
 *   the cell equals the cell's darkness: the box mean of the cell, read at the cell center. The
 *   dot edge is drawn with one pixel of anti-aliasing. These rules are PixelNexus's own.
 */
import { boxMean } from "@/core/filters/convolve";
import { gaussianPlane, gaussianRadius } from "@/core/filters/linear/gaussian";
import { bilateralPlanes, bilateralRadius, lumaPlane } from "@/core/filters/nonlinear/bilateral";
import { medianPlane } from "@/core/filters/nonlinear/median";
import {
  borderIndex,
  createPlane,
  rgbToYcc,
  yccToRgb,
  type BorderMode,
  type Plane,
} from "@/core/filters/planes";
import { read, type ColorFilter, type Params, type PlaneFilter } from "@/core/filters/types";

type Planes = readonly [Plane, Plane, Plane];

// Oil painting --------------------------------------------------------------------------------

const oilRadiusOf = (params: Params) => read.number(params, "radius", 3);
const oilLevelsOf = (params: Params) => read.number(params, "levels", 20);

export function oilPaint(planes: Planes, radius: number, levels: number, border: BorderMode) {
  const [rp, gp, bp] = planes;
  const { width, height } = rp;
  const luma = lumaPlane(planes);
  const bins = luma.data.map((v) =>
    Math.min(levels - 1, Math.max(0, Math.floor((v * levels) / 256))),
  );
  const out = [
    createPlane(width, height),
    createPlane(width, height),
    createPlane(width, height),
  ] as [Plane, Plane, Plane];
  const count = new Float64Array(levels);
  const sums = new Float64Array(levels * 3);
  const index = (x: number, y: number) => {
    const sx = borderIndex(x, width, border);
    const sy = borderIndex(y, height, border);
    return sx < 0 || sy < 0 ? -1 : sy * width + sx;
  };
  const column = (x: number, y: number, sign: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      const i = index(x, y + dy);
      // The constant border fills with 0, which is black in bin 0.
      const bin = i < 0 ? 0 : (bins[i] ?? 0);
      count[bin] = (count[bin] ?? 0) + sign;
      if (i >= 0) {
        sums[3 * bin] = (sums[3 * bin] ?? 0) + sign * (rp.data[i] ?? 0);
        sums[3 * bin + 1] = (sums[3 * bin + 1] ?? 0) + sign * (gp.data[i] ?? 0);
        sums[3 * bin + 2] = (sums[3 * bin + 2] ?? 0) + sign * (bp.data[i] ?? 0);
      }
    }
  };
  for (let y = 0; y < height; y++) {
    count.fill(0);
    sums.fill(0);
    for (let x = -radius; x <= radius; x++) column(x, y, 1);
    for (let x = 0; x < width; x++) {
      if (x > 0) {
        column(x - radius - 1, y, -1);
        column(x + radius, y, 1);
      }
      let best = 0;
      for (let k = 1; k < levels; k++) if ((count[k] ?? 0) > (count[best] ?? 0)) best = k;
      const n = count[best] ?? 1;
      for (let c = 0; c < 3; c++) out[c].data[y * width + x] = (sums[3 * best + c] ?? 0) / n;
    }
  }
  return out;
}

export const oilPaintingFilter: ColorFilter = {
  id: "oil-painting",
  kind: "color",
  radius: oilRadiusOf,
  color: (planes, params, { border }) =>
    oilPaint(planes, oilRadiusOf(params), oilLevelsOf(params), border),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Bins",
        formula: `b = \\left\\lfloor \\frac{${oilLevelsOf(params)}\\, Y}{256} \\right\\rfloor,\\quad Y = 0.2126 R + 0.7152 G + 0.0722 B`,
      },
      {
        name: "Most common bin",
        formula: `b^* = \\arg\\max_b \\#\\{q \\in W : b(q) = b\\},\\quad W:\\ ${2 * oilRadiusOf(params) + 1} \\times ${2 * oilRadiusOf(params) + 1}`,
        note: "Ties go to the darker bin.",
      },
      { name: "Output", formula: "C' = \\operatorname{mean}\\{C(q) : q \\in W,\\ b(q) = b^*\\}" },
    ],
  }),
};

// Pencil sketch --------------------------------------------------------------------------------

/** Color dodge of the W3C Compositing and Blending spec, on values from 0 to 1. */
export function colorDodge(backdrop: number, source: number): number {
  if (backdrop <= 0) return 0;
  if (source >= 1) return 1;
  return Math.min(1, backdrop / (1 - source));
}

const sketchSigmaOf = (params: Params) => read.number(params, "sigma", 8);

export function sketchPlane(luma: Plane, sigma: number, border: BorderMode): Plane {
  const negative = { ...luma, data: luma.data.map((v) => 255 - v) };
  const blurred = gaussianPlane(negative, sigma, 3, border);
  const out = createPlane(luma.width, luma.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = 255 * colorDodge((luma.data[i] ?? 0) / 255, (blurred.data[i] ?? 0) / 255);
  }
  return out;
}

export const pencilSketchFilter: ColorFilter = {
  id: "pencil-sketch",
  kind: "color",
  radius: (params) => gaussianRadius(sketchSigmaOf(params), 3),
  color: (planes, params, { border }) => {
    const sketch = sketchPlane(lumaPlane(planes), sketchSigmaOf(params), border);
    if (!read.boolean(params, "colored", false))
      return [
        sketch,
        { ...sketch, data: sketch.data.slice() },
        { ...sketch, data: sketch.data.slice() },
      ];
    const [, cb, cr] = rgbToYcc(planes[0], planes[1], planes[2]);
    return yccToRgb(sketch, cb, cr);
  },
  representation: (params) => ({
    kind: "stages",
    stages: [
      { name: "Negative", formula: "N = 255 - Y" },
      { name: "Blur", formula: `B = G_{${sketchSigmaOf(params)}} * N` },
      {
        name: "Color dodge",
        formula: "S = 255 \\min\\left(1, \\frac{Y / 255}{1 - B / 255}\\right)",
        note: "S is 0 where Y is 0, and 255 where B is 255.",
      },
    ],
  }),
};

// Cartoon --------------------------------------------------------------------------------------

const cartoonOf = (params: Params) => ({
  sigmaSpace: read.number(params, "sigmaSpace", 3),
  sigmaRange: read.number(params, "sigmaRange", 40),
  passes: Math.max(1, Math.round(read.number(params, "passes", 2))),
  lineSize: read.number(params, "lineSize", 9),
  lineOffset: read.number(params, "lineOffset", 4),
});

/** The line mask: 1 where the 5 x 5 median of the luma is darker than its mean by the offset. */
export function cartoonLines(planes: Planes, size: number, offset: number, border: BorderMode) {
  const median = medianPlane(lumaPlane(planes), 5, border);
  const mean = boxMean(median, size, border);
  return median.data.map((v, i) => (v < (mean.data[i] ?? 0) - offset ? 1 : 0));
}

export const cartoonFilter: ColorFilter = {
  id: "cartoon",
  kind: "color",
  radius: (params) => {
    const s = cartoonOf(params);
    return Math.max(s.passes * bilateralRadius(s.sigmaSpace), 2 + ((s.lineSize - 1) >> 1));
  },
  color: (planes, params, { border }) => {
    const s = cartoonOf(params);
    let smooth: [Plane, Plane, Plane] = [planes[0], planes[1], planes[2]];
    for (let k = 0; k < s.passes; k++) {
      smooth = bilateralPlanes(smooth, smooth, "color", s.sigmaSpace, s.sigmaRange, border);
    }
    const lines = cartoonLines(planes, s.lineSize, s.lineOffset, border);
    for (const p of smooth) p.data.forEach((_, i) => lines[i] && (p.data[i] = 0));
    return smooth;
  },
  representation: (params) => {
    const s = cartoonOf(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Smooth colors",
          formula: `\\text{bilateral}^{${s.passes}},\\quad \\sigma_s = ${s.sigmaSpace},\\ \\sigma_r = ${s.sigmaRange}`,
          note: "Each pass is the bilateral filter in color mode.",
        },
        {
          name: "Lines",
          formula: `L = \\left[\\operatorname{med}_{5}(Y) < \\operatorname{mean}_{${s.lineSize}}\\left(\\operatorname{med}_{5}(Y)\\right) - ${s.lineOffset}\\right]`,
        },
        {
          name: "Combine",
          formula:
            "C' = \\begin{cases} 0 & L \\\\ \\text{smoothed } C & \\text{otherwise} \\end{cases}",
        },
      ],
    };
  },
};

// Halftone -------------------------------------------------------------------------------------

/** The area of a circle of radius r, centered in a unit square, that lies inside the square. */
export function circleInSquare(r: number): number {
  const h = 0.5;
  if (r <= h) return Math.PI * r * r;
  if (r >= Math.SQRT1_2) return 1;
  const segment = r * r * Math.acos(h / r) - h * Math.sqrt(r * r - h * h);
  return Math.PI * r * r - 4 * segment;
}

/** The dot radius, in cells, whose area inside the cell is the given ink fraction. */
export function dotRadius(ink: number): number {
  if (ink <= 0) return 0;
  if (ink >= 1) return Math.SQRT1_2;
  let lo = 0;
  let hi = Math.SQRT1_2;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (circleInSquare(mid) < ink) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const cellOf = (params: Params) => read.number(params, "cell", 8);
const screenAngleOf = (params: Params) => read.number(params, "angle", 45);

/** Bilinear read of a plane at (x, y), with positions clamped to the plane. */
function bilinear(p: Plane, x: number, y: number): number {
  const cx = Math.min(p.width - 1, Math.max(0, x));
  const cy = Math.min(p.height - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(p.width - 1, x0 + 1);
  const y1 = Math.min(p.height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const at = (xx: number, yy: number) => p.data[yy * p.width + xx] ?? 0;
  return (
    (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) +
    (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy
  );
}

export function halftonePlane(
  input: Plane,
  cell: number,
  angle: number,
  border: BorderMode,
): Plane {
  const theta = (angle * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const box = boxMean(input, 2 * Math.floor(cell / 2) + 1, border);
  const out = createPlane(input.width, input.height);
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Screen coordinates, turned by the angle, and the center of the cell.
      const u = cos * px + sin * py;
      const v = -sin * px + cos * py;
      const uc = (Math.floor(u / cell) + 0.5) * cell;
      const vc = (Math.floor(v / cell) + 0.5) * cell;
      const cx = cos * uc - sin * vc;
      const cy = sin * uc + cos * vc;
      const ink = 1 - Math.min(255, Math.max(0, bilinear(box, cx - 0.5, cy - 0.5))) / 255;
      const radius = dotRadius(ink) * cell;
      const coverage = Math.min(1, Math.max(0, radius - Math.hypot(u - uc, v - vc) + 0.5));
      out.data[y * input.width + x] = 255 * (1 - coverage);
    }
  }
  return out;
}

export const halftoneFilter: PlaneFilter = {
  id: "halftone",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    halftonePlane(input, cellOf(params), screenAngleOf(params), border),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Screen",
        formula: `\\text{cells of } ${cellOf(params)} \\text{ px, turned by } ${screenAngleOf(params)}^{\\circ}`,
      },
      {
        name: "Darkness of a cell",
        formula: "a = 1 - \\frac{\\bar I(\\text{cell center})}{255}",
        note: "The box mean of the cell's size, read at the cell center.",
      },
      {
        name: "Dot",
        formula:
          "\\operatorname{area}\\left(\\text{disk}(\\rho) \\cap \\text{cell}\\right) = a \\cdot \\text{cell}^2",
        note: "The dot is black on white, with one pixel of anti-aliasing at its edge.",
      },
    ],
  }),
};
