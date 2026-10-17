// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type * as EngineClient from "@/engine-client";
import { createImage, type RgbaImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import { activeDocument, useDocuments } from "@/state/documents";
import { useNotices } from "@/state/notifications";

/** A fake job: every filter adds its sigma to the red channel of the region. */
const runJob = vi.fn(
  async (job: {
    image: RgbaImage;
    values: Record<string, unknown>;
    region: { x: number; y: number; width: number; height: number };
  }) => {
    const { region } = job;
    const out = createImage(region.width, region.height);
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const from = ((region.y + y) * job.image.width + region.x + x) * 4;
        const to = (y * region.width + x) * 4;
        out.data.set(job.image.data.subarray(from, from + 4), to);
        out.data[to] = (job.image.data[from] ?? 0) + Number(job.values.sigma);
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

const { deleteHistoryStep, deleteProblem } = await import("./historyActions");

function openImage() {
  useDocuments.getState().open({
    name: "test.png",
    source: "sample",
    fileBytes: 0,
    header: null,
    warnings: [],
    original: createImage(2, 1),
  });
  const doc = activeDocument();
  if (!doc) throw new Error("no document");
  return doc.id;
}

/** Apply a fake Gaussian step that adds sigma to red, as Apply would record it. */
function gaussian(id: string, sigma: number) {
  const doc = activeDocument();
  if (!doc) throw new Error("no document");
  const image = createImage(2, 1);
  image.data.set(doc.current.data);
  image.data[0] = (image.data[0] ?? 0) + sigma;
  image.data[4] = (image.data[4] ?? 0) + sigma;
  useDocuments
    .getState()
    .edit(id, image, `Gaussian ${sigma}`, { id: "gaussian", params: { sigma } });
}

const reds = () => {
  const data = activeDocument()?.current.data;
  return [data?.[0], data?.[4]];
};

describe("deleting a history step", () => {
  it("recomputes the later steps from the step before", async () => {
    const id = openImage();
    gaussian(id, 1);
    gaussian(id, 2);
    gaussian(id, 4);
    expect(reds()).toEqual([7, 7]);
    await deleteHistoryStep(id, 2);
    const doc = activeDocument();
    expect(doc?.steps.map((s) => s.label)).toEqual(["Open", "Gaussian 1", "Gaussian 4"]);
    expect(doc?.index).toBe(2);
    expect(reds()).toEqual([5, 5]);
    expect(runJob).toHaveBeenCalledTimes(1);
  });

  it("keeps later selection steps and uses them for scoped filters", async () => {
    runJob.mockClear();
    const id = openImage();
    gaussian(id, 1);
    const selection = createMask(2, 1);
    selection.data[1] = 255;
    useDocuments.getState().select(id, selection, "Select");
    const doc = activeDocument();
    if (!doc) throw new Error("no document");
    const image = createImage(2, 1);
    image.data.set(doc.current.data);
    image.data[4] = 9;
    useDocuments
      .getState()
      .edit(id, image, "Gaussian 8 inside", {
        id: "gaussian",
        params: { sigma: 8 },
        scope: "selection",
      });
    await deleteHistoryStep(id, 1);
    expect(activeDocument()?.steps.map((s) => s.label)).toEqual([
      "Open",
      "Select",
      "Gaussian 8 inside",
    ]);
    expect(reds()).toEqual([0, 8]);
  });

  it("refuses when a later step cannot be run again, and never deletes the original", () => {
    const id = openImage();
    gaussian(id, 1);
    useDocuments.getState().edit(id, createImage(1, 2), "Rotate 90 clockwise");
    const doc = activeDocument();
    if (!doc) throw new Error("no document");
    expect(deleteProblem(doc, 0)).toBe("The original cannot be deleted.");
    expect(deleteProblem(doc, 1)).toBe(
      "Step 2, Rotate 90 clockwise, comes later. It cannot be run again.",
    );
    expect(deleteProblem(doc, 2)).toBeNull();
  });

  it("changes nothing when a recompute fails", async () => {
    const id = openImage();
    gaussian(id, 1);
    gaussian(id, 2);
    const before = activeDocument()?.steps;
    runJob.mockRejectedValueOnce(new Error("The worker stopped."));
    await deleteHistoryStep(id, 1);
    expect(activeDocument()?.steps).toBe(before);
    expect(useNotices.getState().notices.at(-1)?.detail).toContain("The worker stopped.");
  });
});

describe("freeing memory", () => {
  it("keeps the original and the current step", () => {
    const id = openImage();
    gaussian(id, 1);
    gaussian(id, 2);
    gaussian(id, 3);
    useDocuments.getState().undo(id);
    useDocuments.getState().purgeHistory(id);
    const doc = activeDocument();
    expect(doc?.steps.map((s) => s.label)).toEqual(["Open", "Gaussian 2"]);
    expect(doc?.index).toBe(1);
    expect(doc?.dropped).toBe(2);
  });
});
