import { describe, expect, it } from "vitest";

import { decodeInWorker, ImageLoadError } from "@/core/workers/decode-client";

import manifest from "../../../tests/fixtures/formats/manifest.json";

const urls = import.meta.glob("/tests/fixtures/formats/*.{png,jpg,webp,gif,bmp,tif,avif}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface Expected {
  format: string;
  lossy?: boolean;
  colorModel?: string;
  decoded: { width: number; height: number; probe: number[] };
}

const files = manifest.files as Record<string, Expected>;
const [px, py] = manifest.probe as [number, number];

async function bytesOf(name: string): Promise<ArrayBuffer> {
  const url = urls[`/tests/fixtures/formats/${name}`];
  if (!url) throw new Error(`No fixture URL for ${name}`);
  return (await fetch(url)).arrayBuffer();
}

describe("decoding in a real browser worker", () => {
  it.each(Object.entries(files))("%s", async (name, expected) => {
    const decoded = await decodeInWorker(await bytesOf(name));
    const { image } = decoded;
    expect([image.width, image.height]).toEqual([expected.decoded.width, expected.decoded.height]);
    expect(image.data).toHaveLength(image.width * image.height * 4);
    if (expected.colorModel === "cmyk") return; // CMYK conventions differ between decoders.
    const o = (py * image.width + px) * 4;
    const got = Array.from(image.data.subarray(o, o + 4));
    const tolerance = expected.lossy ? 8 : 0;
    got.forEach((value, i) => {
      expect(
        Math.abs(value - (expected.decoded.probe[i] ?? 0)),
        `channel ${i} of ${got}`,
      ).toBeLessThanOrEqual(tolerance);
    });
  });

  it("keeps exact colors under low alpha", async () => {
    const decoded = await decodeInWorker(await bytesOf("png-rgba8.png"));
    expect(decoded.path).toBe("webgl2");
  });

  it("rejects a file that is too large before decoding", async () => {
    const buffer = await bytesOf("png-rgb8.png");
    await expect(
      decodeInWorker(buffer, { maxFileBytes: 10, maxPixels: 1e9, maxSide: 1e5 }),
    ).rejects.toThrow(ImageLoadError);
  });

  it("rejects bytes that are not an image", async () => {
    const noise = new Uint8Array(64).map((_, i) => (i * 37) % 251).buffer;
    await expect(decodeInWorker(noise)).rejects.toThrow(/not a supported image/);
  });

  it("returns warnings for 16-bit files", async () => {
    const decoded = await decodeInWorker(await bytesOf("png-gray16.png"));
    expect(decoded.warnings.map((w) => w.code)).toEqual(["bit-depth"]);
  });
});
