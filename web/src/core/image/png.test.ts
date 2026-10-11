import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readImageHeader } from "@/core/image/format";
import { crc32, encodePng } from "@/core/image/png";
import { softAlphaDisk } from "@/core/image/synthetic";
import { createImage } from "@/core/image/types";

/** Undo the PNG row filters, to compare with the original pixels. */
function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= 4 ? (out[y * stride + i - 4] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= 4 && y > 0 ? (out[(y - 1) * stride + i - 4] ?? 0) : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][type] ?? 0;
      out[y * stride + i] = (x + predicted) & 0xff;
    }
  }
  return out;
}

function idat(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset);
  let offset = 8;
  const parts: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

describe("exact PNG encoder", () => {
  it("matches the standard CRC-32 check value", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect((crc32(bytes) ^ 0xffffffff) >>> 0).toBe(0xcbf43926);
  });

  it("keeps semi-transparent pixels exact", async () => {
    const image = softAlphaDisk(41, 29);
    const png = await encodePng(image);
    const header = readImageHeader(png);
    expect(header).toMatchObject({
      width: 41,
      height: 29,
      bitDepth: 8,
      channels: 4,
      hasAlpha: true,
    });
    const pixels = unfilter(inflateSync(idat(png)), 41, 29);
    expect(Array.from(pixels)).toEqual(Array.from(image.data));
  });

  it("encodes a fully transparent image", async () => {
    const png = await encodePng(createImage(3, 3));
    expect(unfilter(inflateSync(idat(png)), 3, 3).every((v) => v === 0)).toBe(true);
  });
});
