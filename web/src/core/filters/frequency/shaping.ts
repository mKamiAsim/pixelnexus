/**
 * Frequency filters that reshape the spectrum: homomorphic filtering, the phase-only filter,
 * spectral whitening, the log-Gabor filter and the global Wiener filter. Catalog entries:
 * catalog/filters/frequency/{homomorphic,phase-only,spectral-whitening,log-gabor}.yaml and
 * catalog/filters/linear/wiener-denoise.yaml.
 *
 * - Homomorphic filtering takes ln(1 + f), filters it with the high-emphasis response of
 *   Gonzalez and Woods, and returns exp(s) - 1.
 * - The phase-only filter gives every frequency the same magnitude and keeps its phase
 *   (Oppenheim and Lim). The magnitude is the mean of the spectrum, so the scale is kept.
 * - Spectral whitening scales each frequency by the mean magnitude of the spectrum over the mean
 *   magnitude of its ring, raised to a strength. The ring mean is PixelNexus's own choice of
 *   amplitude estimate.
 * - The log-Gabor filter is the product of Field's radial log-Gabor function and Kovesi's
 *   angular Gaussian.
 * - The global Wiener filter uses H = max(0, 1 - sigma^2 / P), with P the power of the image
 *   averaged over 5 x 5 frequencies. This estimate is PixelNexus's own.
 */
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import {
  inverseOf,
  multiplied,
  ringsOf,
  sampleResponse,
  spectrumOf,
  type Part,
  type Response,
  type Spectrum,
} from "./spectral";

/** A response given as one value per FFT bin, read at grid frequencies. */
function gridResponse(spectrum: Spectrum, values: Float64Array): Response {
  const { width, height } = spectrum;
  return (fx, fy) => {
    const i = (((Math.round(fx * width) % width) + width) % width) | 0;
    const j = (((Math.round(fy * height) % height) + height) % height) | 0;
    return values[j * width + i] ?? 0;
  };
}

// Homomorphic -----------------------------------------------------------------------------------

export interface HomomorphicSettings {
  readonly gammaLow: number;
  readonly gammaHigh: number;
  readonly c: number;
  readonly d0: number;
}

const homomorphicSettings = (params: Params): HomomorphicSettings => ({
  gammaLow: read.number(params, "gammaLow", 0.5),
  gammaHigh: read.number(params, "gammaHigh", 2),
  c: read.number(params, "sharpness", 1),
  d0: read.number(params, "cutoff", 0.05),
});

/** H = (gammaH - gammaL) (1 - exp(-c D^2 / D0^2)) + gammaL, Gonzalez and Woods. */
export function homomorphicResponse({ gammaLow, gammaHigh, c, d0 }: HomomorphicSettings): Response {
  return (fx, fy) =>
    (gammaHigh - gammaLow) * (1 - Math.exp((-c * (fx * fx + fy * fy)) / (d0 * d0))) + gammaLow;
}

export const homomorphicFilter: PlaneFilter = {
  id: "homomorphic",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const logged = createPlane(input.width, input.height);
    input.data.forEach((v, i) => {
      logged.data[i] = Math.log1p(Math.max(0, v));
    });
    const spectrum = spectrumOf(logged, border);
    const [re, im] = multiplied(spectrum, homomorphicResponse(homomorphicSettings(params)));
    const filtered = inverseOf(spectrum, re, im, input.width, input.height);
    filtered.data.forEach((v, i) => {
      filtered.data[i] = Math.expm1(v);
    });
    return filtered;
  },
  representation: (params) => {
    const s = homomorphicSettings(params);
    return {
      kind: "frequency",
      formula: `H = (\\gamma_H - \\gamma_L)\\left(1 - e^{-c D^2 / D_0^2}\\right) + \\gamma_L,\\quad \\gamma_L = ${s.gammaLow},\\ \\gamma_H = ${s.gammaHigh},\\ c = ${s.c},\\ D_0 = ${s.d0}`,
      ...sampleResponse(homomorphicResponse(s)),
      note: "H acts on the spectrum of ln(1 + f), not of the image. The result is exp(s) - 1, stretched to the full range by default.",
    };
  },
};

// Phase-only ------------------------------------------------------------------------------------

