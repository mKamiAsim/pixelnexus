/** Helpers for end-to-end tests. They run in Node, not in the page. */
import { crc32, deflateSync, inflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * An 8-bit RGB PNG made from a pixel function. Large images compress well when the pattern is
 * smooth, so a 6000x6000 test file stays small.
 */
export function makePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = row + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A colorful test pattern: gradients plus a grid every 64 pixels. */
export function pattern(width: number, height: number) {
  return (x: number, y: number): [number, number, number] => {
    const grid = x % 64 === 0 || y % 64 === 0;
    return grid
      ? [255, 255, 255]
      : [Math.round((255 * x) / width), Math.round((255 * y) / height), 128];
  };
}

/** The first bytes of each export format. */
export const MAGIC: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46],
  tif: [0x49, 0x49, 0x2a, 0x00],
};

/**
 * Decode an 8-bit RGB or RGBA PNG, as the studio exports them, to raw bytes. Enough to compare
 * exported pixels exactly. It undoes the five PNG row filters.
 */
export function readPng(png: Buffer): {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
} {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("Only 8-bit PNG files are supported.");
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error("Only RGB and RGBA PNG files are supported.");
    } else if (type === "IDAT") parts.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= channels ? (out[y * stride + i - channels] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= channels && y > 0 ? (out[(y - 1) * stride + i - channels] ?? 0) : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      out[y * stride + i] = (x + predicted) & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}
