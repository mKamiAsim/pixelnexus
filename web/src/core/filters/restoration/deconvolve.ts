/**
 * A known blur and its direct inverses. Catalog entries: catalog/filters/utility/degrade-blur.yaml
 * and catalog/filters/restoration/{inverse-filter,wiener-deconv}.yaml.
 *
 * The blur, or point spread function (PSF), is a Gaussian, a straight motion or a defocus disk.
 * Its kernels are the ones of the Gaussian, motion blur and disk averaging filters. All three
 * are symmetric under a half turn, so correlation and convolution with them are the same.
 *
 * The deconvolution filters work in the frequency domain on the image extended with the border
 * mode, as the frequency filters do. H is the transform of the PSF placed with its center at the
 * origin of the FFT grid. Inverse filtering divides by H where it is large enough and within a
 * cutoff radius. Wiener deconvolution multiplies by conj(H) / (|H|^2 + K), as in Gonzalez and
 * Woods.
 */
import { fft2d } from "@/core/math/fft";
import { correlate2d, kernelFromRows, kernelRows, type Kernel2d } from "@/core/filters/convolve";
import { gaussianKernel2d } from "@/core/filters/linear/gaussian";
import { diskKernel } from "@/core/filters/linear/disk-average";
import { motionKernel } from "@/core/filters/linear/motion-blur";
import { inverseOf, spectrumOf, type Spectrum } from "@/core/filters/frequency/spectral";
import type { BorderMode, Plane } from "@/core/filters/planes";
import { read, type Params, type PlaneFilter } from "@/core/filters/types";

export type PsfShape = "gaussian" | "motion" | "defocus";

/** The Gaussian PSF ends at 4 sigma, so its tail is kept for deconvolution. */
export const PSF_TRUNCATE = 4;

/** The PSF of the parameters: psf, and sigma, length and angle, or radius. */
export function psfKernel(params: Params): Kernel2d {
  const shape = read.string<PsfShape>(params, "psf", "gaussian");
  if (shape === "motion") {
    return motionKernel(read.number(params, "length", 9), read.number(params, "angle", 0));
  }
  if (shape === "defocus") return kernelFromRows(diskKernel(read.number(params, "radius", 3)));
  return kernelFromRows(gaussianKernel2d(read.number(params, "sigma", 2), PSF_TRUNCATE));
}

/** The transform H of a kernel placed with its anchor at the origin of an FFT grid. */
export function transferOf(
  kernel: Kernel2d,
  width: number,
  height: number,
): [Float64Array, Float64Array] {
  const re = new Float64Array(width * height);
  const im = new Float64Array(width * height);
  for (let j = 0; j < kernel.height; j++) {
    for (let i = 0; i < kernel.width; i++) {
      const y = (((j - kernel.anchorY) % height) + height) % height;
      const x = (((i - kernel.anchorX) % width) + width) % width;
      re[y * width + x] = (re[y * width + x] ?? 0) + (kernel.weights[j * kernel.width + i] ?? 0);
    }
  }
  fft2d(re, im, height, width, false);
  return [re, im];
}

/** A gain for each frequency from the transfer value h and the frequency, as [re, im]. */
type Gain = (hr: number, hi: number, fx: number, fy: number) => readonly [number, number];

/** Multiply the spectrum of the extended plane by a gain built from H, and transform back. */
export function deconvolve(input: Plane, border: BorderMode, kernel: Kernel2d, gain: Gain): Plane {
  const spectrum: Spectrum = spectrumOf(input, border);
  const { width, height, fx, fy } = spectrum;
  const [hr, hi] = transferOf(kernel, width, height);
  const re = new Float64Array(spectrum.re);
  const im = new Float64Array(spectrum.im);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const [gr, gi] = gain(hr[k] ?? 0, hi[k] ?? 0, fx[i] ?? 0, fy[j] ?? 0);
      const a = re[k] ?? 0;
      const b = im[k] ?? 0;
      re[k] = a * gr - b * gi;
      im[k] = a * gi + b * gr;
    }
  }
  return inverseOf(spectrum, re, im, input.width, input.height);
}

