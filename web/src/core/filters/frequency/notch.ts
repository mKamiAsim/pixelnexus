/**
 * Notch filters, the comb filter, periodic noise suppression and periodic noise. Catalog entries:
 * catalog/filters/frequency/{notch-reject,notch-pass,comb,periodic-noise}.yaml and
 * catalog/filters/utility/noise-periodic.yaml.
 *
 * A notch-reject filter is the product of high-pass filters centered at each notch and at its
 * mirror point through the origin, as in Gonzalez and Woods, chapter 4. The mirror point keeps
 * the response symmetric, so the result stays real. A notch-pass filter is 1 minus the
 * notch-reject filter. Notch positions are frequencies in cycles per pixel, written as text:
 * "fx fy" pairs separated by semicolons or new lines.
 *
 * With the reflect and reflect 101 border modes, the extension mirrors a pattern at frequency
 * (fx, fy) into one at (-fx, fy). So for these modes every notch also covers (-fx, fy) and
 * (fx, -fy), and a notch placed on the pattern removes it from the whole extended plane.
 *
 * The comb filter places notches at the harmonics k (fx, fy) of a fundamental frequency.
 *
 * Periodic noise suppression is PixelNexus's own rule. It looks for peaks in the spectrum of the
 * image itself, with its mean removed and a Hann window applied, where a periodic pattern makes
 * a compact peak. A peak is a local maximum of the log magnitude that rises above the median of
 * its ring, the frequencies at the same distance from the center. It then rejects the peaks with
 * Gaussian notches.
 */
