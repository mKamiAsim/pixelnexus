/**
 * The Gabor filter. Catalog entry: catalog/filters/linear/gabor.yaml.
 *
 * A Gabor kernel is a complex wave under a Gaussian envelope:
 *
 *   g(x, y) = exp(-(x'^2 / sx^2 + y'^2 / sy^2) / 2) exp(i 2 pi x' / lambda) / (2 pi sx sy)
 *   x' = x cos t - y sin t,   y' = x sin t + y cos t
 *
 * with sx = sigma and sy = sigma / gamma. The y axis points down, so the angle t turns
 * counterclockwise on screen, like the Motion blur angle. The kernel size, the 3-sigma extent
 * and the normalization follow skimage.filters.gabor_kernel. The filter correlates the image
 * with the real and the imaginary part, through the FFT because the kernels are large. scikit-image convolves, so its imaginary part has the
 * opposite sign.
 */
import { planeSpectrum, type Kernel2d } from "@/core/filters/convolve";
import { createPlane, type Plane, type BorderMode } from "@/core/filters/planes";
import { read, type KernelInfo, type Params, type PlaneFilter } from "@/core/filters/types";

/** The envelope reaches this many standard deviations, as in scikit-image. */
const N_STDS = 3;

export interface GaborSettings {
  readonly wavelength: number;
  readonly angle: number;
  readonly sigma: number;
  readonly aspect: number;
}

/** The real and imaginary kernels, with half widths x0 and y0. */
export function gaborKernels({ wavelength, angle, sigma, aspect }: GaborSettings): {
  re: Kernel2d;
  im: Kernel2d;
} {
  const theta = (angle * Math.PI) / 180;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const sx = sigma;
  const sy = sigma / aspect;
  const x0 = Math.ceil(Math.max(Math.abs(N_STDS * sx * ct), Math.abs(N_STDS * sy * st), 1));
  const y0 = Math.ceil(Math.max(Math.abs(N_STDS * sy * ct), Math.abs(N_STDS * sx * st), 1));
  const width = 2 * x0 + 1;
  const height = 2 * y0 + 1;
  const re = new Float64Array(width * height);
  const im = new Float64Array(width * height);
  const scale = 1 / (2 * Math.PI * sx * sy);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = i - x0;
      const y = j - y0;
      const xr = x * ct - y * st;
      const yr = x * st + y * ct;
      const envelope = scale * Math.exp(-0.5 * ((xr * xr) / (sx * sx) + (yr * yr) / (sy * sy)));
      const phase = (2 * Math.PI * xr) / wavelength;
      re[j * width + i] = envelope * Math.cos(phase);
      im[j * width + i] = envelope * Math.sin(phase);
    }
  }
  const kernel = (weights: Float64Array): Kernel2d => ({
    width,
    height,
    weights,
    anchorX: x0,
    anchorY: y0,
  });
  return { re: kernel(re), im: kernel(im) };
}

export type GaborOutput = "real" | "imaginary" | "magnitude";

/** The chosen Gabor output of one plane. */
export function gaborPlane(
  input: Plane,
  settings: GaborSettings,
  output: GaborOutput,
  border: BorderMode,
): Plane {
  const { re, im } = gaborKernels(settings);
  const [a, b] = planeSpectrum(input, Math.max(re.anchorX, re.anchorY), border).correlate(re, im);
  if (output === "real") return a;
  if (output === "imaginary") return b;
  const out = createPlane(input.width, input.height);
  for (let i = 0; i < out.data.length; i++)
    out.data[i] = Math.hypot(a.data[i] ?? 0, b.data[i] ?? 0);
  return out;
}

export const settingsOf = (params: Params): GaborSettings => ({
  wavelength: read.number(params, "wavelength", 8),
  angle: read.number(params, "angle", 0),
  sigma: read.number(params, "sigma", 4),
  aspect: read.number(params, "aspect", 1),
});

const outputOf = (params: Params) => read.string<GaborOutput>(params, "output", "magnitude");

function kernelInfo(name: string, kernel: Kernel2d, note: string): KernelInfo {
  const rows = Array.from({ length: kernel.height }, (_, j) =>
    Array.from(kernel.weights.slice(j * kernel.width, (j + 1) * kernel.width)),
  );
  return {
    name,
    rows,
    anchor: { x: kernel.anchorX, y: kernel.anchorY },
    normalized: false,
    note,
  };
}

export const gaborFilter: PlaneFilter = {
  id: "gabor",
  kind: "derived",
  alphaWeighted: false,
  radius: (params) => {
    const { re } = gaborKernels(settingsOf(params));
    return Math.max(re.anchorX, re.anchorY);
  },
  plane: (input, params, { border }) =>
    gaborPlane(input, settingsOf(params), outputOf(params), border),
  representation: (params) => {
    const { re, im } = gaborKernels(settingsOf(params));
    const output = outputOf(params);
    const magnitude = "The magnitude is the square root of the sum of both squared responses.";
    return {
      kind: "kernels",
      kernels: [
        ...(output === "imaginary"
          ? []
          : [kernelInfo("G_{re}", re, output === "magnitude" ? magnitude : "The cosine part.")]),
        ...(output === "real"
          ? []
          : [kernelInfo("G_{im}", im, output === "magnitude" ? magnitude : "The sine part.")]),
      ],
    };
  },
};
