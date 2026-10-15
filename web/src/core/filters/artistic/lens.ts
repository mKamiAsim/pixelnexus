/**
 * Bloom, bokeh and tilt-shift. Catalog entries:
 * catalog/filters/artistic/{bloom,bokeh,tilt-shift}.yaml. The rules are PixelNexus's own, and
 * the first two work in linear light, as light adds up.
 *
 * - Bloom: the bright part of each pixel, its linear color times s = clamp((Y - t) / (1 - t)),
 *   is blurred with a Gaussian and added back with a strength.
 * - Bokeh: highlights are scaled up by 1 + b s(Y), with s the smoothstep of
 *   (Y - t) / (1 - t), as if they had been clipped, then the image is blurred with a disk, the
 *   shape of an out-of-focus lens. Bright points spread into bright disks.
 * - Tilt-shift: a horizontal band stays sharp, and the blur sigma grows with the distance from
 *   it along a smoothstep, up to a largest sigma. The image is blurred at nine sigmas from 0 to
 *   the largest, and each row blends the two nearest ones.
 */
import { linearToSrgb, srgbToLinear } from "@/core/color/convert";
import { correlate2d, kernelFromRows } from "@/core/filters/convolve";
import { diskKernel, diskRadius } from "@/core/filters/linear/disk-average";
import { gaussianPlane, gaussianRadius } from "@/core/filters/linear/gaussian";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type ColorFilter, type Params, type PlaneFilter } from "@/core/filters/types";

type Planes = readonly [Plane, Plane, Plane];

const linear = (p: Plane): Plane => ({ ...p, data: p.data.map((v) => srgbToLinear(v)) });
const luminance = (lin: Planes) =>
  lin[0].data.map(
    (r, i) => 0.2126 * r + 0.7152 * (lin[1].data[i] ?? 0) + 0.0722 * (lin[2].data[i] ?? 0),
  );
const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// Bloom ----------------------------------------------------------------------------------------

const bloomOf = (params: Params) => ({
  threshold: read.number(params, "threshold", 70) / 100,
  sigma: read.number(params, "sigma", 12),
  strength: read.number(params, "strength", 80) / 100,
});

export function bloomPlanes(
  planes: Planes,
  params: Params,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { threshold, sigma, strength } = bloomOf(params);
  const lin = planes.map(linear) as unknown as Planes;
  const y = luminance(lin);
  const share = y.map((v) =>
    threshold >= 1 ? 0 : Math.min(1, Math.max(0, (v - threshold) / (1 - threshold))),
  );
  return lin.map((p) => {
    const bright = { ...p, data: p.data.map((v, i) => v * (share[i] ?? 0)) };
    const glow = gaussianPlane(bright, sigma, 3, border);
    return { ...p, data: p.data.map((v, i) => linearToSrgb(v + strength * (glow.data[i] ?? 0))) };
  }) as [Plane, Plane, Plane];
}

export const bloomFilter: ColorFilter = {
  id: "bloom",
  kind: "color",
  radius: (params) => gaussianRadius(bloomOf(params).sigma, 3),
  color: (planes, params, { border }) => bloomPlanes(planes, params, border),
  representation: (params) => {
    const b = bloomOf(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Bright part",
          formula: `B_c = c \\cdot \\operatorname{clamp}\\left(\\frac{Y - ${b.threshold}}{1 - ${b.threshold}}\\right)`,
          note: "c is a linear channel and Y the linear luminance.",
        },
        { name: "Glow", formula: `G_c = G_{${b.sigma}} * B_c` },
        { name: "Add", formula: `c' = c + ${b.strength}\\, G_c` },
      ],
    };
  },
};

// Bokeh ----------------------------------------------------------------------------------------

const bokehOf = (params: Params) => ({
  radius: read.number(params, "radius", 8),
  threshold: read.number(params, "threshold", 75) / 100,
  boost: read.number(params, "boost", 4),
});

