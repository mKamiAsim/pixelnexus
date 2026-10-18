/**
 * Zero crossings and the Marr-Hildreth edge detector. Catalog entries:
 * catalog/filters/edges/zero-crossing.yaml and marr-hildreth.yaml.
 *
 * The rule: a pixel p is marked when its value v(p) is below 0 and at least one of its four
 * neighbors q has v(q) above 0 with a jump v(q) - v(p) larger than the threshold. Marking only
 * the negative side gives edges one pixel thick. The zero-crossing filter reads the image as a
 * signed response with a chosen zero level, for example 128 for a result shown with the offset
 * mapping. Marr-Hildreth computes the Laplacian of Gaussian first and finds its zero crossings.
 *
 * Both extend the plane once by their full support with the border mode, run their steps on the
 * extended plane and cut the frame off, so strips and whole images agree.
 */
import { createPlane, cropPlane, padPlane, type Plane } from "@/core/filters/planes";
import { logFilter } from "@/core/filters/linear/dog-log";
import { gaussianRadius } from "@/core/filters/linear/gaussian";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

/** 255 where the rule marks a crossing, 0 elsewhere. Neighbors past the edge repeat the edge. */
export function zeroCrossings(values: Plane, threshold: number): Plane {
  const { width, height, data } = values;
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      if (!(v < 0)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const q = at(x + dx, y + dy);
        if (q > 0 && q - v > threshold) {
          out.data[y * width + x] = 255;
          break;
        }
      }
    }
  }
  return out;
}

const thresholdOf = (params: Params) => read.number(params, "threshold", 0);

export const zeroCrossingFilter: PlaneFilter = {
  id: "zero-crossing",
  kind: "derived",
  alphaWeighted: false,
  radius: () => 1,
  plane: (input, params, { border }) => {
    const level = read.number(params, "level", 128);
    const padded = padPlane(input, 1, border);
    const shifted = createPlane(padded.width, padded.height);
    for (let i = 0; i < shifted.data.length; i++) shifted.data[i] = (padded.data[i] ?? 0) - level;
    return cropPlane(zeroCrossings(shifted, thresholdOf(params)), 1);
  },
  representation: (params) => ({
    kind: "window",
    size: 3,
    count: 5,
    statistic: `v(p) < 0 < v(q),\\; v(q) - v(p) > ${thresholdOf(params)}`,
    note: `v is the value minus the zero level ${read.number(params, "level", 128)}. A pixel is marked when it is negative and one of its four neighbors q is positive with a jump above the threshold.`,
  }),
};

const sigmaOf = (params: Params) => read.number(params, "sigma", 2);

export const marrHildrethFilter: PlaneFilter = {
  id: "marr-hildreth",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => gaussianRadius(sigmaOf(params), 4) + 1,
  plane: (input, params, { border, originX, originY, channel }) => {
    const reach = gaussianRadius(sigmaOf(params), 4) + 1;
    const padded = padPlane(input, reach, border);
    const response = logFilter.plane(
      padded,
      { sigma: sigmaOf(params) },
      {
        border: "replicate",
        originX,
        originY,
        channel,
      },
    );
    return cropPlane(zeroCrossings(response, thresholdOf(params)), reach);
  },
  representation: (params) => ({
    kind: "window",
    size: 2 * (gaussianRadius(sigmaOf(params), 4) + 1) + 1,
    count: 0,
    statistic: `\\text{zero crossings of } \\nabla^2 (G_{${sigmaOf(params)}} * I)`,
    note: `The Laplacian of Gaussian with sigma ${sigmaOf(params)}, then the zero-crossing rule with threshold ${thresholdOf(params)}.`,
  }),
};