import { fft2d, nextFastSize } from "@/core/math/fft";
import { createPlane, type BorderMode, type Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

import {
  fftFrequencies,
  inverseOf,
  multiplied,
  sampleResponse,
  spectrumOf,
  type Response,
  type Spectrum,
} from "./spectral";

export interface Notch {
  readonly fx: number;
  readonly fy: number;
}

export type NotchShape = "ideal" | "butterworth" | "gaussian";

/** The most notches a list can hold. */
export const MAX_NOTCHES = 32;

export type NotchParse =
  | { readonly ok: true; readonly notches: Notch[] }
  | { readonly ok: false; readonly message: string };

/** Read "fx fy" pairs separated by semicolons or new lines. Empty text means no notches. */
export function parseNotches(text: string): NotchParse {
  const pairs = text
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (pairs.length > MAX_NOTCHES) {
    return { ok: false, message: `Use at most ${MAX_NOTCHES} notches.` };
  }
  const notches: Notch[] = [];
  for (const pair of pairs) {
    const numbers = pair.split(/[\s,]+/).map(Number);
    if (numbers.length !== 2 || numbers.some((v) => !Number.isFinite(v))) {
      return { ok: false, message: `"${pair}" is not two numbers, fx and fy.` };
    }
    const [fx = 0, fy = 0] = numbers;
    if (Math.abs(fx) > 0.5 || Math.abs(fy) > 0.5) {
      return { ok: false, message: `"${pair}" lies outside the spectrum, -0.5 to 0.5.` };
    }
    notches.push({ fx, fy });
  }
  return { ok: true, notches };
}

const round4 = (v: number) => Number(v.toFixed(4)) || 0;

export function formatNotches(notches: readonly Notch[]): string {
  return notches.map((n) => `${round4(n.fx)} ${round4(n.fy)}`).join("; ");
}

/** True for the border modes that mirror the image, and so mirror its patterns. */
export const mirrors = (border: BorderMode) => border === "reflect" || border === "reflect101";

/** The high-pass factor at distance d from a notch center. */
function notchFactor(shape: NotchShape, d: number, d0: number, order: number): number {
  if (shape === "ideal") return d <= d0 ? 0 : 1;
  if (shape === "butterworth") return d === 0 ? 0 : 1 / (1 + (d0 / d) ** (2 * order));
  return 1 - Math.exp(-(d * d) / (2 * d0 * d0));
}

/**
 * The notch centers for a list of notches: each notch, its mirror point through the origin and,
 * when the border mode mirrors, the mirror points across the axes.
 */
export function notchCenters(notches: readonly Notch[], mirrorAxes: boolean): Notch[] {
  const centers: Notch[] = [];
  for (const { fx, fy } of notches) {
    centers.push({ fx, fy }, { fx: -fx, fy: -fy });
    if (mirrorAxes && fx !== 0 && fy !== 0) centers.push({ fx: -fx, fy }, { fx, fy: -fy });
  }
  return centers;
}

/** The notch-reject response, or the notch-pass response when `pass` is true. */
export function notchResponse(
  notches: readonly Notch[],
  shape: NotchShape,
  d0: number,
  order: number,
  pass: boolean,
  mirrorAxes: boolean,
): Response {
  const centers = notchCenters(notches, mirrorAxes);
  return (fx, fy) => {
    let h = 1;
    for (const c of centers) h *= notchFactor(shape, Math.hypot(fx - c.fx, fy - c.fy), d0, order);
    return pass ? 1 - h : h;
  };
}

/** The harmonics k (fx, fy), k = 1 .. count, that lie inside the spectrum. */
export function harmonics(fx: number, fy: number, count: number): Notch[] {
  const out: Notch[] = [];
  for (let k = 1; k <= count; k++) {
    if (Math.abs(k * fx) <= 0.5 && Math.abs(k * fy) <= 0.5 && (fx !== 0 || fy !== 0)) {
      out.push({ fx: k * fx, fy: k * fy });
    }
  }
  return out;
}

const shapeOf = (params: Params) => read.string<NotchShape>(params, "shape", "butterworth");
const radiusOf = (params: Params) => read.number(params, "radius", 0.01);
const orderOf = (params: Params) => read.number(params, "order", 2);
const borderOf = (params: Params) => read.string<BorderMode>(params, "border", "reflect");

function notchesOf(params: Params): Notch[] {
  const parsed = parseNotches(read.string(params, "notches", "0.2 0.1"));
  return parsed.ok ? parsed.notches : [];
}

function combNotches(params: Params): Notch[] {
  return harmonics(
    read.number(params, "fx", 0.125),
    read.number(params, "fy", 0),
    read.number(params, "harmonics", 3),
  );
}

const FACTOR: Record<NotchShape, string> = {
  ideal: "H_k = \\begin{cases} 0 & D_k \\le D_0 \\\\ 1 & D_k > D_0 \\end{cases}",
  butterworth: "H_k = \\frac{1}{1 + (D_0 / D_k)^{2n}}",
  gaussian: "H_k = 1 - e^{-D_k^2 / 2 D_0^2}",
};

function notchFormula(shape: NotchShape, pass: boolean, d0: number, order: number): string {
  const product = "\\prod_{k} H_k";
  const values = [`D_0 = ${d0}`, ...(shape === "butterworth" ? [`n = ${order}`] : [])];
  return `H = ${pass ? `1 - ${product}` : product},\\quad ${FACTOR[shape]},\\quad ${values.join(",\\ ")}`;
}

function notchNote(notches: readonly Notch[], mirrorAxes: boolean): string {
  const list = formatNotches(notches) || "none";
  return `Notches at ${list}. D_k is the distance from center k, in cycles per pixel. The centers are each notch and its mirror point through the origin${mirrorAxes ? ", and, because the border mode mirrors the image, the mirror points across the axes" : ""}.`;
}

function notchPlane(input: Plane, border: BorderMode, response: Response): Plane {
  const spectrum = spectrumOf(input, border);
  const [re, im] = multiplied(spectrum, response);
  return inverseOf(spectrum, re, im, input.width, input.height);
}

function notchFilter(pass: boolean, notchList: (params: Params) => Notch[]) {
  const response = (params: Params, border: BorderMode) =>
    notchResponse(
      notchList(params),
      shapeOf(params),
      radiusOf(params),
      orderOf(params),
      pass,
      mirrors(border),
    );
  return {
    kind: pass ? ("derived" as const) : ("smooth" as const),
    alphaWeighted: false,
    global: true,
    radius: () => 0,
    plane: (input: Plane, params: Params, { border }: { border: BorderMode }) =>
      notchPlane(input, border, response(params, border)),
    representation: (params: Params) => ({
      kind: "frequency" as const,
      formula: notchFormula(shapeOf(params), pass, radiusOf(params), orderOf(params)),
      ...sampleResponse(response(params, borderOf(params))),
      note: notchNote(notchList(params), mirrors(borderOf(params))),
    }),
    response,
  };
}

const notchReject = notchFilter(false, notchesOf);
const notchPass = notchFilter(true, notchesOf);
const comb = notchFilter(false, combNotches);

export const notchRejectFilter: PlaneFilter = { ...notchReject, id: "notch-reject" };
export const notchPassFilter: PlaneFilter = { ...notchPass, id: "notch-pass" };
export const combFilter: PlaneFilter = { ...comb, id: "comb" };

// Periodic noise suppression ---------------------------------------------------------------------

/** The symmetric Hann window of numpy.hanning. */
function hann(n: number): Float64Array {
  if (n === 1) return Float64Array.of(1);
  return Float64Array.from(
    { length: n },
    (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1)),
  );
}

