// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { catalog } from "@/catalog";
import type * as EngineClient from "@/engine-client";
import { createImage, type RgbaImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useNotices } from "@/state/notifications";
import { usePipeline } from "@/state/pipeline";

/** A fake job: every filter adds 10 to every color channel of the region. */
const runJob = vi.fn(
  async (job: {
    image: RgbaImage;
    region: { x: number; y: number; width: number; height: number };
  }) => {
    const { region } = job;
    const out = createImage(region.width, region.height);
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const from = ((region.y + y) * job.image.width + region.x + x) * 4;
        const to = (y * region.width + x) * 4;
        for (let c = 0; c < 3; c++) out.data[to + c] = (job.image.data[from + c] ?? 0) + 10;
        out.data[to + 3] = 255;
      }
    }
    return {
      image: out,
      region,
      warnings: [],
      timing: { totalMs: 1, computeMs: 1, tiles: 1, workers: 1 },
    };
  },
);
vi.mock("@/engine-client", async (original) => ({
  ...(await original<typeof EngineClient>()),
  runJob: (job: never) => runJob(job),
}));

const {
  pipelineFromHistory,
  pipelineProblem,
  runPipelineOnActive,
  validateStep,
  addSelectedFilter,
} = await import("./pipelineActions");

const entry = (id: string) => {
  const found = catalog.filters.find((f) => f.id === id);
  if (!found) throw new Error(`no filter ${id}`);
  return found;
};

function openImage() {
  const original = createImage(2, 1);
  original.data.set([0, 0, 0, 255, 0, 0, 0, 255]);
  useDocuments.getState().open({
    name: "test.png",
    source: "sample",
    fileBytes: 0,
    header: null,
    warnings: [],
    original,
  });
  const doc = activeDocument();
  if (!doc) throw new Error("no document");
  return doc;
}

const lastNotice = () => useNotices.getState().notices.at(-1);

beforeEach(() => {
  runJob.mockClear();
  usePipeline.getState().replace([]);
});

describe("pipeline steps", () => {
  it("accepts image filters and refuses tables, commands and planned filters", () => {
    expect(pipelineProblem(entry("gaussian"))).toBeNull();
    const command = catalog.filters.find((f) => f.command);
    const table = catalog.filters.find((f) => f.output === "table" || f.output === "features");
    if (command) expect(pipelineProblem(command)).toMatch(/own dialog/);
    if (table) expect(pipelineProblem(table)).toMatch(/table or features/);
    expect(pipelineProblem({ ...entry("gaussian"), status: "planned" })).toMatch(/cannot run yet/);
  });

  it("validates saved values against the catalog", () => {
    const checked = validateStep("gaussian", { sigma: 3 });
    expect(typeof checked === "string" ? checked : checked.values.sigma).toBe(3);
    expect(validateStep("no-such-filter", {})).toBe(
      "no-such-filter is not a filter in this studio.",
    );
  });

  it("adds the selected filter with its current values", () => {
    useFilters.getState().select("gaussian");
    addSelectedFilter();
    expect(usePipeline.getState().steps.map((s) => s.filterId)).toEqual(["gaussian"]);
  });
});

describe("running a pipeline", () => {
  it("runs from the original, adds one history step, and reuses cached steps", async () => {
    const doc = openImage();
    useFilters.getState().select("gaussian");
    addSelectedFilter();
    addSelectedFilter();
    await runPipelineOnActive();
    expect(runJob).toHaveBeenCalledTimes(2);
    expect(activeDocument()?.current.data[0]).toBe(20);
    expect(activeDocument()?.steps.at(-1)?.label).toBe("Pipeline (2 steps)");
    // A second run starts from the original again, so the result is the same, from the cache.
    await runPipelineOnActive();
    expect(runJob).toHaveBeenCalledTimes(2);
    expect(activeDocument()?.current.data[0]).toBe(20);
    expect(activeDocument()?.id).toBe(doc.id);
  });

  it("works inside the selection only, for a step with that scope", async () => {
    const doc = openImage();
    const selection = createMask(2, 1);
    selection.data[1] = 255;
    useDocuments.getState().select(doc.id, selection, "Select");
    useFilters.getState().select("gaussian");
    useFilters.getState().setScope("selection");
    addSelectedFilter();
    await runPipelineOnActive();
    const out = activeDocument()?.current;
    expect([out?.data[0], out?.data[4]]).toEqual([0, 10]);
  });

  it("names the failed step and adds nothing", async () => {
    openImage();
    useFilters.getState().select("gaussian");
    addSelectedFilter();
    runJob.mockRejectedValueOnce(new Error("The worker stopped."));
    const before = activeDocument()?.steps.length;
    await runPipelineOnActive();
    expect(lastNotice()?.detail).toBe("Step 1 failed: The worker stopped.");
    expect(activeDocument()?.steps.length).toBe(before);
  });

  it("makes a pipeline from the filter steps of the history", () => {
    const doc = openImage();
    useDocuments
      .getState()
      .edit(doc.id, createImage(2, 1), "Gaussian", { id: "gaussian", params: { sigma: 2 } });
    useDocuments.getState().edit(doc.id, createImage(2, 1), "Crop");
    pipelineFromHistory();
    expect(usePipeline.getState().steps.map((s) => [s.filterId, s.params.sigma])).toEqual([
      ["gaussian", 2],
    ]);
  });
});
