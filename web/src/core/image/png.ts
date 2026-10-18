/**
 * Exact PNG encoder: 8-bit RGBA, straight alpha, no metadata except an sRGB chunk.
 *
 * Browsers encode PNG from a canvas, which stores colors multiplied by alpha. That rounds
 * semi-transparent colors. This encoder writes the pixel values exactly as they are.
 * Compression uses the CompressionStream API with the zlib ("deflate") format that PNG needs.
 */
import type { RgbaImage } from "@/core/image/types";

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, start = 0xffffffff): number {
  let c = start;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Filter each row with the PNG filter (None, Sub, Up, Average or Paeth) that gives the smallest
 * sum of absolute values. This is the usual heuristic from the PNG specification.
 */
export function filterRows(image: RgbaImage): Uint8Array {
  const stride = image.width * 4;
  const out = new Uint8Array((stride + 1) * image.height);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < image.height; y++) {
    const row = image.data.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? image.data.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const target = candidates[f] ?? zero;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = row[i] ?? 0;
        const a = i >= 4 ? (row[i - 4] ?? 0) : 0;
        const b = above[i] ?? 0;
        const c = i >= 4 ? (above[i - 4] ?? 0) : 0;
        const predicted =
          f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const value = (x - predicted) & 0xff;
        target[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const offset = y * (stride + 1);
    out[offset] = best;
    out.set(candidates[best] ?? zero, offset + 1);
  }
  return out;
}

/** Bytes as a stream, without Blob.stream, which some test environments lack. */
function streamOf(data: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data.slice());
      controller.close();
    },
  });
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = streamOf(data).pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encode an image as PNG bytes. */
export async function encodePng(image: RgbaImage): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  header[8] = 8; // bits per channel
  header[9] = 6; // color type: RGBA
  const parts = [
    SIGNATURE,
    chunk("IHDR", header),
    chunk("sRGB", new Uint8Array([0])), // perceptual rendering intent
    chunk("IDAT", await zlib(filterRows(image))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = streamOf(data).pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decode an 8-bit RGBA PNG without interlacing, as encodePng writes it, exactly. Project files
 * use it, so their images come back byte for byte. Other PNG kinds are refused; the studio opens
 * those through the browser's decoder.
 */
export async function decodePng(bytes: Uint8Array): Promise<RgbaImage> {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error("This is not a PNG file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, color, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || color !== 6 || interlace !== 0) {
        throw new Error("Only 8-bit RGBA PNG files without interlacing can be read here.");
      }
    } else if (type === "IDAT") {
      parts.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = await inflate(joined);
  const stride = width * 4;
  if (raw.length < (stride + 1) * height) throw new Error("The PNG data is too short.");
  const data = new Uint8ClampedArray(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const value = raw[row + x] ?? 0;
      const left = x >= 4 ? (data[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (data[(y - 1) * stride + x] ?? 0) : 0;
      const corner = x >= 4 && y > 0 ? (data[(y - 1) * stride + x - 4] ?? 0) : 0;
      const add =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : filter === 4
                  ? paeth(left, up, corner)
                  : -1;
      if (add < 0) throw new Error("The PNG uses an unknown row filter.");
      data[y * stride + x] = (value + add) & 255;
    }
  }
  return { width, height, data };
}
