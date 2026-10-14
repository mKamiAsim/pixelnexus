/**
 * The contract between a browser filter and the framework in run.ts.
 *
 * A filter says what kind of operation it is and supplies one small function. The framework
 * does the rest in the same way for every filter: border padding, channel scopes, alpha,
 * linear light and the mapping to 8 bits. The catalog entry with the same id describes the
 * filter for people. This file describes it for the code.
 */
import type { BorderMode, Plane } from "./planes";

export type ParamValue = number | string | boolean;
export type Params = Readonly<Record<string, ParamValue>>;

export type ChannelScope = "rgb" | "per-channel" | "luminance" | "chroma";
export type OutputMapping = "abs" | "offset" | "normalize" | "clip";

/** Where the plane sits in the full image. Noise uses it, so tiles give the same result. */
export interface PlaneContext {
  readonly border: BorderMode;
  /** Image x of the plane's first column. */
  readonly originX: number;
  /** Image y of the plane's first row. */
  readonly originY: number;
  /** Channel number: 0 red, 1 green, 2 blue, or 0 for a brightness plane. */
  readonly channel: number;
  /**
   * The red, green and blue planes of a guide image, padded like the input, for filters that
   * take their weights from another image, such as the joint bilateral filter.
   */
  readonly guide?: readonly [Plane, Plane, Plane];
}

/** One kernel as the Inspector shows it. It comes from the same function the filter runs. */
export interface KernelInfo {
  /** Short name, as LaTeX, for example "K_x". */
  readonly name: string;
  readonly rows: readonly (readonly number[])[];
  readonly anchor: { readonly x: number; readonly y: number };
  /** True when the weights add up to 1. */
  readonly normalized: boolean;
  /** Divide the shown whole numbers by this to get the weights, for fixed integer kernels. */
  readonly divisor?: number;
  /** Factors when the kernel is the outer product column x row. */
  readonly separable?: { readonly column: readonly number[]; readonly row: readonly number[] };
  /** A sentence about this kernel, such as how it relates to the filter. */
  readonly note?: string;
}

export type Representation =
  | { readonly kind: "kernels"; readonly kernels: readonly KernelInfo[] }
  | {
      readonly kind: "rank";
      readonly size: number;
      /** 1-based rank of the chosen value in the sorted window. */
      readonly rank: number;
      /** For a statistic of a run of ranks, such as a trimmed mean, the last rank it uses. */
      readonly rankTo?: number;
      readonly count: number;
      /** A sentence about how the chosen values become the output. */
      readonly note?: string;
    }
  | {
      /** A statistic of the window that is not a single rank, such as a mean or the mode. */
      readonly kind: "window";
      readonly size: number;
      readonly count: number;
      /** The statistic as LaTeX. */
      readonly statistic: string;
      readonly note: string;
      /** Weight of each window cell, for weighted statistics. */
      readonly weights?: readonly (readonly number[])[];
    }
  | {
      readonly kind: "curve";
      /** Output value for each input value from 0 to 255, before rounding. */
      readonly values: readonly number[];
    }
  | {
      readonly kind: "weights";
      readonly weights: readonly { readonly name: string; readonly value: number }[];
      readonly space: "encoded" | "linear";
    }
  | {
      /** A filter that repeats an update step. */
      readonly kind: "iterative";
      readonly iterations: number;
      /** The update step as LaTeX. */
      readonly update: string;
      readonly note: string;
    }
  | { readonly kind: "generator"; readonly description: string }
  | {
      readonly kind: "morphology";
      /** The structuring element as rows of 0 and 1, as the operation reads it. */
      readonly element: readonly (readonly number[])[];
      readonly anchor: { readonly x: number; readonly y: number };
      /** The operation as LaTeX. */
      readonly operation: string;
      /** For a single step, what it takes from the values under the element. */
      readonly statistic?: "min" | "max" | "range";
      readonly note: string;
    }
  | {
      /** A response H(fx, fy) that multiplies the spectrum. */
      readonly kind: "frequency";
      /** The response as LaTeX. */
      readonly formula: string;
      /** Grid size. The grid runs from -0.5 to 0.5 cycles per pixel in fx and in fy. */
      readonly size: number;
      /** H on the grid, row by row, with fy growing downward. */
      readonly values: readonly number[];
      /** H along the positive fx axis from 0 to 0.5 cycles per pixel. */
      readonly profile: readonly number[];
      readonly note: string;
    }
  | {
      readonly kind: "stages";
      /** The steps in order, each with a LaTeX formula. */
      readonly stages: readonly {
        readonly name: string;
        readonly formula: string;
        readonly note?: string;
      }[];
      readonly note?: string;
    };

