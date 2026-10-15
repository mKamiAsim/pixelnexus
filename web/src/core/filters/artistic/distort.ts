/**
 * Geometric distortions: fisheye, barrel, pincushion, swirl, ripple and wave. Catalog entries:
 * catalog/filters/artistic/{fisheye,barrel,pincushion,swirl,ripple,wave}.yaml.
 *
 * Each output pixel reads the source at a mapped position, with bilinear interpolation and the
 * border mode for positions outside the image. Positions are in pixel units with pixel centers
 * at whole numbers, so the image center is ((W - 1) / 2, (H - 1) / 2). Radial mappings measure
 * the radius r as a share of R, half the image diagonal, so the corners sit near r = 1.
 *
 * - Fisheye: an equidistant fisheye, r = theta / theta_max, seen through a rectilinear view of
 *   the same field: the source radius is tan(r theta_max) / tan(theta_max).
 * - Barrel and pincushion: the radial polynomial r_s = r (1 + k r^2), with k > 0 for barrel and
 *   k < 0 for pincushion, divided by 1 + k when Keep corners is on.
 * - Swirl: the mapping of scikit-image's transform.swirl, theta_s = theta + rotation +
 *   strength exp(-rho / (radius ln 2 / 5)), around the image center.
 * - Ripple: concentric waves, rho_s = rho + A sin(2 pi rho / lambda + phase), in pixels.
 * - Wave: rows shift sideways by A sin(2 pi y / lambda + phase), columns up and down by the same
 *   rule in x, or both.
 *
 * Ripple and wave are PixelNexus's own rules. All are global filters, and they move alpha with
 * the colors.
 */
import { borderIndex, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter, type Representation } from "@/core/filters/types";

/** Maps an output position to the source position it reads. */
export type Mapping = (x: number, y: number) => readonly [number, number];

/** Bilinear read at (x, y), with the border mode for the four neighbors. */
export function sampleBilinear(p: Plane, x: number, y: number, border: BorderMode): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => {
    const sx = borderIndex(xx, p.width, border);
    const sy = borderIndex(yy, p.height, border);
    return sx < 0 || sy < 0 ? 0 : (p.data[sy * p.width + sx] ?? 0);
  };
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function warpPlane(input: Plane, map: Mapping, border: BorderMode): Plane {
  const out = createPlane(input.width, input.height);
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      const [sx, sy] = map(x, y);
      out.data[y * input.width + x] = sampleBilinear(input, sx, sy, border);
    }
  }
  return out;
}

/** A radial mapping: the source radius, in units of R, for an output radius r in units of R. */
export function radialMapping(
  width: number,
  height: number,
  source: (r: number) => number,
): Mapping {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const R = Math.hypot(width, height) / 2;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy) / R;
    if (r === 0) return [x, y];
    const s = source(r) / r;
    return [cx + dx * s, cy + dy * s];
  };
}

function warpFilter(
  mappingOf: (params: Params, width: number, height: number) => Mapping,
  representation: (params: Params) => Representation,
) {
  return {
    kind: "smooth" as const,
    alphaWeighted: true,
    global: true,
    movesAlpha: true,
    radius: () => 0,
    plane: (input: Plane, params: Params, { border }: { border: BorderMode }) =>
      warpPlane(input, mappingOf(params, input.width, input.height), border),
    representation,
  };
}

const stages = (steps: { name: string; formula: string; note?: string }[]): Representation => ({
  kind: "stages",
  stages: [
    ...steps,
    {
      name: "Sample",
      formula: "I'(x, y) = I\\left(x_s, y_s\\right)",
      note: "Bilinear interpolation, with the border mode outside the image.",
    },
  ],
});

// Fisheye -----------------------------------------------------------------------------------

const fovOf = (params: Params) => read.number(params, "fov", 120);

export function fisheyeSource(fovDegrees: number): (r: number) => number {
  const half = (Math.min(170, Math.max(1, fovDegrees)) * Math.PI) / 360;
  return (r) => Math.tan(r * half) / Math.tan(half);
}

export const fisheyeFilter: PlaneFilter = {
  id: "fisheye",
  ...warpFilter(
    (params, w, h) => radialMapping(w, h, fisheyeSource(fovOf(params))),
    (params) =>
      stages([
        {
          name: "Radius",
          formula: `r_s = \\frac{\\tan(r\\, \\theta_m)}{\\tan \\theta_m},\\quad \\theta_m = \\frac{${fovOf(params)}^{\\circ}}{2}`,
          note: "r and r_s are shares of half the image diagonal.",
        },
      ]),
  ),
};

// Barrel and pincushion -------------------------------------------------------------------

export function polynomialSource(k: number, fit: boolean): (r: number) => number {
  const scale = fit ? 1 + k : 1;
  return (r) => (r * (1 + k * r * r)) / scale;
}