/**
 * The spectrum in which periodic patterns are found and shown: the plane minus its mean, times a
 * 2D Hann window, padded with zeros to a fast FFT size. The window keeps the peak of a pattern
 * compact, and removing the mean keeps the peak at frequency 0 from spreading.
 */
export function windowedSpectrum(input: Plane): Spectrum {
  const width = nextFastSize(input.width);
  const height = nextFastSize(input.height);
  const wx = hann(input.width);
  const wy = hann(input.height);
  let mean = 0;
  for (const v of input.data) mean += v;
  mean /= input.data.length || 1;
  const re = new Float64Array(width * height);
  const im = new Float64Array(width * height);
  for (let j = 0; j < input.height; j++) {
    for (let i = 0; i < input.width; i++) {
      const v = (input.data[j * input.width + i] ?? 0) - mean;
      re[j * width + i] = v * (wx[i] ?? 0) * (wy[j] ?? 0);
    }
  }
  fft2d(re, im, height, width, false);
  return {
    width,
    height,
    left: 0,
    top: 0,
    re,
    im,
    fx: fftFrequencies(width),
    fy: fftFrequencies(height),
  };
}

export interface PeakSettings {
  /** Peaks closer than this to the center, in cycles per pixel, are left alone. */
  readonly minFrequency: number;
  /** How far a peak must rise above the median log magnitude of its ring. */
  readonly threshold: number;
  /** The most peaks to reject. */
  readonly maxPeaks: number;
}

/** Half the side of the window for the local maximum. */
const PEAK_REACH = 2;
/** Values closer than this, relative to their size, count as equal when finding peaks. */
const PEAK_TOLERANCE = 1e-9;

/**
 * Find the peaks of a spectrum. With L = ln(1 + |F|), a bin is a peak when no bin in the 5 x 5
 * window around it is larger by more than a relative 1e-9, and L exceeds the median of L on its
 * ring by at least the threshold. A ring holds the bins whose distance from the center, in steps
 * of 1 / max(width, height), rounds to the same whole number. The median is the lower middle
 * value. Only peaks with fy > 0, or fy = 0 and fx > 0, are kept, since the mirror points through
 * the origin are rejected with them. The strongest come first, equal ones in order of fy, then fx.
 */
export function findPeaks(spectrum: Spectrum, settings: PeakSettings): Notch[] {
  const { width, height, fx, fy } = spectrum;
  const log = new Float64Array(width * height);
  for (let k = 0; k < log.length; k++) {
    log[k] = Math.log1p(Math.hypot(spectrum.re[k] ?? 0, spectrum.im[k] ?? 0));
  }
  const step = 1 / Math.max(width, height);
  const ringOf = new Int32Array(width * height);
  const rings: number[][] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const ring = Math.floor(Math.hypot(fx[i] ?? 0, fy[j] ?? 0) / step + 0.5);
      ringOf[k] = ring;
      (rings[ring] ??= []).push(log[k] ?? 0);
    }
  }
  const medians = rings.map((values) => {
    values.sort((a, b) => a - b);
    return values[(values.length - 1) >> 1] ?? 0;
  });
  const at = (i: number, j: number) =>
    log[((j + height) % height) * width + ((i + width) % width)] ?? 0;
  const peaks: { notch: Notch; excess: number }[] = [];
  for (let j = 0; j < height; j++) {
    const v = fy[j] ?? 0;
    for (let i = 0; i < width; i++) {
      const u = fx[i] ?? 0;
      if (v < 0 || (v === 0 && u <= 0)) continue;
      if (Math.hypot(u, v) < settings.minFrequency) continue;
      const value = at(i, j);
      const limit = value + PEAK_TOLERANCE * Math.abs(value);
      let largest = true;
      for (let dj = -PEAK_REACH; dj <= PEAK_REACH && largest; dj++) {
        for (let di = -PEAK_REACH; di <= PEAK_REACH; di++) {
          if ((di !== 0 || dj !== 0) && at(i + di, j + dj) > limit) {
            largest = false;
            break;
          }
        }
      }
      if (!largest) continue;
      const excess = value - (medians[ringOf[j * width + i] ?? 0] ?? 0);
      if (excess >= settings.threshold) peaks.push({ notch: { fx: u, fy: v }, excess });
    }
  }
  peaks.sort((a, b) => {
    const scale = PEAK_TOLERANCE * Math.max(Math.abs(a.excess), Math.abs(b.excess));
    if (Math.abs(a.excess - b.excess) > scale) return b.excess - a.excess;
    return a.notch.fy - b.notch.fy || a.notch.fx - b.notch.fx;
  });
  return peaks.slice(0, settings.maxPeaks).map((p) => p.notch);
}