interface FilterBase {
  /** The catalog id. */
  readonly id: string;
  /** Halo in pixels that a region needs around it. 0 for point and pixel operations. */
  radius(params: Params): number;
  /**
   * True when a pixel can depend on pixels anywhere in the image, as in hysteresis, which
   * follows edges as far as they go. Such filters always run on the whole image in one tile,
   * and the region is cut out of the result. Their radius is 0: they get the image itself and
   * extend it with the border mode where they need to.
   */
  readonly global?: boolean;
  /** The operator, for the Inspector. Built by the same code that the filter runs. */
  representation(params: Params): Representation;
}

/**
 * A neighborhood operation on one plane.
 * - "smooth" keeps the meaning of the values, as a blur or a median does. Results are clipped.
 * - "derived" computes a new signed quantity, as a gradient does. Results use the output mapping.
 */
export interface PlaneFilter extends FilterBase {
  readonly kind: "smooth" | "derived";
  /**
   * True for averaging filters with positive weights. On transparent images they average
   * colors weighted by alpha, so transparent pixels do not darken the result.
   */
  readonly alphaWeighted: boolean;
  plane(input: Plane, params: Params, context: PlaneContext): Plane;
  /**
   * For global point operations whose curve comes from the histogram of the whole plane, such
   * as histogram equalization: the output for each level 0 to 255, given the counts of the
   * levels. The Point-op curve widget draws it.
   */
  readonly pointTable?: (params: Params, histogram: ArrayLike<number>) => Float64Array;
  /**
   * For local point operations whose curve changes across the image, such as CLAHE: the curve
   * that applies at pixel (x, y) of the plane.
   */
  readonly pointTableAt?: (params: Params, plane: Plane, x: number, y: number) => Float64Array;
}

/**
 * A neighborhood operation that needs the three color planes together, such as a vector median.
 * It always works on red, green and blue. Results are clipped.
 */
export interface ColorFilter extends FilterBase {
  readonly kind: "color";
  color(
    planes: readonly [Plane, Plane, Plane],
    params: Params,
    context: PlaneContext,
  ): [Plane, Plane, Plane];
}

/** A function of one value, applied to every pixel. */
export interface PointFilter extends FilterBase {
  readonly kind: "point";
  /** The transfer function from 0..255 to a value that is clipped and rounded later. */
  transfer(params: Params): (value: number) => number;
}

/** A function of all three color values of one pixel, such as a grayscale conversion. */
export interface PixelFilter extends FilterBase {
  readonly kind: "pixel";
  /** Writes the new red, green and blue values into out. */
  pixel(r: number, g: number, b: number, params: Params, out: Float64Array): void;
}

/** Adds synthetic noise. Values depend on the image position and the seed, never on tiles. */
export interface NoiseFilter extends FilterBase {
  readonly kind: "noise";
  /** Changes the three color planes in place. */
  noise(
    color: readonly [Plane, Plane, Plane],
    params: Params,
    originX: number,
    originY: number,
  ): void;
}

export type BrowserFilter = PlaneFilter | ColorFilter | PointFilter | PixelFilter | NoiseFilter;

/**
 * Cache a value computed from the parameters, such as a color matrix, for as long as the same
 * parameter object is in use. Pixel filters run once per pixel with one parameter object, so the
 * value is computed once per run.
 */
export function perParams<T>(compute: (params: Params) => T): (params: Params) => T {
  const cache = new WeakMap<Params, T>();
  return (params) => {
    if (cache.has(params)) return cache.get(params) as T;
    const value = compute(params);
    cache.set(params, value);
    return value;
  };
}

/** Read parameters with a default, so filters never see undefined. */
export const read = {
  number(params: Params, key: string, fallback: number): number {
    const value = params[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  },
  string<T extends string>(params: Params, key: string, fallback: T): T {
    const value = params[key];
    return (typeof value === "string" ? value : fallback) as T;
  },
  boolean(params: Params, key: string, fallback: boolean): boolean {
    const value = params[key];
    return typeof value === "boolean" ? value : fallback;
  },
};
