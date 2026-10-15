import { describe, expect, it } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";

import { createPlane, rgbToYcc, yccToRgb } from "./planes";
import { browserFilter, BROWSER_FILTERS } from "./registry";
import { mapValue, runFilter, type Rect } from "./run";
import type { BrowserFilter, Params } from "./types";

/** A random RGBA image. With `alpha`, a quarter of the pixels are partly transparent. */
function randomImage(width: number, height: number, seed: number, alpha = false): RgbaImage {
  const random = mulberry32(seed);
  const image = createImage(width, height);
  for (let i = 0; i < image.data.length; i++) {
    const isAlpha = i % 4 === 3;
    image.data[i] = isAlpha
      ? alpha && random() < 0.25
        ? Math.floor(random() * 256)
        : 255
      : Math.floor(random() * 256);
  }
  return image;
}

function crop(image: RgbaImage, rect: Rect): RgbaImage {
  const out = createImage(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    out.data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return out;
}

const get = (id: string): BrowserFilter => {
  const filter = browserFilter(id);
  if (!filter) throw new Error(`No filter ${id}`);
  return filter;
};

const CASES: [string, Params][] = [
  ["box", { size: 5, border: "reflect101" }],
  ["box", { size: 3, border: "constant", channelScope: "luminance" }],
  ["gaussian", { sigma: 1.5, truncate: 3, border: "reflect" }],
  ["gaussian", { sigma: 2, truncate: 3, border: "wrap", channelScope: "chroma" }],
  ["gaussian", { sigma: 1, truncate: 3, linearLight: true }],
  ["motion-blur", { length: 9, angle: 30, border: "replicate" }],
  ["sobel", { output: "magnitude", outputMapping: "abs", channelScope: "luminance" }],
  ["sobel", { output: "gx", outputMapping: "offset", channelScope: "rgb", border: "constant" }],
  ["laplacian", { neighbors: "8", outputMapping: "clip" }],
  ["median", { size: 5, border: "reflect" }],
  ["median", { size: 3, channelScope: "luminance" }],
  ["unsharp-mask", { sigma: 1.2, amount: 1.5, threshold: 4 }],
  ["gamma", { gamma: 0.6 }],
  ["gamma", { gamma: 1.8, channelScope: "luminance" }],
  ["grayscale", { method: "luminance" }],
  ["noise-gaussian", { sigma: 20, seed: 3 }],
  ["noise-salt-pepper", { amount: 0.2, seed: 9 }],
  ["weighted-average", { kernel: "0 1 2 1 0; 1 2 4 2 1; 0 1 2 1 0", border: "reflect" }],
  [
    "weighted-average",
    { kernel: "-1 0 1; -2 0 2; -1 0 1", normalize: false, outputMapping: "abs" },
  ],
  ["binomial", { size: 7, border: "wrap" }],
  ["triangular", { size: 5, channelScope: "luminance" }],
  ["disk-average", { radius: 2.3, border: "replicate", linearLight: true }],
  ["fir-lowpass", { taps: 11, cutoff: 0.15, window: "kaiser", beta: 6 }],
  ["laplacian-sharpen", { neighbors: "8", amount: 0.7, border: "constant" }],
  ["high-pass", { sigma: 1.5, outputMapping: "offset", channelScope: "luminance" }],
  ["high-boost", { sigma: 1.5, boost: 1.7, channelScope: "chroma" }],
  ["min", { size: 5, border: "replicate" }],
  ["max", { size: 3, channelScope: "luminance" }],
  ["midpoint", { size: 5, border: "wrap" }],
  ["rank-order", { size: 5, by: "percentile", percentile: 80 }],
  ["mode", { size: 5, border: "reflect" }],
  ["alpha-trimmed-mean", { size: 5, trim: 4, border: "constant" }],
  ["geometric-mean", { size: 3, border: "constant" }],
  ["harmonic-mean", { size: 5, channelScope: "luminance" }],
  ["contraharmonic-mean", { size: 3, order: -1.5, border: "wrap" }],
  ["weighted-median", { weights: "1 2 3 2 1", border: "reflect" }],
  ["adaptive-median", { maxSize: 7, border: "replicate" }],
  ["switching-median", { size: 5, threshold: 30 }],
  ["vector-median", { size: 3, norm: "l1", border: "wrap" }],
  ["dead-pixel", { size: 5, threshold: 40, border: "constant" }],
  ["mad-outlier", { size: 5, t: 2.5, output: "mark" }],
  ["kuwahara", { size: 7, border: "reflect" }],
  ["nagao-matsuyama", { border: "constant" }],
  ["bilateral", { sigmaSpace: 1.5, sigmaRange: 40, range: "channel" }],
  ["bilateral", { sigmaSpace: 1, sigmaRange: 25, range: "color", border: "wrap" }],
  ["guided", { radius: 3, eps: 0.01, border: "replicate" }],
  ["guided", { radius: 2, eps: 0.001, channelScope: "luminance" }],
  ["anisotropic-diffusion", { iterations: 6, kappa: 20, lambda: 0.2, border: "reflect" }],
  ["vector-anisotropic-diffusion", { iterations: 5, kappa: 30, conduction: "quadratic" }],
  ["local-variance", { size: 5, outputMapping: "clip" }],
  ["local-std", { size: 3, channelScope: "luminance", border: "wrap" }],
  ["local-range", { size: 5, border: "constant" }],
  ["local-entropy", { size: 5, outputMapping: "abs" }],
  ["savgol", { size: 7, order: 3, border: "reflect" }],
  ["wiener-adaptive", { size: 5, noise: 15 }],
  ["adaptive-local-noise", { size: 3, noise: 20, border: "replicate" }],
  ["sigma", { size: 5, sigma: 15, k: 2, minCount: 3 }],
  ["adaptive-smoothing", { iterations: 3, k: 12, border: "reflect" }],
  ["lee", { size: 5, cu: 0.25 }],
  ["enhanced-lee", { size: 7, cu: 0.2, damping: 1.5, border: "replicate" }],
  ["kuan", { size: 5, cu: 0.3, channelScope: "luminance" }],
  ["frost", { size: 5, damping: 2, border: "wrap" }],
  ["gamma-map", { size: 7, cu: 0.25, border: "reflect" }],
  ["srad", { iterations: 5, dt: 0.15, q0: 0.3, rho: 0.2 }],
  ["noise-speckle", { sigma: 0.3, seed: 4 }],
  ["noise-poisson", { peak: 40, seed: 5 }],
  ["joint-bilateral", { sigmaSpace: 1.5, sigmaRange: 30, guideRange: "luma", border: "reflect" }],
  ["prewitt", { output: "magnitude", outputMapping: "abs", channelScope: "luminance" }],
  ["scharr", { output: "gx", outputMapping: "offset", border: "wrap" }],
  ["roberts", { output: "magnitude", norm: "l1", outputMapping: "abs" }],
  ["farid-simoncelli", { output: "gy", outputMapping: "offset", border: "reflect" }],
  ["kirsch", { output: "magnitude", outputMapping: "clip" }],
  ["robinson", { output: "direction", outputMapping: "offset", border: "replicate" }],
  ["frei-chen", { output: "edge", outputMapping: "clip", channelScope: "luminance" }],
  ["line-detector", { output: "max", outputMapping: "clip", border: "constant" }],
  ["laws", { vertical: "E5", horizontal: "L5", window: 5, outputMapping: "clip" }],
  ["dog", { sigma: 1.2, ratio: 1.6, outputMapping: "offset", channelScope: "luminance" }],
  ["log", { sigma: 1.5, outputMapping: "offset", border: "reflect" }],
  ["zero-crossing", { level: 128, threshold: 10, outputMapping: "clip" }],
  ["marr-hildreth", { sigma: 1.5, threshold: 1, outputMapping: "clip", border: "replicate" }],
  ["sobel-nms", { outputMapping: "abs", channelScope: "luminance", border: "wrap" }],
  ["hysteresis", { low: 100, high: 180, connectivity: "4", outputMapping: "clip" }],
  ["canny", { sigma: 1, low: 30, high: 80, outputMapping: "clip", border: "reflect" }],
  ["gabor", { wavelength: 5, angle: 30, sigma: 1.5, output: "imaginary", outputMapping: "offset" }],
  [
    "gabor-bank",
    {
      wavelength: 3,
      scales: 2,
      factor: 1.5,
      orientations: 3,
      output: "orientation",
      outputMapping: "clip",
    },
  ],
  ["steerable", { sigma: 1.5, order: "2", angle: 60, output: "steered", outputMapping: "offset" }],
  ["matched-vessel", { sigma: 1, length: 5, output: "angle", outputMapping: "clip" }],
  ["harris", { sigma: 1, output: "corners", distance: 2, threshold: 0.001, border: "wrap" }],
  ["shi-tomasi", { sigma: 1.5, output: "corners", threshold: 0.005, outputMapping: "clip" }],
  ["moravec", { window: 1, output: "corners", threshold: 0.2, outputMapping: "clip" }],
  ["fast", { n: 9, threshold: 0.1, output: "corners", border: "reflect" }],
  ["erosion", { element: "disk 2", iterations: 1, border: "reflect101" }],
  ["dilation", { element: "line 5 30", iterations: 2, border: "wrap" }],
  ["opening", { element: "rect 3 5", iterations: 1, border: "constant" }],
  ["closing", { element: "custom 1 1 0; 0 1 0; 0 0 1", iterations: 1, border: "reflect" }],
  ["morph-gradient", { element: "cross 1", iterations: 1, border: "replicate" }],
  ["internal-gradient", { element: "diamond 1", iterations: 1, border: "reflect101" }],
  ["external-gradient", { element: "ellipse 2 1", iterations: 1, border: "reflect101" }],
  ["tophat", { element: "disk 1", iterations: 2, border: "reflect101" }],
  ["blackhat", { element: "disk 1", iterations: 1, border: "wrap" }],
  ["reconstruction", { method: "erosion", h: 30, connectivity: "4" }],
  ["opening-by-reconstruction", { element: "disk 1", border: "reflect" }],
  ["closing-by-reconstruction", { element: "rect 3 3", border: "wrap" }],
  ["geodesic", { method: "dilation", h: 40, steps: 4 }],
  ["asf", { shape: "diamond", size: 2, order: "close-open" }],
  ["leveling", { sigma: 1, connectivity: "4" }],
  ["hit-or-miss", { pattern: "0 -1 -1; 1 1 -1; 0 1 0", border: "reflect" }],
  ["thinning", { method: "guo-hall" }],
  ["thickening", { method: "zhang-suen", iterations: 2 }],
  ["skeleton", { element: "disk 1" }],
  ["pruning", { length: 2 }],
  ["convex-hull", { connectivity: "4" }],
  ["ccl-filter", { connectivity: "8", minArea: 3, maxArea: 40 }],
  ["ideal-lowpass", { cutoff: 0.2 }],
  ["ideal-highpass", { cutoff: 0.1, border: "reflect101", outputMapping: "offset" }],
  ["ideal-bandpass", { center: 0.2, width: 0.1, outputMapping: "offset" }],
  ["ideal-bandreject", { center: 0.25, width: 0.1, border: "wrap" }],
  ["butterworth-lowpass", { cutoff: 0.1, order: 2 }],
  ["butterworth-highpass", { cutoff: 0.15, order: 3, outputMapping: "abs" }],
  ["butterworth-bandpass", { center: 0.2, width: 0.1, order: 2, outputMapping: "offset" }],
  ["butterworth-bandreject", { center: 0.3, width: 0.05, order: 1, border: "constant" }],
  ["gaussian-lowpass", { cutoff: 0.08 }],
  ["gaussian-highpass", { cutoff: 0.1, outputMapping: "offset" }],
  ["gaussian-bandpass", { center: 0.2, width: 0.1, outputMapping: "offset" }],
  ["gaussian-bandreject", { center: 0.2, width: 0.1, border: "replicate" }],
  ["notch-reject", { notches: "0.2 0.1; -0.3 0.25", shape: "gaussian", radius: 0.03 }],
  ["notch-pass", { notches: "0.25 0", shape: "ideal", radius: 0.05, outputMapping: "offset" }],
  ["comb", { fx: 0.1, fy: 0.05, harmonics: 3, shape: "butterworth", radius: 0.02, order: 2 }],
  ["periodic-noise", { minFrequency: 0.08, threshold: 1, maxPeaks: 4, radius: 0.03 }],
  ["noise-periodic", { amplitude: 30, fx: 0.13, fy: -0.07, phase: 40 }],
  [
    "homomorphic",
    { gammaLow: 0.5, gammaHigh: 2, sharpness: 1, cutoff: 0.1, outputMapping: "offset" },
  ],
  ["phase-only", { outputMapping: "abs" }],
  ["spectral-whitening", { strength: 0.7, outputMapping: "offset" }],
  [
    "log-gabor",
    {
      wavelength: 6,
      sigmaOnf: 0.55,
      angle: 30,
      angularSigma: 25,
      output: "real",
      outputMapping: "offset",
    },
  ],
  ["log-gabor", { wavelength: 5, oriented: false, outputMapping: "offset" }],
  ["wiener-denoise", { noiseSigma: 20 }],
  ["degrade-blur", { psf: "motion", length: 7, angle: 30, border: "reflect" }],
  ["degrade-blur", { psf: "defocus", radius: 2.3 }],
  ["inverse-filter", { psf: "gaussian", sigma: 1.5, cutoff: 0.3, threshold: 0.05 }],
  ["wiener-deconv", { psf: "motion", length: 5, angle: 0, noiseRatio: 0.01 }],
  ["tikhonov", { psf: "gaussian", sigma: 1.2, lambda: 0.02, operator: "gradient" }],
  ["cls", { psf: "defocus", radius: 2, noiseSigma: 4 }],
  ["richardson-lucy", { psf: "gaussian", sigma: 1.2, iterations: 5 }],
  ["regularized-rl", { psf: "gaussian", sigma: 1.2, iterations: 4, lambda: 0.01 }],
  ["landweber", { psf: "motion", length: 5, angle: 45, iterations: 4, tau: 1.5 }],
  ["gaussian-pyramid", { levels: 2 }],
  ["laplacian-pyramid", { levels: 3, gain1: 2, gain2: 1.5, gain3: 0.5, gain4: 1 }],
  ["scale-space", { measure: "hessian", sigma: 1, sigmaMax: 2, scales: 3 }],
  ["log-transform", {}],
  ["contrast-stretch", { r1: 50, s1: 20, r2: 200, s2: 230 }],
  ["percentile-normalize", { low: 2, high: 98 }],
  ["invert", {}],
  ["histogram-eq", { channelScope: "luminance" }],
  ["posterize", { levels: 5 }],
  ["solarize", { threshold: 100 }],
  ["clahe", { tilesX: 3, tilesY: 2, clipLimit: 2 }],
  ["ahe", { tilesX: 4, tilesY: 4, channelScope: "luminance" }],
  ["bw-mix", { red: 40, green: 40, blue: 20 }],
  ["sepia", { amount: 80 }],
  ["saturation", { saturation: 200 }],
  ["vibrance", { vibrance: 60 }],
  ["hue-rotate", { angle: 45 }],
  ["hsv-adjust", { hue: 30, saturation: 120, value: 90 }],
  ["channel-mixer", { redFromGreen: 30, redFromRed: 70 }],
  ["color-balance", { shadowsCyanRed: 40, highlightsYellowBlue: -30 }],
  ["white-balance", { neutral: "#c0b0a0" }],
  ["gray-world", { linearLight: true }],
  ["white-patch", { percentile: 98 }],
  ["chromatic-adaptation", { source: "D50", target: "D65", method: "von-kries" }],
  ["temperature-tint", { temperature: 3500, tint: 5 }],
  ["retinex-ssr", { sigma: 6 }],
  ["retinex-msr", { sigma1: 2, sigma2: 5, sigma3: 9, apply: "intensity" }],
  ["msrcr", { sigma1: 2, sigma2: 5, sigma3: 9, clipLow: 2, clipHigh: 0.5 }],
  ["bilateral-tonemap", { contrast: 4, spatial: 10, range: 0.3, downsample: 2 }],
  ["detail-enhance", { radius: 3, eps: 0.02, boost: 3 }],
  ["chroma-denoise", { method: "median", size: 3 }],
  ["chroma-denoise", { method: "gaussian", sigma: 1.5 }],
  ["demosaic", { pattern: "grbg", method: "malvar" }],
  ["demosaic", { pattern: "bggr", method: "bilinear" }],
  ["color-threshold", { hueMin: 300, hueMax: 60, satMin: 20 }],
  ["threshold-global", { threshold: 120, invert: true }],
  ["otsu", {}],
  ["threshold-adaptive-mean", { size: 7, offset: 3 }],
  ["threshold-adaptive-gaussian", { size: 9, offset: 2 }],
  ["niblack", { size: 7, k: -0.2 }],
  ["sauvola", { size: 7, k: 0.4, r: 128 }],
  ["oil-painting", { radius: 2, levels: 10 }],
  ["pencil-sketch", { sigma: 2.5, colored: true }],
  ["cartoon", { sigmaSpace: 1, passes: 1, lineSize: 5 }],
  ["halftone", { cell: 5, angle: 30 }],
  ["bloom", { threshold: 50, sigma: 2 }],
  ["bokeh", { radius: 2.5, threshold: 60 }],
  ["tilt-shift", { maxBlur: 2 }],
  ["fisheye", { fov: 140 }],
  ["barrel", { strength: 0.5 }],
  ["pincushion", { strength: 0.2, fit: false }],
  ["swirl", { strength: 2, radius: 8 }],
  ["ripple", { amplitude: 2, wavelength: 5 }],
  ["wave", { amplitude: 2, wavelength: 6, direction: "both" }],
  ["wolf", { size: 7, k: 0.4 }],
  ["bradley", { size: 9, percent: 10 }],
  ["region-growing", { seedX: 30, seedY: 60, tolerance: 60, measure: "color" }],
  ["kmeans-color", { k: 3, iterations: 10 }],
  ["ccl", { connectivity: "4", output: "gray" }],
  ["emboss", {}],
  ["outline", {}],
  ["edge-enhance", { strength: "more" }],
  ["vignette", { amount: 70, start: 20 }],
  ["pixelate", { size: 4 }],
  ["dithering", { method: "atkinson", levels: 3 }],
  ["dithering", { method: "bayer8" }],
  ["nnls-deconv", { psf: "defocus", radius: 1.5, iterations: 4, tau: 1 }],
];

describe("a region gives the same pixels as the whole image", () => {
  const image = randomImage(23, 17, 1, true);
  const regions: Rect[] = [
    { x: 0, y: 0, width: 5, height: 4 },
    { x: 7, y: 3, width: 9, height: 8 },
    { x: 18, y: 12, width: 5, height: 5 },
  ];
  it.each(CASES.map(([id, params]) => [`${id} ${JSON.stringify(params)}`, id, params] as const))(
    "%s",
    (_name, id, params) => {
      const whole = runFilter(image, get(id), params).image;
      for (const region of regions) {
        // Normalize mapping depends on the region by design, so it is excluded here.
        expect(runFilter(image, get(id), params, region).image.data).toEqual(
          crop(whole, region).data,
        );
      }
    },
  );

  it("gives the same pixels with a guide image", () => {
    const guide = randomImage(23, 17, 2);
    const params = { sigmaSpace: 1, sigmaRange: 30, guideRange: "color" };
    const whole = runFilter(image, get("joint-bilateral"), params, undefined, guide).image;
    for (const region of regions) {
      expect(runFilter(image, get("joint-bilateral"), params, region, guide).image.data).toEqual(
        crop(whole, region).data,
      );
    }
  });

  it("runs a global filter on the whole image", () => {
    // Each value minus the plane mean, so every pixel depends on the whole image.
    const centered = (global: boolean): BrowserFilter => ({
      id: "centered",
      kind: "derived",
      alphaWeighted: false,
      global,
      radius: () => 1,
      plane: (input) => {
        const mean = input.data.reduce((a, b) => a + b, 0) / input.data.length;
        return { ...input, data: input.data.map((v) => v - mean) };
      },
      representation: () => ({ kind: "generator", description: "Each value minus the mean." }),
    });
    const params = { outputMapping: "offset" };
    const whole = runFilter(image, centered(true), params).image;
    for (const region of regions) {
      expect(runFilter(image, centered(true), params, region).image.data).toEqual(
        crop(whole, region).data,
      );
    }
    const local = runFilter(image, centered(false), params, regions[1]).image.data;
    expect(local).not.toEqual(crop(whole, regions[1] as Rect).data);
  });

  it("covers every registered filter", () => {
    const tested = new Set(CASES.map(([id]) => id));
    expect(BROWSER_FILTERS.filter((f) => !tested.has(f.id)).map((f) => f.id)).toEqual([]);
  });
});

describe("channels and alpha", () => {
  it("keeps alpha unchanged, except in filters that move pixels", () => {
    const image = randomImage(12, 9, 2, true);
    for (const [id, params] of CASES) {
      const filter = get(id);
      if ("movesAlpha" in filter && filter.movesAlpha) continue;
      const out = runFilter(image, filter, params).image;
      for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(image.data[i]);
    }
  });

  it("does not let hidden colors of transparent pixels bleed into a blur", () => {
    // Opaque red on the left, fully transparent green on the right.
    const image = createImage(10, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 10; x++) {
        const o = (y * 10 + x) * 4;
        image.data.set(x < 5 ? [255, 0, 0, 255] : [0, 255, 0, 0], o);
      }
    }
    const out = runFilter(image, get("gaussian"), { sigma: 2, truncate: 3 }).image;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 5; x++) {
        const o = (y * 10 + x) * 4;
        expect([out.data[o], out.data[o + 1], out.data[o + 2]]).toEqual([255, 0, 0]);
      }
    }
  });

  it("gives the same result for an opaque image with or without alpha weighting", () => {
    // Opaque images never use alpha weighting, so the result must match plain correlation.
    const image = randomImage(11, 8, 3);
    const out = runFilter(image, get("box"), { size: 3 }).image;
    const o = (4 * 11 + 5) * 4;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) sum += image.data[((4 + dy) * 11 + 5 + dx) * 4] ?? 0;
    }
    expect(out.data[o]).toBe(Math.round(sum / 9));
  });

  it("round-trips Y'CbCr exactly", () => {
    const r = createPlane(4, 1);
    const g = createPlane(4, 1);
    const b = createPlane(4, 1);
    r.data.set([0, 255, 12, 200]);
    g.data.set([0, 255, 240, 10]);
    b.data.set([0, 255, 33, 99]);
    const [r2, g2, b2] = yccToRgb(...rgbToYcc(r, g, b));
    [r, g, b].forEach((plane, c) =>
      plane.data.forEach((v, i) => expect([r2, g2, b2][c]?.data[i]).toBeCloseTo(v, 3)),
    );
  });

  it("changes only brightness with the brightness scope on a gray image", () => {
    const image = createImage(9, 9);
    for (let i = 0; i < 81; i++) image.data.set([i * 3, i * 3, i * 3, 255], i * 4);
    const scoped = runFilter(image, get("gaussian"), { sigma: 1, channelScope: "luminance" }).image;
    const rgb = runFilter(image, get("gaussian"), { sigma: 1, channelScope: "rgb" }).image;
    scoped.data.forEach((v, i) => expect(Math.abs(v - (rgb.data[i] ?? 0))).toBeLessThanOrEqual(1));
  });

  it("gives a gray result for gradients of brightness", () => {
    const image = randomImage(8, 8, 4);
    const out = runFilter(image, get("sobel"), { channelScope: "luminance" }).image;
    for (let o = 0; o < out.data.length; o += 4) {
      expect(out.data[o]).toBe(out.data[o + 1]);
      expect(out.data[o + 1]).toBe(out.data[o + 2]);
    }
  });

  it("reports that linear light is RGB only", () => {
    const result = runFilter(randomImage(5, 5, 5), get("gaussian"), {
      linearLight: true,
      channelScope: "luminance",
    });
    expect(result.warnings).toHaveLength(1);
  });
});

