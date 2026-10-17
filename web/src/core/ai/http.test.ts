/**
 * Contract tests of the generic HTTP adapter against a mock server on this machine. No request
 * leaves the computer. The mock reads the multipart form as a real service would.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { catalog } from "@/catalog";
import { createImage, type RgbaImage } from "@/core/image/types";
import { encodePng } from "@/core/image/png";
import { createMask } from "@/core/mask/mask";

import { errorReason, httpAdapter, maskFromAnswer, taskUrl, type ProviderPreset } from "./http";
import type { AiRequest } from "./types";

/** Decode the 8-bit RGBA PNGs that encodePng writes. Enough for these tests. */
async function decodeTestPng(bytes: Uint8Array): Promise<RgbaImage> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
    } else if (type === "IDAT") idat.push(body);
    at += 12 + length;
  }
  const stream = new Blob(idat.map((b) => b.slice())).stream();
  const raw = new Uint8Array(
    await new Response(stream.pipeThrough(new DecompressionStream("deflate"))).arrayBuffer(),
  );
  const image = createImage(width, height);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= 4 ? (image.data[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (image.data[(y - 1) * stride + x] ?? 0) : 0;
      const corner = x >= 4 && y > 0 ? (image.data[(y - 1) * stride + x - 4] ?? 0) : 0;
      const p = left + up - corner;
      const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      const add = [0, left, up, (left + up) >> 1, paeth][filter ?? 0] ?? 0;
      image.data[y * stride + x] = (v + add) & 255;
    }
  }
  return image;
}

interface Received {
  url: string;
  headers: IncomingMessage["headers"];
  form: FormData;
}

let server: Server;
let base = "";
let received: Received[] = [];
let answer: (r: Received) => Promise<Response> = async () => new Response(null, { status: 500 });

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
          method: req.method ?? "POST",
          headers: req.headers as Record<string, string>,
          body: Buffer.concat(chunks),
        });
        const entry = { url: req.url ?? "", headers: req.headers, form: await request.formData() };
        received.push(entry);
        const reply = await answer(entry);
        res.writeHead(reply.status, Object.fromEntries(reply.headers));
        res.end(Buffer.from(await reply.arrayBuffer()));
      })();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((done) => server.close(() => done())));

beforeEach(() => {
  received = [];
});

