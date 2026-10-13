/**
 * One interface for running filters, whichever engine runs them. The studio never talks to an
 * engine directly. It sends a job and gets back the filtered region, timing and warnings.
 */
import type { Mask } from "@/core/composite/compose";
import type { Rect } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";

export interface FilterJob {
  readonly filterId: string;
  /** Validated parameter values. See validateParams in catalog/params.ts. */
  readonly params: Params;
  readonly image: RgbaImage;
  /** The part of the image to compute. The whole image when left out. */
  readonly region?: Rect;
  /** Selection mask, from Phase 4. The compositor applies it after the engine runs. */
  readonly mask?: Mask | null;
  /** A guide image of the same size as `image`, for filters with an image parameter. */
  readonly guide?: RgbaImage;
}

export interface JobOptions {
  readonly signal?: AbortSignal;
  /** Called with a fraction from 0 to 1 as tiles finish. */
  readonly onProgress?: (fraction: number) => void;
}

export interface JobTiming {
  /** From the call to the result, in milliseconds. */
  readonly totalMs: number;
  /** Time spent inside the filter, summed over tiles. Larger than totalMs when tiles overlap. */
  readonly computeMs: number;
  readonly tiles: number;
  readonly workers: number;
}

export interface JobResult {
  readonly region: Rect;
  /** The filtered region, region-sized. The compositor puts it into the image. */
  readonly image: RgbaImage;
  readonly warnings: readonly string[];
  readonly timing: JobTiming;
}

export interface EngineClient {
  readonly name: "browser" | "science";
  run(job: FilterJob, options?: JobOptions): Promise<JobResult>;
}

/** An error with a message written for the person using the studio. */
export class EngineError extends Error {
  override name = "EngineError";
}
