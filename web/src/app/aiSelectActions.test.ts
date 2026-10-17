// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import type { AiRequest } from "@/core/ai/types";
import { useAi } from "@/state/ai";
import { activeDocument, useDocuments } from "@/state/documents";
import { useNotices } from "@/state/notifications";

import { registerAdapter } from "./aiActions";
import { aiRequest, aiSelect, cropFor, placeMask } from "./aiSelectActions";

function openImage(width: number, height: number) {
  useDocuments.getState().open({
    name: "test.png",
    source: "sample",
    fileBytes: 0,
    header: null,
    warnings: [],
    original: createImage(width, height),
  });
  const doc = activeDocument();
  if (!doc) throw new Error("no document");
  return doc;
}

function boxMask(width: number, height: number, x: number, y: number, w: number, h: number) {
  const mask = createMask(width, height);
  for (let r = y; r < y + h; r++) mask.data.fill(255, r * width + x, r * width + x + w);
  return mask;
}

const lastNotice = () => useNotices.getState().notices.at(-1);

beforeEach(() => {
  localStorage.clear();
  useAi.setState({ providers: [], tasks: {}, pending: null });
});

describe("AI selection helpers", () => {
  it("places a crop's mask at its origin", () => {
    const part = createMask(2, 1, 255);
    expect(Array.from(placeMask(part, { x: 1, y: 1 }, 3, 2).data)).toEqual([0, 0, 0, 0, 255, 255]);
  });

  it("sends the box plus a margin of a quarter of its longer side, at least 16 px", () => {
    expect(cropFor({ x: 100, y: 100, width: 200, height: 40 }, 1000, 1000)).toEqual({
      x: 50,
      y: 50,
      width: 300,
      height: 140,
    });
    expect(cropFor({ x: 5, y: 5, width: 10, height: 10 }, 30, 30)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    });
  });

  it("asks for a box before an AI object, and makes the box relative to the crop", () => {
    const doc = openImage(200, 200);
    expect(aiRequest("object-select", doc)).toBeNull();
    expect(lastNotice()?.title).toBe("Draw a box first");
    const request = aiRequest("object-select", {
      ...doc,
      selection: boxMask(200, 200, 80, 90, 40, 20),
    });
    expect(request?.origin).toEqual({ x: 64, y: 74 });
    expect(request?.box).toEqual({ x: 16, y: 16, width: 40, height: 20 });
    expect([request?.image.width, request?.image.height]).toEqual([72, 52]);
  });
});

describe("AI selections through the router", () => {
  it("names the classical tool when no provider is set, and keeps the selection", async () => {
    openImage(8, 8);
    await aiSelect("subject-select");
    expect(lastNotice()?.title).toBe("No AI provider is set for Subject selection");
    expect(activeDocument()?.selection).toBeNull();
  });

  it("makes the answer the selection, labeled as an AI result", async () => {
    openImage(8, 8);
    const run = vi.fn(async (request: AiRequest) => ({
      kind: "mask" as const,
      mask: boxMask(request.image.width, request.image.height, 0, 0, 4, 8),
    }));
    const restore = registerAdapter("engine-model", () => ({ run }));
    useAi.setState({ tasks: { "subject-select": "local-engine" } });
    try {
      await aiSelect("subject-select", true);
    } finally {
      restore();
    }
    const selection = activeDocument()?.selection;
    expect(selection?.data[0]).toBe(0);
    expect(selection?.data[7]).toBe(255);
    expect(lastNotice()?.detail).toContain("AI result");
    expect(useDocuments.getState().documents.at(-1)?.steps.at(-1)?.label).toMatch(
      /^AI background \(/,
    );
    expect(useDocuments.getState().documents.at(-1)?.steps.at(-1)?.ai).toBe(true);
  });

  it("keeps a soft matte from AI soft edges as a soft selection", async () => {
    openImage(4, 1);
    const run = vi.fn(async () => {
      const mask = createMask(4, 1);
      mask.data.set([0, 64, 192, 255]);
      return { kind: "mask" as const, mask };
    });
    const restore = registerAdapter("engine-model", () => ({ run }));
    useAi.setState({ tasks: { matting: "local-engine" } });
    try {
      await aiSelect("matting");
    } finally {
      restore();
    }
    expect(Array.from(activeDocument()?.selection?.data ?? [])).toEqual([0, 64, 192, 255]);
  });
});