describe("output mapping", () => {
  it("maps signed values to 8 bits", () => {
    expect(mapValue(-30.4, "abs")).toBe(30);
    expect(mapValue(-30.4, "offset")).toBe(98);
    expect(mapValue(-30.4, "clip")).toBe(0);
    expect(mapValue(300, "clip")).toBe(255);
    expect(mapValue(5, "normalize", { min: -5, max: 15 })).toBe(128);
    expect(mapValue(3, "normalize", { min: 3, max: 3 })).toBe(0);
    expect(mapValue(Number.NaN, "abs")).toBe(0);
  });

  it("stretches the full result range with normalize", () => {
    const image = randomImage(16, 12, 6);
    const out = runFilter(image, get("sobel"), {
      channelScope: "luminance",
      outputMapping: "normalize",
    }).image;
    const values = Array.from(out.data.filter((_, i) => i % 4 === 0));
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(255);
  });
});

describe("noise", () => {
  const flat = createImage(256, 256);
  for (let i = 0; i < flat.data.length; i += 4) flat.data.set([128, 128, 128, 255], i);

  const stats = (image: RgbaImage) => {
    const values = Array.from(image.data.filter((_, i) => i % 4 === 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return { mean, sd: Math.sqrt(variance) };
  };

  it("scales speckle with the brightness", () => {
    const { mean, sd } = stats(
      runFilter(flat, get("noise-speckle"), { sigma: 0.1, seed: 7 }).image,
    );
    expect(mean).toBeCloseTo(128, 0);
    // Standard deviation 128 x 0.1, plus a little from rounding.
    expect(Math.abs(sd - 12.8)).toBeLessThan(0.3);
  });

  it("gives Poisson noise whose variance matches the photon count", () => {
    // Mean 128 x 40 / 255 = 20.08 photons. The value is k x 255 / 40, so its standard deviation
    // is sqrt(20.08) x 255 / 40 = 28.57 levels.
    const { mean, sd } = stats(runFilter(flat, get("noise-poisson"), { peak: 40, seed: 8 }).image);
    expect(Math.abs(mean - 128)).toBeLessThan(0.6);
    expect(Math.abs(sd - 28.57)).toBeLessThan(0.6);
  });

  it("has the requested standard deviation", () => {
    const out = runFilter(flat, get("noise-gaussian"), { sigma: 10, seed: 1 }).image;
    const values = Array.from(out.data.filter((_, i) => i % 4 === 0));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeCloseTo(128, 0);
    // Rounding to whole levels adds a variance of 1/12, so allow a small margin.
    expect(Math.abs(sd - 10)).toBeLessThan(0.3);
  });

  it("changes the requested share of pixels to salt and pepper", () => {
    const out = runFilter(flat, get("noise-salt-pepper"), {
      amount: 0.1,
      salt: 0.5,
      seed: 2,
    }).image;
    let salt = 0;
    let pepper = 0;
    for (let o = 0; o < out.data.length; o += 4) {
      if (out.data[o] === 255) salt++;
      if (out.data[o] === 0) pepper++;
    }
    const n = 256 * 256;
    expect(Math.abs((salt + pepper) / n - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(salt / (salt + pepper) - 0.5)).toBeLessThan(0.05);
  });

  it("depends on the seed", () => {
    const a = runFilter(flat, get("noise-gaussian"), { seed: 1 }).image.data;
    const b = runFilter(flat, get("noise-gaussian"), { seed: 1 }).image.data;
    const c = runFilter(flat, get("noise-gaussian"), { seed: 2 }).image.data;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
