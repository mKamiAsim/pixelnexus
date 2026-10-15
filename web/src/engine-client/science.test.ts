import { afterEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_MESSAGE, ScienceEngine } from "./science";

type Handler = (event: { data: string }) => void;

/** An EventSource that replays the given job states on the next tick. */
function eventSourceWith(states: { state: string; progress: number; error?: string }[]) {
  return class {
    private handlers: Handler[] = [];
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      setTimeout(() => {
        for (const s of states) {
          this.handlers.forEach((h) =>
            h({ data: JSON.stringify({ id: "j1", error: null, ...s }) }),
          );
        }
      }, 0);
    }
    addEventListener(_name: string, handler: Handler) {
      this.handlers.push(handler);
    }
    close() {}
  };
}

function engineServer(result: Uint8Array<ArrayBuffer>, width: number, height: number) {
  const calls: string[] = [];
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("http://engine.test/api/v1", "");
    calls.push(`${init?.method ?? "GET"} ${path.split("?")[0]}`);
    if (path.startsWith("/images")) return Response.json({ id: "hash", width, height });
    if (path === "/jobs")
      return Response.json({ id: "j1", state: "queued", progress: 0 }, { status: 202 });
    if (path === "/jobs/j1/result") {
      return new Response(result, {
        headers: { "X-Width": String(width), "X-Height": String(height) },
      });
    }
    return Response.json({ id: "j1", state: "done", progress: 1 });
  });
  return { calls, fetchStub };
}

afterEach(() => vi.unstubAllGlobals());

describe("the science engine client", () => {
  const image = { width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).fill(7) };

  it("uploads an image once, follows progress and cuts the region from the result", async () => {
    const result = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => i);
    const { calls, fetchStub } = engineServer(result, 3, 2);
    vi.stubGlobal("fetch", fetchStub);
    vi.stubGlobal(
      "EventSource",
      eventSourceWith([
        { state: "running", progress: 0.5 },
        { state: "done", progress: 1 },
      ]),
    );
    const engine = new ScienceEngine("http://engine.test");
    const progress: number[] = [];
    const job = { filterId: "x", params: {}, image, region: { x: 1, y: 1, width: 2, height: 1 } };
    const out = await engine.run(job, { onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([0.5, 1]);
    expect(out.region).toEqual({ x: 1, y: 1, width: 2, height: 1 });
    expect(Array.from(out.image.data)).toEqual(Array.from(result.slice(16, 24)));
    await engine.run({ ...job, region: undefined });
    expect(calls.filter((c) => c === "POST /images")).toHaveLength(1);
  });

  it("reports a failed job with the engine's message", async () => {
    vi.stubGlobal("fetch", engineServer(new Uint8Array(24), 3, 2).fetchStub);
    vi.stubGlobal(
      "EventSource",
      eventSourceWith([{ state: "failed", progress: 0, error: "Bad input." }]),
    );
    await expect(
      new ScienceEngine("http://engine.test").run({ filterId: "x", params: {}, image }),
    ).rejects.toThrow("Bad input.");
  });

  it("explains how to start the engine when it does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const engine = new ScienceEngine("http://engine.test");
    await expect(engine.run({ filterId: "x", params: {}, image })).rejects.toThrow(OFFLINE_MESSAGE);
    expect(await engine.info()).toBeNull();
  });
});
