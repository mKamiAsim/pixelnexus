/**
 * Built-in test images. Each one is generated in code, so there are no license questions and
 * every pixel is known. They are chosen to show what filters do: edges, frequencies, noise,
 * small objects, color and transparency.
 */
import { hsvToRgb } from "@/core/color/convert";
import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32, normalSampler } from "@/core/math/random";

export interface SyntheticImage {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly make: (width?: number, height?: number) => RgbaImage;
}

const DEFAULT_SIZE = 512;
const SEED = 20261011;

/** Fill an opaque gray image from a function of (x, y) that returns 0 to 255. */
function grayImage(width: number, height: number, value: (x: number, y: number) => number) {
  const image = createImage(width, height);
  const { data } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = value(x, y);
      const o = (y * width + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return image;
}

/** Average a function over a 4x4 grid inside each pixel, to smooth hard shapes. */
function supersample(f: (x: number, y: number) => number): (x: number, y: number) => number {
  const n = 4;
  return (x, y) => {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) sum += f(x + (i + 0.5) / n, y + (j + 0.5) / n);
    }
    return sum / (n * n);
  };
}

export function stepEdge(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const edge = Math.floor(width / 2);
  return grayImage(width, height, (x) => (x < edge ? 40 : 215));
}

export function ramp(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  return grayImage(width, height, (x) => Math.round((255 * x) / Math.max(1, width - 1)));
}

export function checkerboard(width = DEFAULT_SIZE, height = DEFAULT_SIZE, cell = 32): RgbaImage {
  return grayImage(width, height, (x, y) =>
    (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 230 : 25,
  );
}

/**
 * Zone plate: cos(pi r^2 / N). The local frequency grows with the distance r from the center
 * and reaches the Nyquist limit of 0.5 cycles per pixel at r = N / 2.
 */
export function zonePlate(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const n = Math.min(width, height);
  return grayImage(width, height, (x, y) => {
    const r2 = (x - cx) ** 2 + (y - cy) ** 2;
    return Math.round(127.5 * (1 + Math.cos((Math.PI * r2) / n)));
  });
}

/** Siemens star with 36 spokes. Shows how filters and resampling treat fine detail. */
export function siemensStar(width = DEFAULT_SIZE, height = DEFAULT_SIZE, spokes = 36): RgbaImage {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.45;
  const shape = supersample((x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > radius * radius) return 128;
    return Math.sin((spokes / 2) * Math.atan2(dy, dx)) >= 0 ? 235 : 20;
  });
  return grayImage(width, height, (x, y) => Math.round(shape(x, y)));
}

/** Bright disks of several sizes on a dark background, plus single-pixel dots. */
export function disks(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const s = Math.min(width, height) / 512;
  const shapes = [
    { x: 96, y: 96, r: 48 },
    { x: 256, y: 96, r: 24 },
    { x: 384, y: 96, r: 12 },
    { x: 448, y: 96, r: 6 },
    { x: 128, y: 320, r: 72 },
    { x: 352, y: 320, r: 36 },
  ].map((d) => ({ x: d.x * s, y: d.y * s, r: d.r * s }));
  const dots = [
    [300, 220],
    [420, 230],
    [460, 440],
    [60, 460],
  ].map(([x, y]) => [Math.round((x ?? 0) * s), Math.round((y ?? 0) * s)] as const);
  const shape = supersample((x, y) =>
    shapes.some((d) => (x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) ? 220 : 30,
  );
  const image = grayImage(width, height, (x, y) => Math.round(shape(x, y)));
  for (const [x, y] of dots) {
    const o = (y * width + x) * 4;
    image.data.fill(220, o, o + 3);
  }
  return image;
}

/**
 * Four flat gray quadrants: clean, Gaussian noise (sigma 20), salt-and-pepper noise (10 percent)
 * and multiplicative speckle noise. Good for comparing denoising filters.
 */
export function noisePatches(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const uniform = mulberry32(SEED);
  const normal = normalSampler(uniform);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  return grayImage(width, height, (x, y) => {
    const base = 128;
    if (x < midX && y < midY) return base;
    if (x >= midX && y < midY) return Math.round(base + 20 * normal());
    if (x < midX) {
      const u = uniform();
      return u < 0.05 ? 0 : u < 0.1 ? 255 : base;
    }
    return Math.round(base * (1 + Math.sqrt(0.1) * normal()));
  });
}

/** Hue changes from left to right. Saturation falls from top to bottom. */
export function hueSweep(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const image = createImage(width, height);
  for (let y = 0; y < height; y++) {
    const saturation = 1 - y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = hsvToRgb((360 * x) / width, saturation, 1);
      const o = (y * width + x) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
    }
  }
  return image;
}

/** A colored disk whose alpha fades from opaque in the middle to transparent at the edge. */
export function softAlphaDisk(width = DEFAULT_SIZE, height = DEFAULT_SIZE): RgbaImage {
  const image = createImage(width, height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) * 0.45;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      const o = (y * width + x) * 4;
      image.data[o] = 230;
      image.data[o + 1] = 120;
      image.data[o + 2] = 40;
      image.data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - d)) ** 0.5);
    }
  }
  return image;
}

export const SYNTHETIC_IMAGES: readonly SyntheticImage[] = [
  { id: "step-edge", name: "Step edge", description: "One sharp vertical edge.", make: stepEdge },
  { id: "ramp", name: "Gray ramp", description: "Brightness from black to white.", make: ramp },
  {
    id: "checkerboard",
    name: "Checkerboard",
    description: "Squares with sharp corners.",
    make: checkerboard,
  },
  {
    id: "zone-plate",
    name: "Zone plate",
    description: "Rings whose frequency rises toward the edge.",
    make: zonePlate,
  },
  {
    id: "siemens-star",
    name: "Siemens star",
    description: "Spokes that get finer toward the center.",
    make: siemensStar,
  },
  {
    id: "disks",
    name: "Disks and dots",
    description: "Objects of many sizes for shape tools.",
    make: disks,
  },
  {
    id: "noise-patches",
    name: "Noise patches",
    description: "Clean, Gaussian, salt-and-pepper and speckle noise.",
    make: noisePatches,
  },
  {
    id: "hue-sweep",
    name: "Hue sweep",
    description: "Every hue, from full color to gray.",
    make: hueSweep,
  },
  {
    id: "soft-alpha-disk",
    name: "Soft alpha disk",
    description: "Transparency that fades out.",
    make: softAlphaDisk,
  },
];