const peakSettings = (params: Params): PeakSettings => ({
  minFrequency: read.number(params, "minFrequency", 0.05),
  threshold: read.number(params, "threshold", 3),
  maxPeaks: read.number(params, "maxPeaks", 8),
});

/** The peaks that periodic noise suppression rejects in a plane. */
export function periodicPeaks(input: Plane, params: Params): Notch[] {
  return findPeaks(windowedSpectrum(input), peakSettings(params));
}

/** The suppression response for a set of peaks: Gaussian notches at each of them. */
function suppression(peaks: readonly Notch[], params: Params, border: BorderMode): Response {
  return notchResponse(peaks, "gaussian", radiusOf(params), 1, false, mirrors(border));
}

export const periodicNoiseFilter: PlaneFilter = {
  id: "periodic-noise",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    notchPlane(input, border, suppression(periodicPeaks(input, params), params, border)),
  representation: (params) => {
    const { minFrequency, threshold, maxPeaks } = peakSettings(params);
    return {
      kind: "stages",
      stages: [
        {
          name: "Window",
          formula:
            "L(f) = \\ln\\left(1 + \\left|\\mathcal{F}\\{(I - \\bar{I})\\, w\\}(f)\\right|\\right)",
          note: "The log magnitude of the spectrum of the image minus its mean, times a 2D Hann window w.",
        },
        {
          name: "Peaks",
          formula: `L(p) = \\max_{5 \\times 5} L,\\quad L(p) - \\operatorname{median}_{\\text{ring}} L \\ge ${threshold},\\quad |p| \\ge ${minFrequency}`,
          note: `At most ${maxPeaks} peaks, the strongest first. The ring holds the frequencies at the same distance from the center.`,
        },
        {
          name: "Notches",
          formula: `H = \\prod_{k} \\left(1 - e^{-D_k^2 / 2 D_0^2}\\right),\\quad D_0 = ${radiusOf(params)}`,
          note: "Gaussian notches at each peak and its mirror points, as for the notch-reject filter.",
        },
        {
          name: "Result",
          formula: "g = \\mathcal{F}^{-1}\\{H\\, \\mathcal{F}\\{I_{\\text{ext}}\\}\\}",
          note: "The image extended with the border mode is filtered and cropped.",
        },
      ],
      note: "The peaks depend on the image. The Frequency explorer shows the notches found on the patch.",
    };
  },
};

/**
 * The response of each filter for its parameters, by catalog id. Periodic noise suppression
 * needs the plane it filters, to find its peaks.
 */
export const notchResponses: ReadonlyMap<
  string,
  (params: Params, plane?: Plane) => Response | undefined
> = new Map<string, (params: Params, plane?: Plane) => Response | undefined>([
  ["notch-reject", (params) => notchReject.response(params, borderOf(params))],
  ["notch-pass", (params) => notchPass.response(params, borderOf(params))],
  ["comb", (params) => comb.response(params, borderOf(params))],
  [
    "periodic-noise",
    (params, plane) =>
      plane ? suppression(periodicPeaks(plane, params), params, borderOf(params)) : undefined,
  ],
]);

// Periodic noise ---------------------------------------------------------------------------------

/** Add the sine wave A sin(2 pi (fx x + fy y) + phase), with x and y in image pixels. */
export const noisePeriodicFilter: PlaneFilter = {
  id: "noise-periodic",
  kind: "smooth",
  alphaWeighted: false,
  radius: () => 0,
  plane: (input, params, { originX, originY }) => {
    const amplitude = read.number(params, "amplitude", 40);
    const fx = read.number(params, "fx", 0.125);
    const fy = read.number(params, "fy", 0);
    const phase = (read.number(params, "phase", 0) * Math.PI) / 180;
    const out = createPlane(input.width, input.height);
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const k = y * input.width + x;
        const wave = Math.sin(2 * Math.PI * (fx * (x + originX) + fy * (y + originY)) + phase);
        out.data[k] = (input.data[k] ?? 0) + amplitude * wave;
      }
    }
    return out;
  },
  representation: (params) => ({
    kind: "generator",
    description: `Adds A sin(2 pi (f_x x + f_y y) + phase) with A = ${read.number(params, "amplitude", 40)}, f_x = ${read.number(params, "fx", 0.125)} and f_y = ${read.number(params, "fy", 0)} cycles per pixel, at image position (x, y). Its spectrum has two peaks, at (f_x, f_y) and at the mirror point through the origin.`,
  }),
};