function radialFilter(sign: 1 | -1, fallback: number) {
  const kOf = (params: Params) => sign * read.number(params, "strength", fallback);
  const fitOf = (params: Params) => read.boolean(params, "fit", true);
  return warpFilter(
    (params, w, h) => radialMapping(w, h, polynomialSource(kOf(params), fitOf(params))),
    (params) =>
      stages([
        {
          name: "Radius",
          formula: `r_s = \\frac{r\\,(1 + k r^2)}{${fitOf(params) ? "1 + k" : "1"}},\\quad k = ${kOf(params)}`,
          note: "r and r_s are shares of half the image diagonal.",
        },
      ]),
  );
}

export const barrelFilter: PlaneFilter = { id: "barrel", ...radialFilter(1, 0.3) };
export const pincushionFilter: PlaneFilter = { id: "pincushion", ...radialFilter(-1, 0.15) };

// Swirl ---------------------------------------------------------------------------------------

const swirlOf = (params: Params) => ({
  strength: read.number(params, "strength", 3),
  radius: read.number(params, "radius", 120),
  rotation: (read.number(params, "rotation", 0) * Math.PI) / 180,
});

export function swirlMapping(width: number, height: number, params: Params): Mapping {
  const { strength, radius, rotation } = swirlOf(params);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const decay = (radius / 5) * Math.log(2);
  return (x, y) => {
    const rho = Math.hypot(x - cx, y - cy);
    const theta = rotation + strength * Math.exp(-rho / decay) + Math.atan2(y - cy, x - cx);
    return [cx + rho * Math.cos(theta), cy + rho * Math.sin(theta)];
  };
}

export const swirlFilter: PlaneFilter = {
  id: "swirl",
  ...warpFilter(
    (params, w, h) => swirlMapping(w, h, params),
    (params) => {
      const s = swirlOf(params);
      return stages([
        {
          name: "Angle",
          formula: `\\theta_s = \\theta + ${read.number(params, "rotation", 0)}^{\\circ} + ${s.strength}\\, e^{-\\rho / (${s.radius} \\ln 2 / 5)}`,
          note: "rho and theta are the polar coordinates around the image center. rho stays.",
        },
      ]);
    },
  ),
};

// Ripple and wave -----------------------------------------------------------------------------

const waveOf = (params: Params, amplitude: number, wavelength: number) => ({
  amplitude: read.number(params, "amplitude", amplitude),
  wavelength: Math.max(1e-6, read.number(params, "wavelength", wavelength)),
  phase: (read.number(params, "phase", 0) * Math.PI) / 180,
});

export function rippleMapping(width: number, height: number, params: Params): Mapping {
  const { amplitude, wavelength, phase } = waveOf(params, 4, 24);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const rho = Math.hypot(dx, dy);
    if (rho === 0) return [x, y];
    const s = (rho + amplitude * Math.sin((2 * Math.PI * rho) / wavelength + phase)) / rho;
    return [cx + dx * s, cy + dy * s];
  };
}

export const rippleFilter: PlaneFilter = {
  id: "ripple",
  ...warpFilter(
    (params, w, h) => rippleMapping(w, h, params),
    (params) => {
      const s = waveOf(params, 4, 24);
      return stages([
        {
          name: "Radius",
          formula: `\\rho_s = \\rho + ${s.amplitude} \\sin\\left(\\frac{2\\pi \\rho}{${s.wavelength}} + ${read.number(params, "phase", 0)}^{\\circ}\\right)`,
          note: "rho is the distance from the image center in pixels. The angle stays.",
        },
      ]);
    },
  ),
};

type WaveDirection = "horizontal" | "vertical" | "both";

export function waveMapping(params: Params): Mapping {
  const { amplitude, wavelength, phase } = waveOf(params, 6, 40);
  const direction = read.string<WaveDirection>(params, "direction", "horizontal");
  const shift = (t: number) => amplitude * Math.sin((2 * Math.PI * t) / wavelength + phase);
  return (x, y) => [
    direction === "vertical" ? x : x + shift(y),
    direction === "horizontal" ? y : y + shift(x),
  ];
}

export const waveFilter: PlaneFilter = {
  id: "wave",
  ...warpFilter(
    (params) => waveMapping(params),
    (params) => {
      const s = waveOf(params, 6, 40);
      const f = (v: string) =>
        `${s.amplitude} \\sin\\left(\\frac{2\\pi ${v}}{${s.wavelength}} + ${read.number(params, "phase", 0)}^{\\circ}\\right)`;
      const direction = read.string<WaveDirection>(params, "direction", "horizontal");
      return stages([
        {
          name: "Shift",
          formula: `x_s = x${direction === "vertical" ? "" : ` + ${f("y")}`},\\quad y_s = y${direction === "horizontal" ? "" : ` + ${f("x")}`}`,
        },
      ]);
    },
  ),
};
