/**
 * Kuwahara and Nagao-Matsuyama filters. Catalog entries: catalog/filters/nonlinear/kuwahara.yaml
 * and nagao-matsuyama.yaml.
 *
 * Both split the window around a pixel into overlapping subregions, find the one whose values
 * vary the least, and write its mean. An edge falls between subregions, so the calmest one lies
 * on one side of it, and the edge stays sharp.
 *
 * For color images the variance is measured on luma, Y' = 0.2126 R + 0.7152 G + 0.0722 B, and all
 * three channels take their means from the same subregion. That keeps colors from mixing. For a
 * gray image this is the classic filter. On a tie, the first subregion in the list wins.
 */
import { borderTable, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params, type Representation } from "@/core/filters/types";

/** A subregion as offsets (dx, dy) from the center pixel. */
export type Subregion = readonly (readonly [number, number])[];

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** The four (a + 1) x (a + 1) quadrants of a (2a + 1) window, each holding the center pixel. */
export function kuwaharaRegions(a: number): Subregion[] {
  const square = (x0: number, y0: number) => {
    const cells: [number, number][] = [];
    for (let dy = y0; dy <= y0 + a; dy++)
      for (let dx = x0; dx <= x0 + a; dx++) cells.push([dx, dy]);
    return cells;
  };
  return [square(-a, -a), square(0, -a), square(-a, 0), square(0, 0)];
}

/**
 * The nine subregions of Nagao and Matsuyama in a 5x5 window: the center 3x3 square, four
 * pentagons toward north, east, south and west, and four hexagons toward the corners. The
 * pentagons and hexagons hold 7 pixels each, including the center.
 */
export function nagaoRegions(): Subregion[] {
  const center: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) center.push([dx, dy]);
  const north: [number, number][] = [
    [-1, -2],
    [0, -2],
    [1, -2],
    [-1, -1],
    [0, -1],
    [1, -1],
    [0, 0],
  ];
  const northWest: [number, number][] = [
    [-2, -2],
    [-1, -2],
    [-2, -1],
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ];
  // Turn a region by 90 degrees clockwise: (dx, dy) -> (-dy, dx).
  const turn = (region: [number, number][]) =>
    region.map(([dx, dy]) => [-dy, dx] as [number, number]);
  const east = turn(north);
  const south = turn(east);
  const west = turn(south);
  const northEast = turn(northWest);
  const southEast = turn(northEast);
  const southWest = turn(southEast);
  return [center, north, east, south, west, northWest, northEast, southEast, southWest];
}

/** Run the calmest-subregion rule on three color planes. */
export function subregionFilter(
  planes: readonly [Plane, Plane, Plane],
  regions: readonly Subregion[],
  radius: number,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { width, height } = planes[0];
  const xs = borderTable(width, radius, border);
  const ys = borderTable(height, radius, border);
  const at = (plane: Plane, x: number, y: number) => {
    const sx = xs[x + radius] ?? -1;
    const sy = ys[y + radius] ?? -1;
    return sx < 0 || sy < 0 ? 0 : (plane.data[sy * width + sx] ?? 0);
  };
  const out = [createPlane(width, height), createPlane(width, height), createPlane(width, height)];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = -1;
      let bestVariance = Infinity;
      for (let k = 0; k < regions.length; k++) {
        const region = regions[k] ?? [];
        let sum = 0;
        let squares = 0;
        for (const [dx, dy] of region) {
          const r = at(planes[0], x + dx, y + dy);
          const g = at(planes[1], x + dx, y + dy);
          const b = at(planes[2], x + dx, y + dy);
          const luma = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
          sum += luma;
          squares += luma * luma;
        }
        const n = region.length;
        const variance = squares / n - (sum / n) ** 2;
        // A small margin keeps float noise from deciding between equal variances.
        if (variance < bestVariance - 1e-9) {
          bestVariance = variance;
          best = k;
        }
      }
      const region = regions[best] ?? [];
      out.forEach((plane, c) => {
        let sum = 0;
        for (const [dx, dy] of region) sum += at(planes[c] as Plane, x + dx, y + dy);
        plane.data[y * width + x] = sum / region.length;
      });
    }
  }
  return out as [Plane, Plane, Plane];
}

const sizeOf = (params: Params) => read.number(params, "size", 5);

const regionsNote = (regions: readonly Subregion[], what: string): Representation => {
  const reach = Math.max(...regions.flat().map(([dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy))));
  const size = 2 * reach + 1;
  return {
    kind: "window",
    size,
    count: size * size,
    statistic: "\\bar{I}_{k^*},\\quad k^* = \\operatorname*{arg\\,min}_k \\sigma^2_k",
    note: `${what} The subregion whose luma varies the least gives its mean, in every channel.`,
  };
};

export const kuwaharaFilter: ColorFilter = {
  id: "kuwahara",
  kind: "color",
  radius: (params) => (sizeOf(params) - 1) >> 1,
  color: (planes, params, { border }) => {
    const a = (sizeOf(params) - 1) >> 1;
    return subregionFilter(planes, kuwaharaRegions(a), a, border);
  },
  representation: (params) => {
    const a = (sizeOf(params) - 1) >> 1;
    return regionsNote(
      kuwaharaRegions(a),
      `The ${2 * a + 1}x${2 * a + 1} window is split into four ${a + 1}x${a + 1} quadrants that share the center pixel.`,
    );
  },
};

export const nagaoMatsuyamaFilter: ColorFilter = {
  id: "nagao-matsuyama",
  kind: "color",
  radius: () => 2,
  color: (planes, _params, { border }) => subregionFilter(planes, nagaoRegions(), 2, border),
  representation: () =>
    regionsNote(
      nagaoRegions(),
      "The 5x5 window holds nine subregions: the center 3x3 square, four pentagons and four hexagons of 7 pixels.",
    ),
};