/** 1 / H within the cutoff radius where |H| reaches the threshold, and 0 elsewhere. */
export function inverseGain(cutoff: number, threshold: number): Gain {
  return (hr, hi, fx, fy) => {
    const power = hr * hr + hi * hi;
    if (Math.sqrt(fx * fx + fy * fy) > cutoff || Math.sqrt(power) < threshold) return [0, 0];
    return [hr / power, -hi / power];
  };
}

/** conj(H) / (|H|^2 + K). */
export function wienerGain(k: number): Gain {
  return (hr, hi) => {
    const denominator = hr * hr + hi * hi + k;
    return [hr / denominator, -hi / denominator];
  };
}

function psfDescription(params: Params): string {
  const shape = read.string<PsfShape>(params, "psf", "gaussian");
  if (shape === "motion") {
    return `a straight motion of ${read.number(params, "length", 9)} px at ${read.number(params, "angle", 0)} degrees`;
  }
  if (shape === "defocus") return `a defocus disk of radius ${read.number(params, "radius", 3)} px`;
  return `a Gaussian with sigma ${read.number(params, "sigma", 2)} px, cut at 4 sigma`;
}

const psfInfo = (params: Params, note: string) => {
  const kernel = psfKernel(params);
  return {
    name: "h",
    rows: kernelRows(kernel),
    anchor: { x: kernel.anchorX, y: kernel.anchorY },
    normalized: true,
    note: `The PSF: ${psfDescription(params)}. ${note}`,
  };
};

export const degradeBlurFilter: PlaneFilter = {
  id: "degrade-blur",
  kind: "smooth",
  alphaWeighted: false,
  radius: (params) => (psfKernel(params).width - 1) / 2,
  plane: (input, params, { border }) => correlate2d(input, psfKernel(params), border),
  representation: (params) => ({
    kind: "kernels",
    kernels: [psfInfo(params, "The image is convolved with it.")],
  }),
};

const cutoffOf = (params: Params) => read.number(params, "cutoff", 0.71);
const thresholdOf = (params: Params) => read.number(params, "threshold", 0.05);
const noiseRatioOf = (params: Params) => read.number(params, "noiseRatio", 0.01);

export const inverseFilter: PlaneFilter = {
  id: "inverse-filter",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    deconvolve(
      input,
      border,
      psfKernel(params),
      inverseGain(cutoffOf(params), thresholdOf(params)),
    ),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Spectrum",
        formula: "G = \\mathcal{F}\\{g_{\\text{ext}}\\},\\quad H = \\mathcal{F}\\{h\\}",
      },
      {
        name: "Divide",
        formula: `\\hat{F}(f) = \\begin{cases} G(f) / H(f) & |f| \\le ${cutoffOf(params)},\\ |H(f)| \\ge ${thresholdOf(params)} \\\\ 0 & \\text{otherwise} \\end{cases}`,
        note: "Frequencies where the blur left almost nothing cannot be divided back, so they are set to 0.",
      },
      { name: "Result", formula: "\\hat{f} = \\operatorname{Re} \\mathcal{F}^{-1}\\{\\hat{F}\\}" },
    ],
    note: `The PSF is ${psfDescription(params)}.`,
  }),
};

export const wienerDeconvFilter: PlaneFilter = {
  id: "wiener-deconv",
  kind: "smooth",
  alphaWeighted: false,
  global: true,
  radius: () => 0,
  plane: (input, params, { border }) =>
    deconvolve(input, border, psfKernel(params), wienerGain(noiseRatioOf(params))),
  representation: (params) => ({
    kind: "stages",
    stages: [
      {
        name: "Spectrum",
        formula: "G = \\mathcal{F}\\{g_{\\text{ext}}\\},\\quad H = \\mathcal{F}\\{h\\}",
      },
      {
        name: "Wiener",
        formula: `\\hat{F}(f) = \\frac{\\overline{H(f)}}{|H(f)|^2 + K}\\, G(f),\\quad K = ${noiseRatioOf(params)}`,
        note: "K is the ratio of noise power to image power. Where |H|^2 is much larger than K this is the inverse filter, and where it is smaller the frequency is turned down.",
      },
      { name: "Result", formula: "\\hat{f} = \\operatorname{Re} \\mathcal{F}^{-1}\\{\\hat{F}\\}" },
    ],
    note: `The PSF is ${psfDescription(params)}.`,
  }),
};