/**
 * Magnitudes below this share of the largest one count as 0. Mirror extensions make some
 * frequencies exactly 0, and rounding leaves them near 1e-14 times the largest. Scaling those up
 * would turn rounding noise into image content.
 */
const ZERO = 1e-9;

/** The magnitude of each bin, their mean, and the level below which a magnitude counts as 0. */
function magnitudes(spectrum: Spectrum): { values: Float64Array; mean: number; floor: number } {
  const values = new Float64Array(spectrum.re.length);
  let sum = 0;
  let top = 0;
  for (let k = 0; k < values.length; k++) {
    const m = Math.hypot(spectrum.re[k] ?? 0, spectrum.im[k] ?? 0);
    values[k] = m;
    sum += m;
    top = Math.max(top, m);
  }
  return { values, mean: sum / (values.length || 1), floor: ZERO * top };
}

/**
 * M / |F| at each bin, with M the mean magnitude of the spectrum, and 0 where |F| counts as 0.
 * Every frequency keeps its phase and gets the same magnitude M, so the result keeps the scale
 * of the image.
 */
export function phaseOnlyValues(spectrum: Spectrum): Float64Array {
  const { values, mean, floor } = magnitudes(spectrum);
  return values.map((m) => (m > floor ? mean / m : 0));
}

function gridFilter(
  input: Plane,
  border: BorderMode,
  values: (spectrum: Spectrum) => Float64Array,
): Plane {
  const spectrum = spectrumOf(input, border);
  const gains = values(spectrum);
  const re = new Float64Array(spectrum.re);
  const im = new Float64Array(spectrum.im);
  for (let k = 0; k < re.length; k++) {
    re[k] = (re[k] ?? 0) * (gains[k] ?? 0);
    im[k] = (im[k] ?? 0) * (gains[k] ?? 0);
  }
  return inverseOf(spectrum, re, im, input.width, input.height);
}

export const phaseOnlyFilter: PlaneFilter = {
  id: "phase-only",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, _params, { border }) => gridFilter(input, border, phaseOnlyValues),
  representation: () => ({
    kind: "stages",
    stages: [
      { name: "Spectrum", formula: "F = \\mathcal{F}\\{I_{\\text{ext}}\\}" },
      {
        name: "Phase only",
        formula: "P(f) = M \\frac{F(f)}{|F(f)|} = M e^{i \\angle F(f)}",
        note: "Every frequency keeps its phase and gets the mean magnitude M of the spectrum. Frequencies where F is 0 stay 0.",
      },
      { name: "Result", formula: "g = \\operatorname{Re} \\mathcal{F}^{-1}\\{P\\}" },
    ],
    note: "The result is signed, so it is stretched to the full range by default.",
  }),
};

// Spectral whitening ------------------------------------------------------------------------------

/**
 * (M / A)^alpha at each bin, with A the mean magnitude of its ring and M the mean magnitude of
 * the whole spectrum, and 0 where A counts as 0. Frequency 0 keeps its value, so the mean
 * brightness stays. Strength 0 keeps the image, and strength 1 gives every other ring the mean
 * magnitude M.
 */
export function whiteningValues(spectrum: Spectrum, strength: number): Float64Array {
  const { ring, count } = ringsOf(spectrum);
  const { values, mean, floor } = magnitudes(spectrum);
  const sums = new Float64Array(count);
  const sizes = new Float64Array(count);
  for (let k = 0; k < ring.length; k++) {
    const r = ring[k] ?? 0;
    sums[r] = (sums[r] ?? 0) + (values[k] ?? 0);
    sizes[r] = (sizes[r] ?? 0) + 1;
  }
  const out = new Float64Array(ring.length);
  for (let k = 0; k < ring.length; k++) {
    const r = ring[k] ?? 0;
    const a = (sums[r] ?? 0) / (sizes[r] || 1);
    // Ring 0 is frequency 0, the mean brightness, which is kept.
    out[k] = r === 0 ? 1 : a > floor ? (mean / a) ** strength : 0;
  }
  return out;
}

const strengthOf = (params: Params) => read.number(params, "strength", 1);

