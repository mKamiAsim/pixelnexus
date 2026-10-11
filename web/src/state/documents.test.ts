import { beforeEach, describe, expect, it } from "vitest";

import { stepEdge } from "@/core/image/synthetic";
import { rotate } from "@/core/image/transform";

import { activeDocument, useDocuments } from "./documents";

const sample = () => ({
  name: "edge",
  source: "sample" as const,
  fileBytes: 0,
  header: null,
  warnings: [],
  original: stepEdge(8, 4),
});

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
    const turned = rotate(activeDocument()?.current ?? stepEdge(1, 1), "cw");
    useDocuments.getState().edit(id, turned, "Rotate 90 degrees clockwise");
    let doc = activeDocument();
    expect(doc?.current.width).toBe(4);
    expect(doc?.original.width).toBe(8);
    expect(doc?.view).toBeNull();
    expect(doc?.edits).toEqual(["Rotate 90 degrees clockwise"]);
    useDocuments.getState().revert(id);
    doc = activeDocument();
    expect(doc?.current).toBe(doc?.original);
    expect(doc?.edits).toEqual(["Rotate 90 degrees clockwise", "Revert to original"]);
  });

  it("undoes and redoes edits, and a new edit clears redo", () => {
    const id = useDocuments.getState().open(sample());
    const first = activeDocument()?.current ?? stepEdge(1, 1);
    const turned = rotate(first, "cw");
    useDocuments.getState().edit(id, turned, "Rotate");
    useDocuments.getState().undo(id);
    expect(activeDocument()?.current).toBe(first);
    expect(activeDocument()?.edits).toEqual([]);
    useDocuments.getState().redo(id);
    expect(activeDocument()?.current).toBe(turned);
    useDocuments.getState().undo(id);
    useDocuments.getState().edit(id, rotate(first, "half"), "Rotate 180");
    expect(activeDocument()?.redoStack).toEqual([]);
  });

  it("limits the undo stack", () => {
    const id = useDocuments.getState().open(sample());
    for (let i = 0; i < 30; i++) {
      useDocuments
        .getState()
        .edit(id, rotate(activeDocument()?.current ?? stepEdge(1, 1), "half"), `Step ${i}`);
    }
    expect(activeDocument()?.undoStack).toHaveLength(20);
  });
});
