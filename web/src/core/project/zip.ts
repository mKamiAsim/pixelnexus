/**
 * A small ZIP writer and reader for project files. Entries are stored without
 * compression: the images inside are PNG files, which are already compressed. Any unzip tool can
 * open the result. The reader takes stored entries only, as this writer makes them.
 *
 * Format: PKWARE APPNOTE, local file headers, a central directory and its end record.
 */
import { crc32 } from "@/core/image/png";

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const crc = (data: Uint8Array) => (crc32(data) ^ 0xffffffff) >>> 0;

export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const sum = crc(entry.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, sum, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The entries of a stored ZIP, by name. Each entry's CRC is checked. */
export function unzipStore(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endAt = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endAt = i;
      break;
    }
  }
  if (endAt < 0) throw new Error("This file is not a project file. It is not a ZIP archive.");
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("The project file is damaged.");
    const method = view.getUint16(at + 10, true);
    const sum = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) {
      throw new Error(
        `"${name}" in the project file is compressed. Save the project again from PixelNexus.`,
      );
    }
    const localName = view.getUint16(localAt + 26, true);
    const localExtra = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + localName + localExtra;
    const data = bytes.subarray(start, start + size);
    if (crc(data) !== sum) throw new Error(`"${name}" in the project file is damaged.`);
    out.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
