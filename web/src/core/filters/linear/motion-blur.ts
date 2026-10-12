/**
 * Motion blur. Catalog entry: catalog/filters/linear/motion-blur.yaml.
 *
 * The kernel is a straight line segment of length L through the kernel center, at angle theta.
 * The weight of each kernel cell is the length of the segment inside that cell's square,
 * divided by L. So the weights add up to 1, and a slanted line gets smooth, anti-aliased weights.
 * This is an exact computation of that definition.
 */
import { correlate2d, kernelRows, type Kernel2d } from "@/core/filters/convolve";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

const lengthOf = (params: Params) => read.number(params, "length", 9);
const angleOf = (params: Params) => read.number(params, "angle", 0);

/** Direction of the line. Angles turn counterclockwise on screen, where y points down. */
function direction(angleDeg: number): [number, number] {
  const theta = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(theta);
  const dy = -Math.sin(theta);
  // Remove floating-point dust such as cos(90 degrees) = 6e-17, so lines stay exactly straight.
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return [clean(dx), clean(dy)];
}

/** Half the kernel width: the smallest radius whose cells contain the whole segment. */
export function motionRadius(length: number, angleDeg: number): number {
  const [dx, dy] = direction(angleDeg);
  const reach = (length / 2) * Math.max(Math.abs(dx), Math.abs(dy));
  return Math.max(0, Math.ceil(reach - 0.5));
}

/**
 * Length of the segment c + t * d, t in [t0, t1], inside the box [lo, hi] on both axes.
 * Liang-Barsky clipping. d has unit length, so the length is the t range.
 */
function clippedLength(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  t0: number,
  t1: number,
  box: { x0: number; x1: number; y0: number; y1: number },
): number {
  let lo = t0;
  let hi = t1;
  for (const [c, d, a, b] of [
    [cx, dx, box.x0, box.x1],
    [cy, dy, box.y0, box.y1],
  ] as const) {
    if (d === 0) {
      if (c < a || c > b) return 0;
      continue;
    }
    const ta = (a - c) / d;
    const tb = (b - c) / d;
    lo = Math.max(lo, Math.min(ta, tb));
    hi = Math.min(hi, Math.max(ta, tb));
  }
  return Math.max(0, hi - lo);
}

/** The motion blur kernel: cell weights proportional to the line length inside each cell. */
export function motionKernel(length: number, angleDeg: number): Kernel2d {
  const radius = motionRadius(length, angleDeg);
  const size = 2 * radius + 1;
  const [dx, dy] = direction(angleDeg);
  const weights = new Float64Array(size * size);
  let total = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = i - radius;
      const y = j - radius;
      const inside = clippedLength(0, 0, dx, dy, -length / 2, length / 2, {
        x0: x - 0.5,
        x1: x + 0.5,
        y0: y - 0.5,
        y1: y + 0.5,
      });
      weights[j * size + i] = inside;
      total += inside;
    }
  }
  // total equals the length, up to rounding. Dividing by total makes the sum exactly 1.
  for (let k = 0; k < weights.length; k++) weights[k] = (weights[k] ?? 0) / total;
  return { width: size, height: size, weights, anchorX: radius, anchorY: radius };
}

export const motionBlurFilter: PlaneFilter = {
  id: "motion-blur",
  kind: "smooth",
  alphaWeighted: true,
  radius: (params) => motionRadius(lengthOf(params), angleOf(params)),
  plane: (input, params, context) =>
    correlate2d(input, motionKernel(lengthOf(params), angleOf(params)), context.border),
  representation: (params) => {
    const kernel = motionKernel(lengthOf(params), angleOf(params));
    return {
      kind: "kernels",
      kernels: [
        {
          name: "M",
          rows: kernelRows(kernel),
          anchor: { x: kernel.anchorX, y: kernel.anchorY },
          normalized: true,
        },
      ],
    };
  },
};