export function bokehPlanes(
  planes: Planes,
  params: Params,
  border: BorderMode,
): [Plane, Plane, Plane] {
  const { radius, threshold, boost } = bokehOf(params);
  const lin = planes.map(linear) as unknown as Planes;
  const y = luminance(lin);
  const gain = y.map(
    (v) => 1 + boost * (threshold >= 1 ? 0 : smoothstep((v - threshold) / (1 - threshold))),
  );
  const kernel = kernelFromRows(diskKernel(radius));
  return lin.map((p) => {
    const boosted = { ...p, data: p.data.map((v, i) => v * (gain[i] ?? 1)) };
    const blurred = correlate2d(boosted, kernel, border);
    return { ...blurred, data: blurred.data.map((v) => linearToSrgb(v)) };
  }) as [Plane, Plane, Plane];
}

export const bokehFilter: ColorFilter = {
  id: "bokeh",
  kind: "color",
  radius: (params) => diskRadius(bokehOf(params).radius),
  color: (planes, params, { border }) => bokehPlanes(planes, params, border),
  representation: (params) => {
    const b = bokehOf(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Highlight boost",
          formula: `c_b = c \\left(1 + ${b.boost}\\, \\operatorname{smoothstep}\\left(\\frac{Y - ${b.threshold}}{1 - ${b.threshold}}\\right)\\right)`,
          note: "c is a linear channel and Y the linear luminance.",
        },
        {
          name: "Disk blur",
          formula: `c' = D_{${b.radius}} * c_b`,
          note: "D is the disk kernel of the disk averaging filter.",
        },
      ],
    };
  },
};

// Tilt-shift -----------------------------------------------------------------------------------

const LEVELS = 9;

const tiltOf = (params: Params) => ({
  center: read.number(params, "center", 50) / 100,
  band: read.number(params, "band", 15) / 100,
  ramp: read.number(params, "ramp", 25) / 100,
  maxSigma: read.number(params, "maxBlur", 6),
});

/** The blur sigma of a row at height fraction f of the image. */
export function tiltSigma(f: number, params: Params): number {
  const t = tiltOf(params);
  const d = Math.abs(f - t.center) - t.band;
  if (d <= 0) return 0;
  return t.maxSigma * (t.ramp <= 0 ? 1 : smoothstep(d / t.ramp));
}

export function tiltShiftPlane(input: Plane, params: Params, border: BorderMode): Plane {
  const { maxSigma } = tiltOf(params);
  const sigmas = Array.from({ length: LEVELS }, (_, k) => (maxSigma * k) / (LEVELS - 1));
  const stack = sigmas.map((s) => (s > 0 ? gaussianPlane(input, s, 3, border) : input));
  const out = createPlane(input.width, input.height);
  for (let y = 0; y < input.height; y++) {
    const sigma = tiltSigma((y + 0.5) / input.height, params);
    const pos = maxSigma > 0 ? (sigma / maxSigma) * (LEVELS - 1) : 0;
    const k = Math.min(LEVELS - 2, Math.floor(pos));
    const w = pos - k;
    const a = stack[k] ?? input;
    const b = stack[k + 1] ?? input;
    for (let x = 0; x < input.width; x++) {
      const i = y * input.width + x;
      out.data[i] = (1 - w) * (a.data[i] ?? 0) + w * (b.data[i] ?? 0);
    }
  }
  return out;
}

export const tiltShiftFilter: PlaneFilter = {
  id: "tilt-shift",
  kind: "smooth",
  alphaWeighted: true,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => tiltShiftPlane(input, params, border),
  representation: (params) => {
    const t = tiltOf(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Blur by row",
          formula: `\\sigma(f) = ${t.maxSigma}\\, \\operatorname{smoothstep}\\left(\\frac{|f - ${t.center}| - ${t.band}}{${t.ramp}}\\right)`,
          note: "f is the height of the row as a fraction of the image. Rows within the band stay sharp.",
        },
        {
          name: "Blend",
          formula: `I' = \\text{blend of } G_{\\sigma_k} * I,\\quad \\sigma_k = \\frac{k}{8}\\, ${t.maxSigma},\\ k = 0 \\ldots 8`,
          note: "Each row blends the two blurred images whose sigmas lie around its own.",
        },
      ],
    };
  },
};
