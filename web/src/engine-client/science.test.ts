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

  it("sends the selection a filter reads as a gray mask image", async () => {
    const { fetchStub } = engineServer(new Uint8Array(24), 3, 2);
    const bodies: { url: string; body: unknown }[] = [];
    const stub = vi.fn(async (url: string, init?: RequestInit) => {
      bodies.push({ url, body: init?.body });
      return fetchStub(url, init);
    });
    vi.stubGlobal("fetch", stub);
    vi.stubGlobal("EventSource", eventSourceWith([{ state: "done", progress: 1 }]));
    const hole = { width: 3, height: 2, data: Uint8Array.from([0, 255, 128, 0, 0, 9]) };
    await new ScienceEngine("http://engine.test").run({ filterId: "x", params: {}, image, hole });
    const uploads = bodies.filter((b) => b.url.includes("/images"));
    expect(uploads).toHaveLength(2);
    const gray = uploads[1]?.body as Uint8ClampedArray;
    expect(Array.from(gray.slice(4, 12))).toEqual([255, 255, 255, 255, 128, 128, 128, 255]);
    const job = bodies.find((b) => b.url.endsWith("/jobs"));
    expect(JSON.parse(job?.body as string)).toEqual({
      filter: "x",
      image: "hash",
      params: {},
      mask: "hash",
    });
  });

  it("returns a result of another size whole, whatever the region", async () => {
    const result = Uint8Array.from({ length: 6 * 4 * 4 }, (_, i) => i % 251);
    vi.stubGlobal("fetch", engineServer(result, 6, 4).fetchStub);
    vi.stubGlobal("EventSource", eventSourceWith([{ state: "done", progress: 1 }]));
    const out = await new ScienceEngine("http://engine.test").run({
      filterId: "x",
      params: {},
      image,
      region: { x: 0, y: 0, width: 3, height: 2 },
    });
    expect(out.region).toEqual({ x: 0, y: 0, width: 6, height: 4 });
    expect(out.image.width).toBe(6);
    expect(Array.from(out.image.data)).toEqual(Array.from(result));
  });

  it("returns a feature table with the unchanged image", async () => {
    const features = {
      kind: "features",
      columns: [{ key: "x", label: "x", unit: "px" }],
      rows: [[1]],
      summary: "1 blob",
    };
    const { fetchStub } = engineServer(new Uint8Array(24), 3, 2);
    const stub = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/result") ? Response.json(features) : fetchStub(url, init),
    );
    vi.stubGlobal("fetch", stub);
    vi.stubGlobal("EventSource", eventSourceWith([{ state: "done", progress: 1 }]));
    const out = await new ScienceEngine("http://engine.test").run({
      filterId: "x",
      params: {},
      image,
    });
    expect(out.features).toEqual(features);
    expect(out.image.data).toEqual(image.data);
    expect(out.region).toEqual({ x: 0, y: 0, width: 3, height: 2 });
  });

  it("uploads the image again when the engine has dropped it", async () => {
    const { calls, fetchStub } = engineServer(new Uint8Array(24), 3, 2);
    let dropped = true;
    const stub = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/jobs") && dropped) {
        dropped = false;
        calls.push("POST /jobs");
        return Response.json(
          { detail: "There is no image with this id. Upload it again." },
          { status: 404 },
        );
      }
      return fetchStub(url, init);
    });
    vi.stubGlobal("fetch", stub);
    vi.stubGlobal("EventSource", eventSourceWith([{ state: "done", progress: 1 }]));
    const engine = new ScienceEngine("http://engine.test");
    await engine.run({ filterId: "x", params: {}, image });
    expect(calls.filter((c) => c === "POST /images")).toHaveLength(2);
    expect(calls.filter((c) => c === "POST /jobs")).toHaveLength(2);
  });

  it("does not upload again when the filter is missing", async () => {
    const stub = vi.fn(async (url: string) =>
      url.includes("/images")
        ? Response.json({ id: "hash", width: 3, height: 2 })
        : Response.json({ detail: 'There is no filter "x" in this engine.' }, { status: 404 }),
    );
    vi.stubGlobal("fetch", stub);
    const engine = new ScienceEngine("http://engine.test");
    await expect(engine.run({ filterId: "x", params: {}, image })).rejects.toThrow(
      'There is no filter "x" in this engine.',
    );
    expect(stub.mock.calls.filter(([url]) => url.includes("/images"))).toHaveLength(1);
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
