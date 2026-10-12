// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { catalog } from "@/catalog";
import { stepEdge } from "@/core/image/synthetic";
import { activeDocument, useDocuments } from "@/state/documents";

import { exportSuffix, filterById, stepLabel } from "./filterActions";
import { FULL_PREVIEW_PIXELS, planPreview, scaleParams } from "./preview";

const entry = (id: string) => {
  const found = catalog.filters.find((f) => f.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("step labels and export names", () => {
  beforeEach(() => useDocuments.setState({ documents: [], activeId: null }));

  it("names the main parameters of a step", () => {
    expect(stepLabel(entry("gaussian"), { sigma: 2 })).toBe("Gaussian filter (sigma 2 px)");
    expect(stepLabel(entry("sobel"), { output: "gx", norm: "l2" })).toBe(
      "Sobel (output Horizontal change, magnitude norm L2)",
    );
    expect(stepLabel(entry("noise-gaussian"), { sigma: 10, monochrome: false, seed: 1 })).toBe(
      "Add Gaussian noise (sigma 10, monochrome off)",
    );
  });

  it("describes the last filter in the export name", () => {
    const id = useDocuments.getState().open({
      name: "edge.png",
      source: "sample",
      fileBytes: 0,
      header: null,
      warnings: [],
      original: stepEdge(4, 4),
    });
    const doc = () =>
      activeDocument() ??
      (() => {
        throw new Error("no doc");
      })();
    expect(exportSuffix(doc())).toBe("");
    useDocuments
      .getState()
      .edit(id, stepEdge(4, 4), "Gaussian", { id: "gaussian", params: { sigma: 2.5 } });
    expect(exportSuffix(doc())).toBe("gaussian_sigma-2.5");
    useDocuments.getState().edit(id, stepEdge(4, 4), "Rotate");
    expect(exportSuffix(doc())).toBe("gaussian_sigma-2.5");
    useDocuments.getState().undo(id);
    useDocuments.getState().undo(id);
    expect(exportSuffix(doc())).toBe("");
  });

  it("finds catalog entries by id", () => {
    expect(filterById("median")?.name).toBe("Median filter");
    expect(filterById("nope")).toBeNull();
    expect(filterById(null)).toBeNull();
  });
});

describe("preview plan", () => {
  const view = { width: 1000, height: 800 };

  it("previews small images whole and exactly", () => {
    const plan = planPreview(
      { width: 1000, height: 1000 },
      { zoom: 0.1, panX: 0, panY: 0 },
      view,
      false,
    );
    expect(plan).toMatchObject({
      scale: 1,
      approximate: false,
      region: { x: 0, y: 0, width: 1000, height: 1000 },
    });
  });

  it("previews the visible part of a large image at 50% zoom or more", () => {
    const side = Math.ceil(Math.sqrt(FULL_PREVIEW_PIXELS)) + 1000;
    const plan = planPreview(
      { width: side, height: side },
      { zoom: 1, panX: -500, panY: -300 },
      view,
      false,
    );
    expect(plan.scale).toBe(1);
    expect(plan.approximate).toBe(false);
    // Visible x from 500 to 1500 and y from 300 to 1100, plus a 64 pixel margin.
    expect(plan.region).toEqual({ x: 436, y: 236, width: 1128, height: 928 });
  });

  it("says when stretching uses only the visible range", () => {
    const side = Math.ceil(Math.sqrt(FULL_PREVIEW_PIXELS)) + 1000;
    const plan = planPreview(
      { width: side, height: side },
      { zoom: 1, panX: 0, panY: 0 },
      view,
      true,
    );
    expect(plan.approximate).toBe(true);
    expect(plan.note).toMatch(/visible part/);
  });

  it("previews a smaller copy below 50% zoom", () => {
    const plan = planPreview(
      { width: 6000, height: 4000 },
      { zoom: 0.2, panX: 0, panY: 0 },
      view,
      false,
    );
    expect(plan.scale).toBeLessThan(1);
    expect(plan.approximate).toBe(true);
    expect(plan.region.width).toBe(1500);
    expect(plan.region.height).toBe(1000);
  });

  it("scales pixel sizes to the smaller copy, keeping their rules", () => {
    expect(scaleParams(entry("gaussian"), { sigma: 8, truncate: 3 }, 0.25)).toMatchObject({
      sigma: 2,
      truncate: 3,
    });
    expect(scaleParams(entry("median"), { size: 9 }, 0.25).size).toBe(3);
    expect(scaleParams(entry("box"), { size: 25 }, 0.5).size).toBe(13);
    expect(scaleParams(entry("motion-blur"), { length: 40, angle: 30 }, 0.25)).toMatchObject({
      length: 10,
      angle: 30,
    });
  });
});
