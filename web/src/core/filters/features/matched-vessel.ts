/**
 * The matched vessel filter of Chaudhuri et al. Catalog entry:
 * catalog/filters/features/matched-vessel.yaml.
 *
 * A vessel is modeled as a dark line with a Gaussian profile across it. For the vessel direction
 * phi, a pixel offset (x, y) has the coordinate u = x sin phi + y cos phi across the vessel and
 * v = x cos phi - y sin phi along it. The y axis points down, so phi turns counterclockwise on
 * screen. The kernel is -exp(-u^2 / (2 sigma^2)) on the offsets with |u| <= 3 sigma and
 * |v| <= L / 2, minus its mean over those offsets, and 0 elsewhere. The directions are spread
 * evenly over 180 degrees. The response is the largest correlation over the directions, and the
 * angle output is the direction where it is reached: the first one within 1e-9 times
 * max(1, |largest|) of the largest response, so ties do not depend on rounding.
 */
import { correlate2d, type Kernel2d } from "@/core/filters/convolve";
import { createPlane } from "@/core/filters/planes";
import { read, type KernelInfo, type Params, type PlaneFilter } from "@/core/filters/types";

/** The half width of the square that holds every kernel offset. */
export function vesselReach(sigma: number, length: number): number {
  return Math.ceil(Math.hypot(3 * sigma, length / 2));
}

/** The zero-mean kernel for one vessel direction in degrees. Bright vessels flip its sign. */
export function vesselKernel(
  sigma: number,
  length: number,
  angle: number,
  bright: boolean,
): Kernel2d {
  const r = vesselReach(sigma, length);
  const size = 2 * r + 1;
  const t = (angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const weights = new Float64Array(size * size);
  const inside: number[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = i - r;
      const y = j - r;
      const u = x * s + y * c;
      const v = x * c - y * s;
      if (Math.abs(u) <= 3 * sigma && Math.abs(v) <= length / 2) {
        weights[j * size + i] = -Math.exp(-(u * u) / (2 * sigma * sigma));
        inside.push(j * size + i);
      }
    }
  }
  const mean = inside.reduce((sum, k) => sum + (weights[k] ?? 0), 0) / inside.length;
  for (const k of inside) weights[k] = ((weights[k] ?? 0) - mean) * (bright ? -1 : 1);
  return { width: size, height: size, weights, anchorX: r, anchorY: r };
}

const sigmaOf = (params: Params) => read.number(params, "sigma", 2);
const lengthOf = (params: Params) => read.number(params, "length", 9);
const countOf = (params: Params) =>
  Math.max(1, Math.round(read.number(params, "orientations", 12)));
const brightOf = (params: Params) =>
  read.string<"dark" | "bright">(params, "polarity", "dark") === "bright";
const anglesOf = (params: Params) =>
  Array.from({ length: countOf(params) }, (_, k) => (k * 180) / countOf(params));

export const matchedVesselFilter: PlaneFilter = {
  id: "matched-vessel",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => vesselReach(sigmaOf(params), lengthOf(params)),
  plane: (input, params, { border }) => {
    const angles = anglesOf(params);
    const responses = angles.map((angle) =>
      correlate2d(
        input,
        vesselKernel(sigmaOf(params), lengthOf(params), angle, brightOf(params)),
        border,
      ),
    );
    const n = input.width * input.height;
    const largest = new Float64Array(n).fill(-Infinity);
    for (const r of responses) {
      for (let i = 0; i < n; i++) largest[i] = Math.max(largest[i] ?? 0, r.data[i] ?? 0);
    }
    const out = createPlane(input.width, input.height);
    if (read.string<"response" | "angle">(params, "output", "response") !== "angle") {
      out.data.set(largest);
      return out;
    }
    // Walk the directions backwards, so the first one near the largest response is written last.
    for (let k = responses.length - 1; k >= 0; k--) {
      const r = responses[k];
      if (!r) continue;
      for (let i = 0; i < n; i++) {
        const top = largest[i] ?? 0;
        if ((r.data[i] ?? 0) >= top - 1e-9 * Math.max(1, Math.abs(top))) {
          out.data[i] = angles[k] ?? 0;
        }
      }
    }
    return out;
  },
  representation: (params) => {
    const kernel = vesselKernel(sigmaOf(params), lengthOf(params), 0, brightOf(params));
    const rows = Array.from({ length: kernel.height }, (_, j) =>
      Array.from(kernel.weights.slice(j * kernel.width, (j + 1) * kernel.width)),
    );
    const info: KernelInfo = {
      name: "K_0",
      rows,
      anchor: { x: kernel.anchorX, y: kernel.anchorY },
      normalized: false,
      note: `The kernel for a horizontal vessel. The filter turns it to ${countOf(params)} directions, ${Number((180 / countOf(params)).toFixed(2))} degrees apart, and keeps the largest response.`,
    };
    return { kind: "kernels", kernels: [info] };
  },
};
