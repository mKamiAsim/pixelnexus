/**
 * The browser engine: runs filters from web/src/core in a pool of Web Workers.
 *
 * A job is split into horizontal strips. Each strip is padded with a halo as wide as the
 * filter's support radius, so every strip gives exactly the pixels of a whole-image run.
 * The normalize mapping needs the value range of the whole result, so it runs in two passes:
 * first every strip reports its range, then every strip maps its values with the joint range.
 */
import { browserFilter } from "@/core/filters/registry";
import {
  borderOf,
  fullRect,
  joinRanges,
  mappingOf,
  padRegion,
  runFilter,
  type Rect,
  type ValueRange,
} from "@/core/filters/run";
import { hasTransparency } from "@/core/image/encode";
import type { RgbaImage } from "@/core/image/types";
import { WorkerPool, type TileTask } from "@/core/workers/pool";

import {
  EngineError,
  type EngineClient,
  type FilterJob,
  type JobOptions,
  type JobResult,
} from "./types";

/** Aim for at least this many pixels per tile, so messages do not cost more than the work. */
const TILE_PIXELS = 65_536;

/** Split a region into strips. Strips are at least 4 halos high, so padding stays cheap. */
export function planStrips(region: Rect, halo: number, workers: number): Rect[] {
  const pixels = region.width * region.height;
  const count = Math.max(1, Math.min(workers * 4, Math.ceil(pixels / TILE_PIXELS)));
  const rows = Math.max(Math.ceil(region.height / count), 4 * halo, 8);
  const strips: Rect[] = [];
  for (let y = region.y; y < region.y + region.height; y += rows) {
    strips.push({
      x: region.x,
      y,
      width: region.width,
      height: Math.min(rows, region.y + region.height - y),
    });
  }
  return strips;
}

/** A memory budget for one job: a quarter of the device memory, at most 2 GB. */
export function memoryBudget(): number {
  const deviceGb =
    typeof navigator !== "undefined" && "deviceMemory" in navigator
      ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 4
      : 4;
  return Math.min(2 * 1024 ** 3, (deviceGb * 1024 ** 3) / 4);
}

/**
 * Bytes a job needs at most: the result, plus for each busy worker its padded tile and about
 * twelve float planes of the same size for inputs, outputs and temporary values.
 */
export function estimateJobBytes(region: Rect, halo: number, workers: number): number {
  const strips = planStrips(region, halo, workers);
  const tallest = Math.max(...strips.map((s) => s.height));
  const tilePixels = (region.width + 2 * halo) * (tallest + 2 * halo);
  return (
    region.width * region.height * 4 + Math.min(workers, strips.length) * tilePixels * (4 + 12 * 4)
  );
}

const transparency = new WeakMap<RgbaImage, boolean>();

function isTransparent(image: RgbaImage): boolean {
  let known = transparency.get(image);
  if (known === undefined) {
    known = hasTransparency(image);
    transparency.set(image, known);
  }
  return known;
}

let sharedPool: WorkerPool | null = null;

function pool(): WorkerPool | null {
  if (typeof Worker === "undefined") return null;
  sharedPool ??= new WorkerPool();
  return sharedPool;
}

export class BrowserEngine implements EngineClient {
  readonly name = "browser" as const;

  constructor(private readonly getPool: () => WorkerPool | null = pool) {}

  async run(job: FilterJob, options: JobOptions = {}): Promise<JobResult> {
    const started = performance.now();
    const filter = browserFilter(job.filterId);
    if (!filter) throw new EngineError(`The browser engine has no filter "${job.filterId}".`);
    const region = job.region ?? fullRect(job.image);
    const { params, image } = job;
    const halo = filter.radius(params);
    const workerPool = this.getPool();
    const workers = workerPool?.size ?? 1;

    const needed = estimateJobBytes(region, halo, workers);
    const budget = memoryBudget();
    if (needed > budget) {
      const mb = (bytes: number) => Math.round(bytes / 1024 ** 2);
      throw new EngineError(
        `This job needs about ${mb(needed)} MB, more than the ${mb(budget)} MB this device allows. Use a smaller image.`,
      );
    }

    // Without workers (for example in a test environment), run in this thread.
    if (!workerPool) {
      const output = runFilter(image, filter, params, region);
      const totalMs = performance.now() - started;
      options.onProgress?.(1);
      return {
        region,
        image: output.image,
        warnings: output.warnings,
        timing: { totalMs, computeMs: totalMs, tiles: 1, workers: 1 },
      };
    }

    const strips = planStrips(region, halo, workers);
    const transparent = isTransparent(image);
    const border = borderOf(params);
    const mapping = mappingOf(params);
    const twoPass = filter.kind === "derived" && mapping === "normalize";
    const passes = twoPass ? 2 : 1;
    let computeMs = 0;

    const tasks = (statsOnly: boolean, range?: ValueRange): TileTask[] =>
      strips.map((strip) => () => {
        const padded = padRegion(image, strip, halo, border);
        return {
          type: "tile",
          filterId: filter.id,
          params,
          width: padded.width,
          height: padded.height,
          buffer: padded.data.buffer,
          halo,
          core: strip,
          transparent,
          mapping,
          range,
          statsOnly,
        };
      });
    const progress = (pass: number) => (_r: unknown, done: number, total: number) =>
      options.onProgress?.((pass + done / total) / passes);

    let range: ValueRange | undefined;
    if (twoPass) {
      const stats = await workerPool.run(tasks(true), {
        signal: options.signal,
        onTile: progress(0),
      });
      for (const result of stats) {
        computeMs += result.ms;
        if (result.type === "tile-stats") {
          range = range ? joinRanges(range, result.range) : result.range;
        }
      }
    }

    const results = await workerPool.run(tasks(false, range), {
      signal: options.signal,
      onTile: progress(passes - 1),
    });
    const data = new Uint8ClampedArray(region.width * region.height * 4);
    const warnings = new Set<string>();
    results.forEach((result, index) => {
      const strip = strips[index];
      if (result.type !== "tile-done" || !strip) return;
      computeMs += result.ms;
      result.warnings.forEach((w) => warnings.add(w));
      data.set(new Uint8ClampedArray(result.buffer), (strip.y - region.y) * region.width * 4);
    });
    return {
      region,
      image: { width: region.width, height: region.height, data },
      warnings: [...warnings],
      timing: {
        totalMs: performance.now() - started,
        computeMs,
        tiles: strips.length * passes,
        workers: Math.min(workers, strips.length),
      },
    };
  }
}
