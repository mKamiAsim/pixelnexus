// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import type { AiRequest } from "@/core/ai/types";
import { useAi } from "@/state/ai";
import { activeDocument, useDocuments } from "@/state/documents";
import { useNotices } from "@/state/notifications";

import { registerAdapter } from "./aiActions";
import { aiImage, aiImageRequest, blendBack } from "./aiImageActions";

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

function filled(width: number, height: number, value: number) {
  const image = createImage(width, height);
  image.data.fill(value);
  return image;
}

const lastNotice = () => useNotices.getState().notices.at(-1);

beforeEach(() => {
  localStorage.clear();
  useAi.setState({ providers: [], tasks: {}, pending: null });
});

describe("AI image tasks", () => {
  it("sends the box around the selection for a task that allows a crop", () => {
    const doc = openImage(10, 10);
    const selection = createMask(10, 10);
    selection.data[3 * 10 + 4] = 255;
    selection.data[5 * 10 + 6] = 255;
    const request = aiImageRequest("denoise", { ...doc, selection });
    expect(request.origin).toEqual({ x: 4, y: 3 });
    expect([request.image.width, request.image.height]).toEqual([3, 3]);
    const enlarge = aiImageRequest("super-resolution", { ...doc, selection });
    expect(enlarge.origin).toBeUndefined();
    expect(enlarge.image).toBe(doc.current);
  });

  it("blends the answer back with the selection as its weight", () => {
    const image = filled(2, 1, 0);
    const mask = createMask(2, 1);
    mask.data.set([255, 51]);
    const out = blendBack(image, filled(2, 1, 200), { x: 0, y: 0, width: 2, height: 1 }, mask);
    expect([out.data[0], out.data[4]]).toEqual([200, 40]);
  });

  it("names the classical filter when no provider is set", async () => {
    const doc = openImage(4, 4);
    await aiImage("jpeg-cleanup");
    expect(lastNotice()?.title).toBe("No AI provider is set for JPEG cleanup");
    expect(activeDocument()?.current).toBe(doc.current);
  });

  it("adds the answer as a step that names the provider, labeled as an AI result", async () => {
    openImage(4, 3);
    const run = vi.fn(async (request: AiRequest) => ({
      kind: "image" as const,
      image: filled(request.image.width * 2, request.image.height * 2, 9),
    }));
    const restore = registerAdapter("engine-model", () => ({ run }));
    useAi.setState({ tasks: { "super-resolution": "local-engine" } });
    try {
      await aiImage("super-resolution");
    } finally {
      restore();
    }
    const doc = activeDocument();
    expect([doc?.current.width, doc?.current.height]).toEqual([8, 6]);
    expect(doc?.steps.at(-1)?.label).toMatch(/^Super-resolution with AI \(/);
    expect(lastNotice()?.detail).toContain("AI result");
  });
});
