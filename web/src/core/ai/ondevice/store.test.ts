import { describe, expect, it, vi } from "vitest";

import { catalog } from "@/catalog";
import type { Model } from "@/generated/catalog-types";

import {
  browserFiles,
  cachedFiles,
  downloadModel,
  isCached,
  removeModel,
  runsOnDevice,
  type ModelCache,
} from "./store";

function fakeCache(): ModelCache & { keys: () => string[] } {
  const items = new Map<string, ArrayBuffer>();
  return {
    keys: () => [...items.keys()],
    match: async (k) => (items.has(k) ? new Response(items.get(k)) : undefined),
    put: async (k, r) => void items.set(k, await r.arrayBuffer()),
    delete: async (k) => items.delete(k),
  };
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function model(main: string, extra: string): Promise<Model> {
  return {
    id: "m",
    name: "M",
    task: "other",
    license: "MIT",
    sourceUrl: "https://example.test/main.onnx",
    browserUrl: "https://mirror.test/main.onnx",
    sha256: await sha(main),
    sizeMB: main.length / 1e6,
    format: "onnx",
    runtimes: ["on-device"],
    extraFiles: [
      {
        sourceUrl: "https://example.test/extra.onnx",
        sha256: await sha(extra),
        sizeMB: extra.length / 1e6,
      },
    ],
  };
}

describe("on-device model store", () => {
  it("downloads from the browser copy, checks every file and caches it", async () => {
    const m = await model("graph", "weights!");
    const cache = fakeCache();
    const fetchStub = vi.fn(
      async (url: string) => new Response(url.includes("main") ? "graph" : "weights!"),
    );
    const shares: number[] = [];
    await downloadModel(m, cache, (s) => shares.push(s), fetchStub as unknown as typeof fetch);
    expect(fetchStub.mock.calls.map(([u]) => u)).toEqual([
      "https://mirror.test/main.onnx",
      "https://example.test/extra.onnx",
    ]);
    expect(shares.at(-1)).toBe(1);
    expect(await isCached(m, cache)).toBe(true);
    const files = await cachedFiles(m, cache);
    expect(files?.map((b) => new TextDecoder().decode(b))).toEqual(["graph", "weights!"]);
    await downloadModel(m, cache, undefined, fetchStub as unknown as typeof fetch);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    await removeModel(m, cache);
    expect(cache.keys()).toEqual([]);
  });

  it("keeps nothing that fails its checksum", async () => {
    const m = await model("graph", "weights!");
    const cache = fakeCache();
    const tampered = vi.fn(async () => new Response("other"));
    await expect(
      downloadModel(m, cache, undefined, tampered as unknown as typeof fetch),
    ).rejects.toThrow("checksum");
    expect(cache.keys()).toEqual([]);
  });

  it("offers only ONNX models marked for on-device use", () => {
    const ids = catalog.models.filter(runsOnDevice).map((m) => m.id);
    expect(ids).toContain("u2netp");
    expect(ids).toContain("swin2sr-lightweight-x2");
    expect(ids).not.toContain("dncnn-color-blind");
    const u2netp = catalog.models.find((m) => m.id === "u2netp");
    expect(u2netp && browserFiles(u2netp)[0]?.url).toContain("huggingface.co");
  });
});