const preset = (id: string): ProviderPreset => {
  const found = catalog.providerPresets.find((p) => p.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return found;
};

const task = (id: string) => {
  const found = catalog.aiTasks.find((t) => t.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
};

function picture(width: number, height: number, alpha = 255): RgbaImage {
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) image.data.set([i % 256, 40, 90, alpha], i * 4);
  return image;
}

const pngResponse = async (image: RgbaImage) =>
  new Response((await encodePng(image)).slice(), { headers: { "Content-Type": "image/png" } });

function adapter(id: string, extra: { key?: string; model?: string; baseUrl?: string } = {}) {
  return httpAdapter(preset(id), {
    baseUrl: extra.baseUrl ?? base,
    key: extra.key ?? "test-key-1234",
    ...(extra.model ? { model: extra.model } : {}),
    fetch,
    encodePng,
    decode: decodeTestPng,
  });
}

describe("generic HTTP contract", () => {
  it("posts the image, selection, clicks and model, with the key in the header only", async () => {
    answer = async (r) => {
      const image = await decodeTestPng(
        new Uint8Array(await (r.form.get("image") as Blob).arrayBuffer()),
      );
      return pngResponse(image);
    };
    const mask = createMask(4, 3, 255);
    const request: AiRequest = {
      task: task("click-select"),
      image: picture(4, 3),
      mask,
      points: [{ x: 1, y: 2, positive: true }],
      box: { x: 0, y: 0, width: 2, height: 2 },
    };
    const out = await adapter("generic-http", { model: "my-model" }).run(request);
    expect(out.kind).toBe("mask");
    const [sent] = received;
    expect(sent?.url).toBe("/click-select");
    expect(sent?.headers.authorization).toBe("Bearer test-key-1234");
    expect(sent?.url).not.toContain("test-key");
    expect(JSON.parse(sent?.form.get("prompts") as string)).toEqual({
      points: [{ x: 1, y: 2, positive: true }],
      box: { x: 0, y: 0, width: 2, height: 2 },
    });
    expect(sent?.form.get("model")).toBe("my-model");
    const sentMask = await decodeTestPng(
      new Uint8Array(await (sent?.form.get("mask") as Blob).arrayBuffer()),
    );
    expect(sentMask.data[0]).toBe(255);
  });

  it("returns an image task's answer whole, at its own size", async () => {
    answer = async () => pngResponse(picture(8, 6));
    const out = await adapter("generic-http").run({
      task: task("super-resolution"),
      image: picture(4, 3),
    });
    expect(out.kind === "image" && [out.image.width, out.image.height]).toEqual([8, 6]);
    expect(received[0]?.form.get("prompts")).toBeNull();
  });

  it("turns an error answer into a plain message without the key", async () => {
    answer = async () => Response.json({ detail: "Model is loading." }, { status: 503 });
    await expect(
      adapter("generic-http").run({ task: task("denoise"), image: picture(2, 2) }),
    ).rejects.toThrow("The service answered with error 503: Model is loading.");
  });

  it("refuses an answer that is not an image", async () => {
    answer = async () => Response.json({ ok: true });
    await expect(
      adapter("generic-http").run({ task: task("denoise"), image: picture(2, 2) }),
    ).rejects.toThrow("did not answer with an image");
  });

  it("needs a key, an allowed URL and a task the preset knows", async () => {
    const run = (a: ReturnType<typeof adapter>, id: string) =>
      a.run({ task: task(id), image: picture(2, 2) });
    await expect(run(adapter("generic-http", { key: "" }), "denoise")).rejects.toThrow(
      "Add the API key",
    );
    await expect(
      run(adapter("generic-http", { baseUrl: "http://example.com" }), "denoise"),
    ).rejects.toThrow("External hosts must use HTTPS");
    await expect(run(adapter("remove-bg"), "denoise")).rejects.toThrow("does not do");
    expect(received).toEqual([]);
  });

  it("names the host when it cannot be reached", async () => {
    const closed = createServer();
    await new Promise<void>((done) => closed.listen(0, "127.0.0.1", done));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((done) => closed.close(() => done()));
    await expect(
      adapter("generic-http", { baseUrl: `http://127.0.0.1:${port}` }).run({
        task: task("denoise"),
        image: picture(2, 2),
      }),
    ).rejects.toThrow(`Could not reach 127.0.0.1:${port}`);
  });
});

describe("remove.bg preset", () => {
  it("sends image_file with its fixed fields and X-Api-Key, and reads the cutout's alpha", async () => {
    answer = async () => {
      const cutout = picture(2, 2, 255);
      cutout.data[3] = 0;
      return pngResponse(cutout);
    };
    const remove = preset("remove-bg");
    const out = await httpAdapter(remove, {
      baseUrl: base,
      key: "rbg-key",
      fetch,
      encodePng,
      decode: decodeTestPng,
    }).run({ task: task("subject-select"), image: picture(4, 4) });
    const [sent] = received;
    expect(sent?.url).toBe("/removebg");
    expect(sent?.headers["x-api-key"]).toBe("rbg-key");
    expect(sent?.form.get("size")).toBe("auto");
    expect(sent?.form.get("format")).toBe("png");
    expect(sent?.form.get("image_file")).toBeInstanceOf(Blob);
    // The answer was half the size, so the selection is resized to the image.
    expect(out.kind === "mask" && [out.mask.width, out.mask.height]).toEqual([4, 4]);
    expect(remove.baseUrl).toBe("https://api.remove.bg/v1.0");
  });
});

describe("helpers", () => {
  it("joins the base URL and path with one slash", () => {
    expect(taskUrl("https://a.test/v1/", "/run")).toBe("https://a.test/v1/run");
  });

  it("reads the selection from alpha when there is any, else from gray", () => {
    const opaque = picture(2, 1);
    expect(Array.from(maskFromAnswer(opaque).data)).toEqual([0, 1]);
    opaque.data[3] = 7;
    expect(Array.from(maskFromAnswer(opaque).data)).toEqual([7, 255]);
  });

  it("finds the reason in the usual JSON error shapes", async () => {
    const reason = (body: unknown) => errorReason(Response.json(body, { status: 400 }));
    expect(await reason({ errors: [{ title: "File too large" }] })).toBe(
      "The service answered with error 400: File too large.",
    );
    expect(await reason({ error: { message: "Bad key." } })).toContain("Bad key.");
    expect(await errorReason(new Response("oops", { status: 502 }))).toBe(
      "The service answered with error 502.",
    );
  });
});
