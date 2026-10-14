/**
 * Demosaicing. Catalog entry: catalog/filters/enhancement/demosaic.yaml.
 *
 * The filter first simulates a Bayer color filter array: each pixel keeps only the channel that
 * the pattern puts at its image position. Then it estimates the two missing channels:
 *
 * - Bilinear: the mean of the nearest samples of the channel: the 4 axial neighbors for G, the 2
 *   nearest for R or B at a green pixel, and the 4 diagonal neighbors for R at B and B at R.
 * - Malvar, He and Cutler (2004): the bilinear estimate plus a scaled Laplacian of the channel
 *   known at the pixel, with alpha = 1/2, beta = 5/8 and gamma = 3/4. As 5 x 5 filters scaled by
 *   8, they are the eight filters shown in Getreuer's IPOL article on the method.
 *
 * Positions outside the plane follow the reflect 101 rule, which keeps the Bayer phase: the
 * pixel at -1 is a copy of the pixel at 1, which has the same color in the pattern. The phase
 * comes from the image position, so tiles agree with the whole image.
 */
import { borderIndex, createPlane, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params } from "@/core/filters/types";

export type Pattern = "rggb" | "bggr" | "grbg" | "gbrg";
type Method = "bilinear" | "malvar";
/** A filter tap: column offset, row offset and weight in eighths. */
type Tap = readonly [number, number, number];

const transpose = (taps: readonly Tap[]): Tap[] => taps.map(([dx, dy, w]) => [dy, dx, w]);

/** G at a red or blue pixel. */
const MALVAR_G: readonly Tap[] = [
  [0, -2, -1],
  [0, -1, 2],
  [-2, 0, -1],
  [-1, 0, 2],
  [0, 0, 4],
  [1, 0, 2],
  [2, 0, -1],
  [0, 1, 2],
  [0, 2, -1],
];
/** R or B at a green pixel whose nearest samples of that color are to the left and right. */
const MALVAR_ROW: readonly Tap[] = [
  [0, -2, 0.5],
  [-1, -1, -1],
  [1, -1, -1],
  [-2, 0, -1],
  [-1, 0, 4],
  [0, 0, 5],
  [1, 0, 4],
  [2, 0, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [0, 2, 0.5],
];
/** R at a blue pixel, or B at a red pixel. */
const MALVAR_CROSS: readonly Tap[] = [
  [0, -2, -1.5],
  [-1, -1, 2],
  [1, -1, 2],
  [-2, 0, -1.5],
  [0, 0, 6],
  [2, 0, -1.5],
  [-1, 1, 2],
  [1, 1, 2],
  [0, 2, -1.5],
];
const BILINEAR_G: readonly Tap[] = [
  [0, -1, 2],
  [-1, 0, 2],
  [1, 0, 2],
  [0, 1, 2],
];
const BILINEAR_ROW: readonly Tap[] = [
  [-1, 0, 4],
  [1, 0, 4],
];
const BILINEAR_CROSS: readonly Tap[] = [
  [-1, -1, 2],
  [1, -1, 2],
  [-1, 1, 2],
  [1, 1, 2],
];

export const DEMOSAIC_TAPS = {
  malvar: { g: MALVAR_G, row: MALVAR_ROW, column: transpose(MALVAR_ROW), cross: MALVAR_CROSS },
  bilinear: {
    g: BILINEAR_G,
    row: BILINEAR_ROW,
    column: transpose(BILINEAR_ROW),
    cross: BILINEAR_CROSS,
  },
} as const;

const CHANNEL = { r: 0, g: 1, b: 2 } as const;

/** The channel (0 red, 1 green, 2 blue) that the pattern puts at image position (x, y). */
export function cfaChannel(pattern: Pattern, x: number, y: number): number {
  const letter = pattern[(y & 1) * 2 + (x & 1)] as "r" | "g" | "b";
  return CHANNEL[letter];
}

const patternOf = (params: Params) => read.string<Pattern>(params, "pattern", "rggb");
const methodOf = (params: Params) => read.string<Method>(params, "method", "malvar");
const outputOf = (params: Params) => read.string<"image" | "mosaic">(params, "output", "image");

export const demosaicFilter: ColorFilter = {
  id: "demosaic",
  kind: "color",
  radius: (params) => (methodOf(params) === "malvar" ? 2 : 1),
  color: (planes, params, { originX, originY }) => {
    const { width, height } = planes[0];
    const pattern = patternOf(params);
    const channelAt = (x: number, y: number) => cfaChannel(pattern, originX + x, originY + y);
    const mosaic = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        mosaic[y * width + x] = planes[channelAt(x, y)]?.data[y * width + x] ?? 0;
      }
    }
    const out = [
      createPlane(width, height),
      createPlane(width, height),
      createPlane(width, height),
    ];
    if (outputOf(params) === "mosaic") {
      mosaic.forEach((v, i) => {
        const plane = out[channelAt(i % width, Math.floor(i / width))];
        if (plane) plane.data[i] = v;
      });
      return out as [Plane, Plane, Plane];
    }
    const taps = DEMOSAIC_TAPS[methodOf(params)];
    const apply = (list: readonly Tap[], x: number, y: number) => {
      let sum = 0;
      for (const [dx, dy, w] of list) {
        const sx = borderIndex(x + dx, width, "reflect101");
        const sy = borderIndex(y + dy, height, "reflect101");
        sum += w * (mosaic[sy * width + sx] ?? 0);
      }
      return sum / 8;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const own = channelAt(x, y);
        for (let c = 0; c < 3; c++) {
          let value: number;
          if (c === own) value = mosaic[i] ?? 0;
          else if (c === 1) value = apply(taps.g, x, y);
          else if (own !== 1) value = apply(taps.cross, x, y);
          else value = apply(channelAt(x + 1, y) === c ? taps.row : taps.column, x, y);
          const plane = out[c];
          if (plane) plane.data[i] = value;
        }
      }
    }
    return out as [Plane, Plane, Plane];
  },
  representation: (params) => {
    const malvar = methodOf(params) === "malvar";
    return {
      kind: "stages",
      stages: [
        {
          name: "Bayer mosaic",
          formula: `M(x, y) = I_{c(x, y)}(x, y),\\quad \\text{pattern } ${patternOf(params).toUpperCase()}`,
          note: "Each pixel keeps only the channel that the pattern puts there.",
        },
        malvar
          ? {
              name: "Malvar, He and Cutler",
              formula:
                "\\hat G = \\hat G^{bl} + \\tfrac{1}{2} \\Delta_R,\\quad \\hat R = \\hat R^{bl} + \\tfrac{5}{8} \\Delta_G \\text{ or } \\hat R^{bl} + \\tfrac{3}{4} \\Delta_B",
              note: "The bilinear estimate plus a Laplacian of the channel known at the pixel. Blue works like red.",
            }
          : {
              name: "Bilinear",
              formula:
                "\\hat G = \\tfrac{1}{4} \\sum_{\\text{4 axial}} G,\\quad \\hat R = \\tfrac{1}{2} \\sum_{\\text{2 nearest}} R \\text{ or } \\tfrac{1}{4} \\sum_{\\text{4 diagonal}} R",
              note: "The mean of the nearest samples of the missing channel. Blue works like red.",
            },
      ],
    };
  },
};
