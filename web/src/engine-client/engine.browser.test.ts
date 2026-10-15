import { describe, expect, it } from "vitest";

import { browserFilter } from "@/core/filters/registry";
import { runFilter } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { createImage, type RgbaImage } from "@/core/image/types";
import { mulberry32 } from "@/core/math/random";
import { WorkerPool } from "@/core/workers/pool";

import { BrowserEngine, planStrips } from "./browser";
import { EngineError, filterEntry, prepareParams, runJob, scienceEngine } from "./index";

function randomImage(width: number, height: number, seed: number): RgbaImage {
  const random = mulberry32(seed);
  const image = createImage(width, height);
  for (let i = 0; i < image.data.length; i++) {
    image.data[i] = i % 4 === 3 ? (random() < 0.1 ? 128 : 255) : Math.floor(random() * 256);
  }
  return image;
}

// Four workers and a 300x420 image, so every job runs as several strips.
const pool = new WorkerPool(4);
const engine = new BrowserEngine(() => pool);
const image = randomImage(300, 420, 1);

const direct = (id: string, params: Params, region?: Parameters<typeof runFilter>[3]) => {
  const filter = browserFilter(id);
  if (!filter) throw new Error(id);
  return runFilter(image, filter, params, region).image.data;
};

describe("browser engine with workers", () => {
  it("splits jobs into several strips", () => {
    expect(planStrips({ x: 0, y: 0, width: 300, height: 420 }, 2, 4).length).toBeGreaterThan(1);
  });

  it.each([
    ["gaussian", { sigma: 2.5, border: "reflect" }],
    ["median", { size: 7 }],
    ["motion-blur", { length: 15, angle: 60 }],
    ["sobel", { channelScope: "luminance", outputMapping: "normalize" }],
    ["laplacian", { channelScope: "rgb", outputMapping: "normalize", border: "wrap" }],
    ["unsharp-mask", { sigma: 3, amount: 1.2, threshold: 2 }],
    ["noise-gaussian", { sigma: 15, seed: 4 }],
    ["grayscale", { method: "luma601" }],
  ] as [string, Params][])("%s gives the same bytes as a whole-image run", async (id, params) => {
    const result = await engine.run({ filterId: id, params, image });
    expect(result.timing.tiles).toBeGreaterThan(1);
    expect(result.image.data).toEqual(direct(id, params));
  });

  it("sends a guide image with every strip", async () => {
    const guide = randomImage(300, 420, 9);
    const params = { sigmaSpace: 1.5, sigmaRange: 25, guideRange: "color" };
    const result = await engine.run({ filterId: "joint-bilateral", params, image, guide });
    expect(result.timing.tiles).toBeGreaterThan(1);
    const filter = browserFilter("joint-bilateral");
    if (!filter) throw new Error("joint-bilateral");
    const whole = runFilter(image, filter, params, undefined, guide).image.data;
    expect(result.image.data).toEqual(whole);
    // The guide changes the result.
    expect(result.image.data).not.toEqual(direct("joint-bilateral", params));
  });

  it("runs a region", async () => {
    const region = { x: 40, y: 75, width: 130, height: 210 };
    const result = await engine.run({ filterId: "gaussian", params: { sigma: 3 }, image, region });
    expect(result.region).toEqual(region);
    expect(result.image.data).toEqual(direct("gaussian", { sigma: 3 }, region));
  });

  it("runs a global filter on the whole image in one tile", async () => {
    const region = { x: 40, y: 75, width: 130, height: 210 };
    const params = { sigma: 1.5, low: 20, high: 60, outputMapping: "clip" };
    const result = await engine.run({ filterId: "canny", params, image, region });
    expect(result.timing.tiles).toBe(1);
    expect(result.image.data).toEqual(direct("canny", params, region));
    // The region is cut from the whole-image result, not computed on its own.
    const whole = direct("canny", params);
    const row = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
      data.subarray((y * width + x) * 4, (y * width + x + region.width) * 4);
    expect(row(result.image.data, region.width, 0, 5)).toEqual(
      row(whole, image.width, region.x, region.y + 5),
    );
  });

  it("reports progress up to 1", async () => {
    const seen: number[] = [];
    await engine.run(
      { filterId: "box", params: { size: 5 }, image },
      { onProgress: (fraction) => seen.push(fraction) },
    );
    expect(seen.at(-1)).toBe(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("cancels a job, and the pool keeps working", async () => {
    const big = randomImage(900, 900, 2);
    const controller = new AbortController();
    const job = engine.run(
      { filterId: "median", params: { size: 25 }, image: big },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 5);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    const after = await engine.run({ filterId: "box", params: { size: 3 }, image });
    expect(after.image.data).toEqual(direct("box", { size: 3 }));
  });

  it("refuses a job that is larger than the memory budget", async () => {
    const huge = { width: 200_000, height: 200_000, data: new Uint8ClampedArray(4) };
    await expect(engine.run({ filterId: "box", params: {}, image: huge })).rejects.toBeInstanceOf(
      EngineError,
    );
  });
});

describe("engine client", () => {
  it("validates parameters against the catalog before running", async () => {
    const { values, warnings } = prepareParams(filterEntry("median"), { size: 4, extra: 1 });
    expect(values).toMatchObject({ size: 5, border: "reflect101" });
    expect(values).not.toHaveProperty("extra");
    expect(warnings.join(" ")).toMatch(/Window size/);
    const result = await engine.run({ filterId: "median", params: values, image });
    expect(result.image.data).toEqual(direct("median", { size: 5 }));
  });

  it("refuses filters that are only planned", async () => {
    await expect(runJob({ filterId: "dncnn", values: {}, image })).rejects.toBeInstanceOf(
      EngineError,
    );
  });

  it("explains how to start the science engine when it does not answer", async () => {
    await expect(scienceEngine.run({ filterId: "bm3d", params: {}, image })).rejects.toThrow(
      /uv run pixelnexus-engine/,
    );
  });
});
