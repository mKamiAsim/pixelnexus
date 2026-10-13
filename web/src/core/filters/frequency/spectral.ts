/**
 * Filtering in the frequency domain, shared by the frequency filters.
 *
 * The plane is extended with the border mode by half its size, at most 256 pixels, on each
 * side, and a little more on the right and at the bottom to reach a size the FFT handles fast.
 * This is the padding step of Gonzalez and Woods, with the border mode in place of zeros, so the
 * circular wrap of the FFT does not mix opposite edges of the image. The spectrum of the extended
 * plane is multiplied by a response H(fx, fy), transformed back and cropped to the image.
 *
 * Frequencies are in cycles per pixel, from -0.5 to 0.5, so a filter does the same thing on any
 * image size. The distance from the center of the spectrum is D = sqrt(fx^2 + fy^2).
 */
import { fft2d, nextFastSize } from "@/core/math/fft";
import { borderIndex, createPlane, type BorderMode, type Plane } from "@/core/filters/planes";

/** The largest extension on each side, in pixels. */
export const MAX_MARGIN = 256;

/** A response: the factor for the frequency (fx, fy), in cycles per pixel. */
export type Response = (fx: number, fy: number) => number;

/** A plane extended for the FFT, and its spectrum. */
export interface Spectrum {
  /** The size of the FFT grid. */
  readonly width: number;
  readonly height: number;
  /** The grid position of the first image column and row. */
  readonly left: number;
  readonly top: number;
  /** The spectrum, row by row. */
  readonly re: Float64Array;
  readonly im: Float64Array;
  /** The frequency of each grid column and row, in cycles per pixel, as numpy.fft.fftfreq. */
  readonly fx: Float64Array;
  readonly fy: Float64Array;
}

/** The extension on each side for an image side of n pixels. */
export function frequencyMargin(n: number): number {
  return Math.min(Math.ceil(n / 2), MAX_MARGIN);
}

/**
 * The frequencies of an n-point FFT in cycles per sample, in FFT order. Computed as
 * numpy.fft.fftfreq does, k times 1/n, so ideal filters cut at exactly the same bins.
 */
export function fftFrequencies(n: number): Float64Array {
  const step = 1 / n;
  return Float64Array.from({ length: n }, (_, k) => (k < Math.ceil(n / 2) ? k : k - n) * step);
}

/**
 * Extend a plane by `marginX` and `marginY` pixels with the border mode, and more on the far
 * sides up to a fast FFT size, then take its FFT.
 */
export function spectrumOf(
  input: Plane,
  border: BorderMode,
  marginX = frequencyMargin(input.width),
  marginY = frequencyMargin(input.height),
): Spectrum {
  const width = nextFastSize(input.width + 2 * marginX);
  const height = nextFastSize(input.height + 2 * marginY);
  const xs = Int32Array.from({ length: width }, (_, i) =>
    borderIndex(i - marginX, input.width, border),
  );
  const re = new Float64Array(width * height);
  const im = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    const sy = borderIndex(j - marginY, input.height, border);
    if (sy < 0) continue;
    for (let i = 0; i < width; i++) {
      const sx = xs[i] ?? -1;
      if (sx >= 0) re[j * width + i] = input.data[sy * input.width + sx] ?? 0;
    }
  }
  fft2d(re, im, height, width, false);
  return {
    width,
    height,
    left: marginX,
    top: marginY,
    re,
    im,
    fx: fftFrequencies(width),
    fy: fftFrequencies(height),
  };
}

/** A copy of the spectrum multiplied by a real response. */
export function multiplied(spectrum: Spectrum, response: Response): [Float64Array, Float64Array] {
  const { width, height, fx, fy } = spectrum;
  const re = new Float64Array(spectrum.re);
  const im = new Float64Array(spectrum.im);
  for (let j = 0; j < height; j++) {
    const v = fy[j] ?? 0;
    for (let i = 0; i < width; i++) {
      const h = response(fx[i] ?? 0, v);
      const k = j * width + i;
      re[k] = (re[k] ?? 0) * h;
      im[k] = (im[k] ?? 0) * h;
    }
  }
  return [re, im];
}

export type Part = "real" | "imaginary" | "magnitude";

/**
 * The inverse FFT of a spectrum on the grid of `spectrum`, cropped to the image of size
 * width x height. Returns the real part, the imaginary part or the magnitude.
 */
export function inverseOf(
  spectrum: Spectrum,
  re: Float64Array,
  im: Float64Array,
  width: number,
  height: number,
  part: Part = "real",
): Plane {
  fft2d(re, im, spectrum.height, spectrum.width, true);
  const scale = 1 / (spectrum.width * spectrum.height);
  const out = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y + spectrum.top) * spectrum.width + x + spectrum.left;
      const a = (re[k] ?? 0) * scale;
      const b = (im[k] ?? 0) * scale;
      out.data[y * width + x] = part === "real" ? a : part === "imaginary" ? b : Math.hypot(a, b);
    }
  }
  return out;
}

/** Filter a plane with a response H(fx, fy). */
export function frequencyFilter(
  input: Plane,
  border: BorderMode,
  response: Response,
  part: Part = "real",
): Plane {
  const spectrum = spectrumOf(input, border);
  const [re, im] = multiplied(spectrum, response);
  return inverseOf(spectrum, re, im, input.width, input.height, part);
}

/**
 * The ring of each FFT bin: its distance from the center in steps of 1 / max(width, height),
 * rounded to a whole number. Returns the ring of each bin and the number of rings.
 */
export function ringsOf(spectrum: Spectrum): { ring: Int32Array; count: number } {
  const { width, height, fx, fy } = spectrum;
  const step = 1 / Math.max(width, height);
  const ring = new Int32Array(width * height);
  let count = 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const r = Math.floor(Math.hypot(fx[i] ?? 0, fy[j] ?? 0) / step + 0.5);
      ring[j * width + i] = r;
      count = Math.max(count, r + 1);
    }
  }
  return { ring, count };
}

/** Samples of a response for the Inspector. */
export interface ResponseSamples {
  /** Grid size. The grid runs from -0.5 to 0.5 cycles per pixel in fx and in fy. */
  readonly size: number;
  /** H on the grid, row by row, with fy growing downward. */
  readonly values: number[];
  /** H along the positive fx axis from 0 to 0.5. */
  readonly profile: number[];
}

export function sampleResponse(response: Response, size = 65, profileSize = 129): ResponseSamples {
  const values: number[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      values.push(response(-0.5 + i / (size - 1), -0.5 + j / (size - 1)));
    }
  }
  const profile = Array.from({ length: profileSize }, (_, i) =>
    response((0.5 * i) / (profileSize - 1), 0),
  );
  return { size, values, profile };
}
