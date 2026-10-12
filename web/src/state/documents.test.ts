import { beforeEach, describe, expect, it } from "vitest";

import { stepEdge } from "@/core/image/synthetic";
import { rotate } from "@/core/image/transform";
import { createImage } from "@/core/image/types";

import { createMask } from "@/core/mask/mask";

import {
  activeDocument,
  activeSelection,
  appliedSteps,
  canRedo,
  canUndo,
  HISTORY_BYTES,
  historyBytes,
  historyLimits,
  MAX_STEPS,
  useDocuments,
} from "./documents";

const sample = () => ({
  name: "edge",
  source: "sample" as const,
  fileBytes: 0,
  header: null,
  warnings: [],
  original: stepEdge(8, 4),
});

const labels = () => appliedSteps(activeDocument() ?? fail()).map((s) => s.label);
function fail(): never {
  throw new Error("no active document");
}

describe("documents store", () => {
  beforeEach(() => useDocuments.setState({ documents: [], activeId: null }));

  it("opens documents and makes the newest active", () => {
    const a = useDocuments.getState().open(sample());
    const b = useDocuments.getState().open(sample());
    expect(useDocuments.getState().documents).toHaveLength(2);
    expect(activeDocument()?.id).toBe(b);
    expect(a).not.toBe(b);
  });

  it("activates a neighbor when the active document closes", () => {
    const a = useDocuments.getState().open(sample());
    const b = useDocuments.getState().open(sample());
    useDocuments.getState().close(b);
    expect(activeDocument()?.id).toBe(a);
    useDocuments.getState().close(a);
    expect(activeDocument()).toBeNull();
  });

  it("keeps the original when editing and restores it on revert", () => {
    const id = useDocuments.getState().open(sample());
    useDocuments.getState().setView(id, { zoom: 2, panX: 0, panY: 0 });
    const turned = rotate(activeDocument()?.current ?? fail(), "cw");
    useDocuments.getState().edit(id, turned, "Rotate 90 degrees clockwise");
    let doc = activeDocument();
    expect(doc?.current.width).toBe(4);
    expect(doc?.original.width).toBe(8);
    expect(doc?.view).toBeNull();
    expect(labels()).toEqual(["Rotate 90 degrees clockwise"]);
    useDocuments.getState().revert(id);
    doc = activeDocument();
    expect(doc?.current).toBe(doc?.original);
    expect(labels()).toEqual(["Rotate 90 degrees clockwise", "Revert to original"]);
  });

  it("undoes and redoes edits, and a new edit clears redo", () => {
    const id = useDocuments.getState().open(sample());
    const first = activeDocument()?.current ?? fail();
    const turned = rotate(first, "cw");
    useDocuments.getState().edit(id, turned, "Rotate");
    expect(canUndo(activeDocument())).toBe(true);
    useDocuments.getState().undo(id);
    expect(activeDocument()?.current).toBe(first);
    expect(labels()).toEqual([]);
    expect(canRedo(activeDocument())).toBe(true);
    useDocuments.getState().redo(id);
    expect(activeDocument()?.current).toBe(turned);
    useDocuments.getState().undo(id);
    useDocuments.getState().edit(id, rotate(first, "half"), "Rotate 180");
    expect(canRedo(activeDocument())).toBe(false);
    expect(labels()).toEqual(["Rotate 180"]);
  });

  it("jumps to any step and keeps the steps after it for redo", () => {
    const id = useDocuments.getState().open(sample());
    for (let i = 0; i < 4; i++) {
      useDocuments
        .getState()
        .edit(id, rotate(activeDocument()?.current ?? fail(), "half"), `Step ${i}`);
    }
    useDocuments.getState().jumpTo(id, 1);
    expect(labels()).toEqual(["Step 0"]);
    expect(activeDocument()?.steps).toHaveLength(5);
    useDocuments.getState().jumpTo(id, 0);
    expect(activeDocument()?.current).toBe(activeDocument()?.original);
  });

  it("records the filter and parameters of a filter step", () => {
    const id = useDocuments.getState().open(sample());
    const filter = { id: "gaussian", params: { sigma: 2 } };
    useDocuments
      .getState()
      .edit(id, rotate(activeDocument()?.current ?? fail(), "half"), "Gaussian filter", filter);
    expect(appliedSteps(activeDocument() ?? fail())[0]?.filter).toEqual(filter);
  });

  it("keeps at most MAX_STEPS steps and always the original", () => {
    const id = useDocuments.getState().open(sample());
    for (let i = 0; i < MAX_STEPS + 10; i++) {
      useDocuments
        .getState()
        .edit(id, rotate(activeDocument()?.current ?? fail(), "half"), `Step ${i}`);
    }
    const doc = activeDocument() ?? fail();
    expect(doc.steps).toHaveLength(MAX_STEPS);
    expect(doc.steps[0]?.image).toBe(doc.original);
    // MAX_STEPS + 10 edits plus the original, trimmed to MAX_STEPS steps.
    expect(doc.dropped).toBe(11);
    expect(doc.steps.at(-1)?.label).toBe(`Step ${MAX_STEPS + 9}`);
  });

  it("drops old steps when the history is larger than its byte budget", () => {
    // A 4 KB budget and 1 KB images, so at most four images fit.
    historyLimits.bytes = 4096;
    try {
      const image = () => createImage(16, 16);
      const id = useDocuments.getState().open({ ...sample(), original: image() });
      for (let i = 0; i < 6; i++) useDocuments.getState().edit(id, image(), `Step ${i}`);
      const doc = activeDocument() ?? fail();
      expect(historyBytes(doc.steps)).toBeLessThanOrEqual(4096);
      expect(doc.steps[0]?.image).toBe(doc.original);
      expect(doc.dropped).toBe(3);
    } finally {
      historyLimits.bytes = HISTORY_BYTES;
    }
  });

  it("records selection changes as steps that undo and redo", () => {
    const id = useDocuments.getState().open(sample());
    const mask = createMask(8, 4, 255);
    useDocuments.getState().select(id, mask, "Select all");
    const doc = () => activeDocument() ?? fail();
    expect(doc().selection).toBe(mask);
    expect(doc().current).toBe(doc().original);
    expect(labels()).toEqual(["Select all"]);
    // The same selection again adds no step.
    useDocuments.getState().select(id, createMask(8, 4, 255), "Select all");
    expect(doc().steps).toHaveLength(2);
    useDocuments.getState().undo(id);
    expect(doc().selection).toBeNull();
    useDocuments.getState().redo(id);
    expect(doc().selection).toBe(mask);
    useDocuments.getState().select(id, null, "Deselect");
    expect(doc().selection).toBeNull();
    expect(labels()).toEqual(["Select all", "Deselect"]);
  });

  it("keeps the selection through edits of the same size and drops it on a size change", () => {
    const id = useDocuments.getState().open(sample());
    const mask = createMask(8, 4, 255);
    useDocuments.getState().select(id, mask, "Select all");
    useDocuments.getState().edit(id, stepEdge(8, 4), "Blur");
    const doc = () => activeDocument() ?? fail();
    expect(doc().selection).toBe(mask);
    useDocuments.getState().edit(id, rotate(doc().current, "cw"), "Rotate");
    expect(doc().selection).toBeNull();
    const turned = createMask(8, 4, 1);
    useDocuments.getState().edit(id, rotate(doc().current, "cw"), "Rotate", undefined, turned);
    expect(doc().selection).toBe(turned);
  });

  it("turns the selection off for a while without losing it", () => {
    const id = useDocuments.getState().open(sample());
    const mask = createMask(8, 4, 255);
    useDocuments.getState().select(id, mask, "Select all");
    useDocuments.getState().setSelectionEnabled(id, false);
    const doc = () => activeDocument() ?? fail();
    expect(activeSelection(doc())).toBeNull();
    expect(doc().selection).toBe(mask);
    // A new selection turns it back on.
    useDocuments.getState().select(id, createMask(8, 4, 9), "Brush");
    expect(activeSelection(doc())?.data[0]).toBe(9);
  });

  it("saves and deletes named masks, and counts masks in the history bytes", () => {
    const id = useDocuments.getState().open(sample());
    const mask = createMask(8, 4, 255);
    useDocuments.getState().saveMask(id, "Sky", mask);
    const doc = () => activeDocument() ?? fail();
    expect(doc().masks.map((m) => m.name)).toEqual(["Sky"]);
    useDocuments.getState().deleteMask(id, doc().masks[0]?.id ?? -1);
    expect(doc().masks).toEqual([]);
    const before = historyBytes(doc().steps);
    useDocuments.getState().select(id, mask, "Select all");
    expect(historyBytes(doc().steps)).toBe(before + 32);
  });
});
