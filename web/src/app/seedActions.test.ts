// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import type { AiRequest } from "@/core/ai/types";
import { useAi } from "@/state/ai";
import { activeDocument, useDocuments } from "@/state/documents";
import { useNotices } from "@/state/notifications";
import { useSeeds } from "@/state/seeds";

import { registerAdapter } from "./aiActions";
import { addAiSeed } from "./seedActions";

function openImage() {
  useDocuments.getState().open({
    name: "test.png",
    source: "sample",
    fileBytes: 0,
    header: null,
    warnings: [],
    original: createImage(6, 6),
  });
}

const lastNotice = () => useNotices.getState().notices.at(-1);

beforeEach(() => {
  localStorage.clear();
  useSeeds.getState().clear();
  useAi.setState({ providers: [], tasks: {}, pending: null });
});

describe("AI Click Select", () => {
  it("names the classical Click Select when no provider is set", async () => {
    openImage();
    await addAiSeed(1, 1, true);
    expect(lastNotice()?.title).toBe("No AI provider is set for Click to select");
    expect(activeDocument()?.selection).toBeNull();
  });

  it("sends every click as a point, Alt-clicks as negative, and selects the answer", async () => {
    openImage();
    const seen: AiRequest[] = [];
    const run = vi.fn(async (request: AiRequest) => {
      seen.push(request);
      return { kind: "mask" as const, mask: createMask(6, 6, 255) };
    });
    const restore = registerAdapter("engine-model", () => ({ run }));
    useAi.setState({ tasks: { "click-select": "local-engine" } });
    try {
      await addAiSeed(1, 2, true);
      await addAiSeed(4, 4, false);
    } finally {
      restore();
    }
    expect(seen.at(-1)?.points).toEqual([
      { x: 1, y: 2, positive: true },
      { x: 4, y: 4, positive: false },
    ]);
    expect(activeDocument()?.selection?.data[0]).toBe(255);
    expect(lastNotice()?.detail).toContain("AI result");
  });
});
