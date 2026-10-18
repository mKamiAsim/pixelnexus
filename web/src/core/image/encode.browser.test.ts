import { describe, expect, it } from "vitest";

import { encodeImage } from "@/core/image/encode";
import { readImageHeader } from "@/core/image/format";
import { resizeImage } from "@/core/image/resize";
import { softAlphaDisk } from "@/core/image/synthetic";
import { decodeInWorker } from "@/core/workers/decode-client";

/** A small image with every alpha level, so rounding of semi-transparent colors would show. */
const image = softAlphaDisk(48, 32);

async function roundTrip(format: "png" | "tiff" | "jpeg" | "webp", quality?: number) {
  const blob = await encodeImage(image, { format, quality });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { blob, header: readImageHeader(bytes), decoded: await decodeInWorker(bytes.buffer) };
}

describe("export encoders in a real browser", () => {
  it("writes PNG that decodes to the exact same pixels", async () => {
    const { blob, header, decoded } = await roundTrip("png");
    expect(blob.type).toBe("image/png");
    expect(header).toMatchObject({ format: "png", width: 48, height: 32, hasColorProfile: false });
    expect(decoded.image.data).toEqual(image.data);
  });

  it("writes TIFF that decodes to the exact same pixels", async () => {
    const { blob, header, decoded } = await roundTrip("tiff");
    expect(blob.type).toBe("image/tiff");
    expect(header).toMatchObject({ format: "tiff", width: 48, height: 32 });
    expect(decoded.image.data).toEqual(image.data);
  });

  it("writes JPEG without alpha, over a white background", async () => {
    const { blob, header, decoded } = await roundTrip("jpeg", 0.95);
    expect(blob.type).toBe("image/jpeg");
    expect(header).toMatchObject({ format: "jpeg", width: 48, height: 32 });
    // The corner is fully transparent in the source, so it becomes white (lossy, so near white).
    const corner = Array.from(decoded.image.data.subarray(0, 4));
    corner.slice(0, 3).forEach((v) => expect(v).toBeGreaterThanOrEqual(245));
    expect(corner[3]).toBe(255);
  });

  it("writes WebP and keeps transparency", async () => {
    const { blob, header, decoded } = await roundTrip("webp", 0.9);
    expect(blob.type).toBe("image/webp");
    expect(header).toMatchObject({ format: "webp", width: 48, height: 32 });
    expect(decoded.image.data[3]).toBe(0);
  });

  it("makes smaller JPEG files at lower quality", async () => {
    const high = await encodeImage(image, { format: "jpeg", quality: 0.95 });
    const low = await encodeImage(image, { format: "jpeg", quality: 0.2 });
    expect(low.size).toBeLessThan(high.size);
  });

  it("resizes to the requested size", async () => {
    const out = await resizeImage(image, 24, 16);
    expect([out.width, out.height]).toEqual([24, 16]);
    expect(out.data).toHaveLength(24 * 16 * 4);
    expect(await resizeImage(image, 48, 32)).toBe(image);
  });
});