export const spectralWhiteningFilter: PlaneFilter = {
  id: "spectral-whitening",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    gridFilter(input, border, (s) => whiteningValues(s, strengthOf(params))),
  representation: (params) => ({
    kind: "stages",
    stages: [
      { name: "Spectrum", formula: "F = \\mathcal{F}\\{I_{\\text{ext}}\\}" },
      {
        name: "Ring means",
        formula: "A(r) = \\operatorname{mean}_{|f| \\approx r} |F(f)|",
        note: "The mean magnitude over each ring of frequencies at the same distance from the center.",
      },
      {
        name: "Whiten",
        formula: `W(f) = F(f) \\left(\\frac{M}{A(|f|)}\\right)^{\\alpha},\\quad \\alpha = ${strengthOf(params)}`,
        note: "M is the mean magnitude of the whole spectrum.",
      },
      { name: "Result", formula: "g = \\operatorname{Re} \\mathcal{F}^{-1}\\{W\\}" },
    ],
    note: "Frequency 0, the mean brightness, is kept. Strength 0 keeps the image. With strength 1 every other ring has the same mean magnitude. The result is stretched to the full range by default.",
  }),
};

// Log-Gabor -------------------------------------------------------------------------------------

export interface LogGaborSettings {
  /** The center frequency 1 / wavelength, in cycles per pixel. */
  readonly f0: number;
  /** sigma / f0 of the radial log-Gaussian. */
  readonly sigmaOnf: number;
  /** The direction of the filter in radians, counterclockwise on screen. */
  readonly angle: number;
  /** The angular spread in radians. */
  readonly angularSigma: number;
  readonly oriented: boolean;
}

const logGaborSettings = (params: Params): LogGaborSettings => ({
  f0: 1 / read.number(params, "wavelength", 8),
  sigmaOnf: read.number(params, "sigmaOnf", 0.55),
  angle: (read.number(params, "angle", 0) * Math.PI) / 180,
  angularSigma: (read.number(params, "angularSigma", 25) * Math.PI) / 180,
  oriented: read.boolean(params, "oriented", true),
});

/**
 * Field's radial log-Gabor function, 0 at frequency 0, times Kovesi's angular Gaussian of the
 * angle between the frequency and the filter direction. The y axis points down, so the direction
 * of a frequency is atan2(-fy, fx).
 */
export function logGaborResponse(s: LogGaborSettings): Response {
  const spread = 2 * Math.log(s.sigmaOnf) ** 2;
  const cos0 = Math.cos(s.angle);
  const sin0 = Math.sin(s.angle);
  return (fx, fy) => {
    const f = Math.sqrt(fx * fx + fy * fy);
    if (f === 0) return 0;
    const radial = Math.exp(-(Math.log(f / s.f0) ** 2) / spread);
    if (!s.oriented) return radial;
    const theta = Math.atan2(-fy, fx);
    const ds = Math.sin(theta) * cos0 - Math.cos(theta) * sin0;
    const dc = Math.cos(theta) * cos0 + Math.sin(theta) * sin0;
    const dTheta = Math.abs(Math.atan2(ds, dc));
    return radial * Math.exp(-(dTheta * dTheta) / (2 * s.angularSigma * s.angularSigma));
  };
}

export const logGaborFilter: PlaneFilter = {
  id: "log-gabor",
  kind: "derived",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) => {
    const settings = logGaborSettings(params);
    const part = read.string<Part>(params, "output", "magnitude");
    const spectrum = spectrumOf(input, border);
    const [re, im] = multiplied(spectrum, logGaborResponse(settings));
    // Without a direction the response is symmetric, so the result is real.
    return inverseOf(
      spectrum,
      re,
      im,
      input.width,
      input.height,
      settings.oriented ? part : "real",
    );
  },
  representation: (params) => {
    const s = logGaborSettings(params);
    const values = [
      `f_0 = ${Number(s.f0.toFixed(4))}`,
      `\\sigma / f_0 = ${s.sigmaOnf}`,
      ...(s.oriented
        ? [
            `\\theta_0 = ${read.number(params, "angle", 0)}^\\circ`,
            `\\sigma_\\theta = ${read.number(params, "angularSigma", 25)}^\\circ`,
          ]
        : []),
    ];
    const angular = s.oriented ? "\\, e^{-\\Delta\\theta^2 / 2 \\sigma_\\theta^2}" : "";
    return {
      kind: "frequency",
      formula: `H = e^{-\\frac{(\\ln (f / f_0))^2}{2 (\\ln (\\sigma / f_0))^2}}${angular},\\quad ${values.join(",\\ ")}`,
      ...sampleResponse(logGaborResponse(s)),
      note: s.oriented
        ? "f is the distance from the center and Delta theta the angle between the frequency and the filter direction. The filter covers one side of the spectrum, so the result is complex: the real part responds to lines and the imaginary part to edges."
        : "f is the distance from the center, in cycles per pixel. Without a direction the response is the same in all directions and the result is real.",
    };
  },
};

