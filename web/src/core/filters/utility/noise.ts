/**
 * Noise generators for testing denoising filters. Catalog entries:
 * catalog/filters/utility/noise-gaussian.yaml, noise-salt-pepper.yaml, noise-speckle.yaml and
 * noise-poisson.yaml.
 *
 * Every random number depends only on the seed and the pixel position, so a tiled run and a
 * whole-image run give the same pixels, and the same seed always gives the same noise.
 */
import { poissonSample } from "@/core/math/poisson";
import { positionNormal, positionUniform } from "@/core/math/random";
import { read, type NoiseFilter, type Params } from "@/core/filters/types";

const seedOf = (params: Params) => Math.round(read.number(params, "seed", 1));

/** I_out = I + sigma * n, with n drawn from a standard normal distribution. */
export const gaussianNoiseFilter: NoiseFilter = {
  id: "noise-gaussian",
  kind: "noise",
  radius: () => 0,
  noise: (color, params, originX, originY) => {
    const sigma = read.number(params, "sigma", 10);
    const mono = read.boolean(params, "monochrome", false);
    const seed = seedOf(params);
    const { width, height } = color[0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const gx = originX + x;
        const gy = originY + y;
        const shared = mono ? positionNormal(seed, gx, gy, 0) : 0;
        color.forEach((plane, c) => {
          const n = mono ? shared : positionNormal(seed, gx, gy, c);
          plane.data[i] = (plane.data[i] ?? 0) + sigma * n;
        });
      }
    }
  },
  representation: (params) => ({
    kind: "generator",
    description: `Adds a normal random value with mean 0 and standard deviation ${read.number(params, "sigma", 10)} to each ${read.boolean(params, "monochrome", false) ? "pixel, the same for all three channels" : "channel of each pixel"}.`,
  }),
};

/** With probability amount, a pixel becomes white (salt) or black (pepper). */
export const saltPepperNoiseFilter: NoiseFilter = {
  id: "noise-salt-pepper",
  kind: "noise",
  radius: () => 0,
  noise: (color, params, originX, originY) => {
    const amount = read.number(params, "amount", 0.05);
    const salt = read.number(params, "salt", 0.5);
    const seed = seedOf(params);
    const { width, height } = color[0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gx = originX + x;
        const gy = originY + y;
        if (positionUniform(seed, gx, gy, 0) >= amount) continue;
        const value = positionUniform(seed, gx, gy, 1) < salt ? 255 : 0;
        const i = y * width + x;
        for (const plane of color) plane.data[i] = value;
      }
    }
  },
  representation: (params) => ({
    kind: "generator",
    description: `Each pixel becomes white or black with probability ${read.number(params, "amount", 0.05)}. Of those, a fraction ${read.number(params, "salt", 0.5)} become white.`,
  }),
};

/** I_out = I + I * sigma * n: multiplicative noise with mean 1, as in skimage's "speckle" mode. */
export const speckleNoiseFilter: NoiseFilter = {
  id: "noise-speckle",
  kind: "noise",
  radius: () => 0,
  noise: (color, params, originX, originY) => {
    const sigma = read.number(params, "sigma", 0.2);
    const mono = read.boolean(params, "monochrome", false);
    const seed = seedOf(params);
    const { width, height } = color[0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const gx = originX + x;
        const gy = originY + y;
        const shared = mono ? positionNormal(seed, gx, gy, 0) : 0;
        color.forEach((plane, c) => {
          const n = mono ? shared : positionNormal(seed, gx, gy, c);
          const v = plane.data[i] ?? 0;
          plane.data[i] = v + v * sigma * n;
        });
      }
    }
  },
  representation: (params) => ({
    kind: "generator",
    description: `Multiplies each ${read.boolean(params, "monochrome", false) ? "pixel, the same for all three channels," : "channel of each pixel"} by 1 + ${read.number(params, "sigma", 0.2)} n, with n a normal random value of mean 0 and standard deviation 1. Dark areas get little noise, bright areas a lot.`,
  }),
};

/**
 * Photon noise: each value v becomes k * 255 / peak, where k is a Poisson number with mean
 * v * peak / 255. peak is the photon count of white. Fewer photons give more noise.
 */
export const poissonNoiseFilter: NoiseFilter = {
  id: "noise-poisson",
  kind: "noise",
  radius: () => 0,
  noise: (color, params, originX, originY) => {
    const peak = Math.max(0.01, read.number(params, "peak", 50));
    const seed = seedOf(params);
    const { width, height } = color[0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const gx = originX + x;
        const gy = originY + y;
        color.forEach((plane, c) => {
          const lambda = (Math.max(0, plane.data[i] ?? 0) * peak) / 255;
          // Streams 100 and up keep these uniforms apart from the other noise generators.
          const k = poissonSample(lambda, (n) => positionUniform(seed, gx, gy, 100 + 64 * c + n));
          plane.data[i] = (k * 255) / peak;
        });
      }
    }
  },
  representation: (params) => ({
    kind: "generator",
    description: `Counts photons: white holds ${read.number(params, "peak", 50)} photons on average, and each channel of each pixel gets a Poisson number with the mean for its value. The noise standard deviation grows with the square root of the brightness.`,
  }),
};
