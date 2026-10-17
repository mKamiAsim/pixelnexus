// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useNotices } from "@/state/notifications";

import { watchChangeWarnings } from "./changeWarnings";

describe("change warnings", () => {
  it("warn once about a step that changed the size, and keep the note on the step", () => {
    const stop = watchChangeWarnings();
    try {
      useDocuments.getState().open({
        name: "a.png",
        source: "sample",
        fileBytes: 0,
        header: null,
        warnings: [],
        original: createImage(4, 4),
      });
      const id = activeDocument()?.id ?? "";
      const before = useNotices.getState().notices.length;
      useDocuments.getState().edit(id, createImage(8, 8), "Enlarge 2x");
      const notices = useNotices.getState().notices;
      expect(notices.length).toBe(before + 1);
      expect(notices.at(-1)).toMatchObject({
        tone: "warning",
        title: "Enlarge 2x changed the image",
        detail: "The size changed from 4 x 4 to 8 x 8 pixels.",
      });
      expect(activeDocument()?.steps.at(-1)?.notes).toEqual([
        "The size changed from 4 x 4 to 8 x 8 pixels.",
      ]);
      // A step that changes only pixel values says nothing.
      useDocuments.getState().edit(id, createImage(8, 8), "Blur");
      expect(useNotices.getState().notices.length).toBe(before + 1);
    } finally {
      stop();
    }
  });
});