// Global Wiener filter ----------------------------------------------------------------------------

/** Half the side of the box that averages the power. */
const POWER_REACH = 2;

/** max(0, 1 - sigma^2 / P) with P the power |G|^2 / N averaged over 5 x 5 bins. */
export function wienerValues(spectrum: Spectrum, sigma: number): Float64Array {
  const { width, height } = spectrum;
  const n = width * height;
  const power = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    power[k] = ((spectrum.re[k] ?? 0) ** 2 + (spectrum.im[k] ?? 0) ** 2) / n;
  }
  const out = new Float64Array(n);
  const noise = sigma * sigma;
  const box = (2 * POWER_REACH + 1) ** 2;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let sum = 0;
      for (let dj = -POWER_REACH; dj <= POWER_REACH; dj++) {
        const row = ((j + dj + height) % height) * width;
        for (let di = -POWER_REACH; di <= POWER_REACH; di++) {
          sum += power[row + ((i + di + width) % width)] ?? 0;
        }
      }
      const p = sum / box;
      out[j * width + i] = p > 0 ? Math.max(0, 1 - noise / p) : 0;
    }
  }
  return out;
}

const noiseSigmaOf = (params: Params) => read.number(params, "noiseSigma", 10);

export const wienerDenoiseFilter: PlaneFilter = {
  id: "wiener-denoise",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    gridFilter(input, border, (s) => wienerValues(s, noiseSigmaOf(params))),
  representation: (params) => ({
    kind: "stages",
    stages: [
      { name: "Spectrum", formula: "G = \\mathcal{F}\\{I_{\\text{ext}}\\}" },
      {
        name: "Power",
        formula: "P(f) = \\operatorname{mean}_{5 \\times 5} \\frac{|G|^2}{N}",
        note: "N is the number of FFT samples. For white noise, the noise adds sigma squared to P at every frequency.",
      },
      {
        name: "Gain",
        formula: `H(f) = \\max\\left(0,\\ 1 - \\frac{\\sigma^2}{P(f)}\\right),\\quad \\sigma = ${noiseSigmaOf(params)}`,
        note: "This is S / (S + sigma^2) with the signal power S estimated as P - sigma^2.",
      },
      { name: "Result", formula: "g = \\operatorname{Re} \\mathcal{F}^{-1}\\{H G\\}" },
    ],
  }),
};

/** The response of each filter for its parameters and the plane it filters, by catalog id. */
export const shapingResponses: ReadonlyMap<
  string,
  (params: Params, plane?: Plane) => Response | undefined
> = new Map<string, (params: Params, plane?: Plane) => Response | undefined>([
  ["homomorphic", (params) => homomorphicResponse(homomorphicSettings(params))],
  ["log-gabor", (params) => logGaborResponse(logGaborSettings(params))],
  [
    "phase-only",
    (params, plane) => {
      if (!plane) return undefined;
      const s = spectrumOf(plane, read.string<BorderMode>(params, "border", "reflect"));
      return gridResponse(s, phaseOnlyValues(s));
    },
  ],
  [
    "spectral-whitening",
    (params, plane) => {
      if (!plane) return undefined;
      const s = spectrumOf(plane, read.string<BorderMode>(params, "border", "reflect"));
      return gridResponse(s, whiteningValues(s, strengthOf(params)));
    },
  ],
  [
    "wiener-denoise",
    (params, plane) => {
      if (!plane) return undefined;
      const s = spectrumOf(plane, read.string<BorderMode>(params, "border", "reflect"));
      return gridResponse(s, wienerValues(s, noiseSigmaOf(params)));
    },
  ],
]);
