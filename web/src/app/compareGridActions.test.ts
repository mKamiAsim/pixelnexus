// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as EngineClient from "@/engine-client";
import { createImage, type RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

const runJob = vi.fn(async (job: { image: RgbaImage }) => ({
  image: job.image,
  region: { x: 0, y: 0, width: job.image.width, height: job.image.height },
  warnings: [],
  timing: { totalMs: 1, computeMs: 1, tiles: 1, workers: 1 },
}));
vi.mock("@/engine-client", async (original) => ({
  ...(await original<typeof EngineClient>()),
  runJob: (job: never) => runJob(job),
}));

const {
  addCurrentSettings,
  addSweep,
  applyCellSettings,
  clearGrid,
  cropArea,
  runGrid,
  useCompareGrid,
} = await import("./compareGridActions");

beforeEach(() => {
  clearGrid();
  runJob.mockClear();
});

describe("compare grid", () => {
  it("crops 256 x 256 around the point, kept inside the image", () => {
    expect(cropArea({ width: 1000, height: 800 }, null)).toEqual({
      x: 372,
      y: 272,
      width: 256,
      height: 256,
    });
    expect(cropArea({ width: 1000, height: 800 }, { x: 990, y: 5 })).toEqual({
      x: 744,
      y: 0,
      width: 256,
      height: 256,
    });
    expect(cropArea({ width: 100, height: 50 }, null)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it("adds a sweep with the other values kept, and runs every cell on the crop", async () => {
    useDocuments.getState().open({
      name: "test.png",
      source: "sample",
      fileBytes: 0,
      header: null,
      warnings: [],
      original: createImage(600, 400),
    });
    useFilters.getState().select("gaussian");
    addCurrentSettings();
    addSweep("sigma", [1, 2, 3]);
    const { cells } = useCompareGrid.getState();
    expect(cells.map((c) => c.values.sigma)).toEqual([1, 1, 2, 3]);
    expect(new Set(cells.map((c) => c.values.border)).size).toBe(1);
    useUi.getState().setProbe({ documentId: activeDocument()?.id ?? "", x: 10, y: 10 });
    await runGrid();
    expect(runJob).toHaveBeenCalledTimes(4);
    const { crop, results } = useCompareGrid.getState();
    expect([crop?.x, crop?.y, crop?.image.width]).toEqual([0, 0, 256]);
    expect(Object.values(results).every((r) => r.state === "done")).toBe(true);
  });

  it("copies a cell's values into Properties", () => {
    useFilters.getState().select("gaussian");
    addSweep("sigma", [4]);
    const cell = useCompareGrid.getState().cells[0];
    if (!cell) throw new Error("no cell");
    applyCellSettings(cell);
    expect(useFilters.getState().values.gaussian?.sigma).toBe(4);
  });
});
