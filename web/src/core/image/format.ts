/**
 * Detect image formats and read header facts without decoding pixels.
 *
 * Reading the header first lets the studio reject a file that is too large before the browser
 * spends memory on it, and lets it warn about facts the browser decoder hides, such as 16-bit
 * channels or an embedded color profile.
 *
 * Every parser checks bounds. A damaged or truncated file raises ImageFormatError instead of
 * reading past the end of the data.
 */

export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "bmp" | "tiff" | "avif";

export type ColorModel = "gray" | "rgb" | "palette" | "cmyk" | "ycbcr";

export interface ImageHeader {
  readonly format: ImageFormat;
  /** Stored width, before any EXIF rotation. */
  readonly width: number;
  /** Stored height, before any EXIF rotation. */
  readonly height: number;
  /** Bits per channel in the file, when the header states it. */
  readonly bitDepth?: number;
  /** Channels in the file, for example 1 for gray or 4 for RGBA and CMYK. */
  readonly channels?: number;
  readonly colorModel?: ColorModel;
  readonly hasAlpha?: boolean;
  readonly hasColorProfile?: boolean;
  readonly colorProfileName?: string;
  /** Frames in an animation, or pages in a TIFF file. */
  readonly frames?: number;
  /** EXIF orientation from 1 to 8. Values 5 to 8 swap width and height when displayed. */
  readonly orientation?: number;
}

export const MIME_TYPES: Readonly<Record<ImageFormat, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  avif: "image/avif",
};

export class ImageFormatError extends Error {
  override name = "ImageFormatError";
}

/** Bounds-checked reads. Every read past the end throws ImageFormatError. */
class Reader {
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length(): number {
    return this.bytes.length;
  }
  private need(offset: number, size: number): void {
    if (offset < 0 || offset + size > this.bytes.length) {
      throw new ImageFormatError("The file ends too early. It may be damaged or incomplete.");
    }
  }
  u8(offset: number): number {
    this.need(offset, 1);
    return this.view.getUint8(offset);
  }
  u16(offset: number, little = false): number {
    this.need(offset, 2);
    return this.view.getUint16(offset, little);
  }
  u24le(offset: number): number {
    return this.u16(offset, true) | (this.u8(offset + 2) << 16);
  }
  u32(offset: number, little = false): number {
    this.need(offset, 4);
    return this.view.getUint32(offset, little);
  }
  i32(offset: number, little = false): number {
    this.need(offset, 4);
    return this.view.getInt32(offset, little);
  }
  ascii(offset: number, size: number): string {
    this.need(offset, size);
    return String.fromCharCode(...this.bytes.subarray(offset, offset + size));
  }
  startsWith(values: readonly number[], offset = 0): boolean {
    return values.every((value, i) => this.bytes[offset + i] === value);
  }
  indexOf(text: string, from = 0, limit = this.bytes.length): number {
    const codes = Array.from(text, (c) => c.charCodeAt(0));
    const end = Math.min(limit, this.bytes.length) - codes.length;
    for (let i = from; i <= end; i++) {
      if (codes.every((code, j) => this.bytes[i + j] === code)) return i;
    }
    return -1;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Identify the format from the first bytes. The file name and MIME type are not trusted. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  const r = new Reader(bytes);
  if (bytes.length >= 8 && r.startsWith(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 3 && r.startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  if (bytes.length >= 12 && r.ascii(0, 4) === "RIFF" && r.ascii(8, 4) === "WEBP") return "webp";
  if (bytes.length >= 6 && (r.ascii(0, 6) === "GIF87a" || r.ascii(0, 6) === "GIF89a")) {
    return "gif";
  }
  if (bytes.length >= 14 && r.ascii(0, 2) === "BM") return "bmp";
  if (
    bytes.length >= 4 &&
    (r.startsWith([0x49, 0x49, 0x2a, 0x00]) || r.startsWith([0x4d, 0x4d, 0x00, 0x2a]))
  ) {
    return "tiff";
  }
  if (bytes.length >= 12 && r.ascii(4, 4) === "ftyp") {
    const brands = r.ascii(8, Math.min(bytes.length - 8, 32));
    if (/avif|avis/.test(brands)) return "avif";
  }
  return null;
}

/** Read the header facts of a supported image. */
export function readImageHeader(bytes: Uint8Array): ImageHeader {
  const format = sniffFormat(bytes);
  if (!format) {
    throw new ImageFormatError(
      "This file is not a supported image. Use PNG, JPEG, WebP, AVIF, GIF, BMP or TIFF.",
    );
  }
  const r = new Reader(bytes);
  const header = PARSERS[format](r);
  if (!(header.width > 0 && header.height > 0)) {
    throw new ImageFormatError("The image header has no valid size.");
  }
  return header;
}

const PARSERS: Record<ImageFormat, (r: Reader) => ImageHeader> = {
  png: readPng,
  jpeg: readJpeg,
  webp: readWebp,
  gif: readGif,
  bmp: readBmp,
  tiff: readTiff,
  avif: readAvif,
};

function readPng(r: Reader): ImageHeader {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  let hasTrns = false;
  let profile: string | undefined;
  let frames: number | undefined;
  while (offset + 8 <= r.length) {
    const length = r.u32(offset);
    const type = r.ascii(offset + 4, 4);
    const data = offset + 8;
    if (type === "IHDR") {
      width = r.u32(data);
      height = r.u32(data + 4);
      bitDepth = r.u8(data + 8);
      colorType = r.u8(data + 9);
    } else if (type === "tRNS") {
      hasTrns = true;
    } else if (type === "iCCP") {
      let end = data;
      while (end < data + Math.min(length, 80) && r.u8(end) !== 0) end++;
      profile = r.ascii(data, end - data);
    } else if (type === "acTL") {
      frames = r.u32(data);
    } else if (type === "IDAT" || type === "IEND") {
      break;
    }
    offset = data + length + 4;
  }
  const models: Record<number, [ColorModel, number, boolean]> = {
    0: ["gray", 1, false],
    2: ["rgb", 3, false],
    3: ["palette", 3, false],
    4: ["gray", 2, true],
    6: ["rgb", 4, true],
  };
  const [colorModel, channels, alpha] = models[colorType] ?? ["rgb", 3, false];
  return {
    format: "png",
    width,
    height,
    bitDepth,
    channels,
    colorModel,
    hasAlpha: alpha || hasTrns,
    hasColorProfile: profile !== undefined,
    ...(profile !== undefined ? { colorProfileName: profile } : {}),
    ...(frames !== undefined ? { frames } : {}),
  };
}

function exifOrientation(r: Reader, tiffStart: number): number | undefined {
  const little = r.ascii(tiffStart, 2) === "II";
  const ifd = tiffStart + r.u32(tiffStart + 4, little);
  const count = r.u16(ifd, little);
  for (let i = 0; i < Math.min(count, 512); i++) {
    const entry = ifd + 2 + i * 12;
    if (r.u16(entry, little) === 0x0112) {
      const value = r.u16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}

function readJpeg(r: Reader): ImageHeader {
  let offset = 2;
  let size: { width: number; height: number; precision: number; components: number } | null = null;
  let orientation: number | undefined;
  let hasProfile = false;
  while (offset + 4 <= r.length) {
    if (r.u8(offset) !== 0xff) {
      throw new ImageFormatError("The JPEG data is damaged.");
    }
    let marker = r.u8(offset + 1);
    while (marker === 0xff) {
      offset += 1;
      marker = r.u8(offset + 1);
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = r.u16(offset + 2);
    const data = offset + 4;
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      size = {
        precision: r.u8(data),
        height: r.u16(data + 1),
        width: r.u16(data + 3),
        components: r.u8(data + 5),
      };
    } else if (marker === 0xe1 && length >= 14 && r.ascii(data, 6) === "Exif\0\0") {
      orientation = exifOrientation(r, data + 6);
    } else if (marker === 0xe2 && length >= 14 && r.ascii(data, 12) === "ICC_PROFILE\0") {
      hasProfile = true;
    }
    offset = offset + 2 + length;
  }
  if (!size) throw new ImageFormatError("The JPEG file has no image size.");
  const colorModel: ColorModel =
    size.components === 1 ? "gray" : size.components === 4 ? "cmyk" : "ycbcr";
  return {
    format: "jpeg",
    width: size.width,
    height: size.height,
    bitDepth: size.precision,
    channels: size.components,
    colorModel,
    hasAlpha: false,
    hasColorProfile: hasProfile,
    ...(orientation !== undefined ? { orientation } : {}),
  };
}

function readWebp(r: Reader): ImageHeader {
  let offset = 12;
  let header: ImageHeader | null = null;
  let frames = 0;
  let hasProfile = false;
  while (offset + 8 <= r.length) {
    const type = r.ascii(offset, 4);
    const size = r.u32(offset + 4, true);
    const data = offset + 8;
    if (type === "VP8X") {
      const flags = r.u8(data);
      hasProfile = (flags & 0x20) !== 0;
      header = {
        format: "webp",
        width: r.u24le(data + 4) + 1,
        height: r.u24le(data + 7) + 1,
        bitDepth: 8,
        hasAlpha: (flags & 0x10) !== 0,
      };
    } else if (type === "VP8 " && !header) {
      if (!r.startsWith([0x9d, 0x01, 0x2a], data + 3)) {
        throw new ImageFormatError("The WebP data is damaged.");
      }
      header = {
        format: "webp",
        width: r.u16(data + 6, true) & 0x3fff,
        height: r.u16(data + 8, true) & 0x3fff,
        bitDepth: 8,
        hasAlpha: false,
      };
    } else if (type === "VP8L" && !header) {
      if (r.u8(data) !== 0x2f) throw new ImageFormatError("The WebP data is damaged.");
      const bits = r.u32(data + 1, true);
      header = {
        format: "webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        bitDepth: 8,
        hasAlpha: ((bits >>> 28) & 1) === 1,
      };
    } else if (type === "ANMF") {
      frames += 1;
    }
    offset = data + size + (size % 2);
  }
  if (!header) throw new ImageFormatError("The WebP file has no image data.");
  return {
    ...header,
    channels: header.hasAlpha ? 4 : 3,
    colorModel: "rgb",
    hasColorProfile: hasProfile,
    ...(frames > 0 ? { frames } : {}),
  };
}

function skipSubBlocks(r: Reader, offset: number): number {
  let o = offset;
  for (;;) {
    const size = r.u8(o);
    o += 1 + size;
    if (size === 0) return o;
  }
}

function readGif(r: Reader): ImageHeader {
  const width = r.u16(6, true);
  const height = r.u16(8, true);
  const flags = r.u8(10);
  let offset = 13 + ((flags & 0x80) !== 0 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  let frames = 0;
  let transparent = false;
  try {
    while (offset < r.length) {
      const block = r.u8(offset);
      if (block === 0x3b) break;
      if (block === 0x21) {
        const label = r.u8(offset + 1);
        if (label === 0xf9 && (r.u8(offset + 3) & 1) === 1) transparent = true;
        offset = skipSubBlocks(r, offset + 2);
      } else if (block === 0x2c) {
        frames += 1;
        const local = r.u8(offset + 9);
        offset += 10 + ((local & 0x80) !== 0 ? 3 * 2 ** ((local & 7) + 1) : 0);
        offset = skipSubBlocks(r, offset + 1);
      } else {
        break;
      }
    }
  } catch (error) {
    // A truncated animation still has a usable first frame.
    if (!(error instanceof ImageFormatError) || frames === 0) throw error;
  }
  return {
    format: "gif",
    width,
    height,
    bitDepth: 8,
    channels: 3,
    colorModel: "palette",
    hasAlpha: transparent,
    frames: Math.max(frames, 1),
  };
}

function readBmp(r: Reader): ImageHeader {
  const dibSize = r.u32(14, true);
  let width: number;
  let height: number;
  let bitsPerPixel: number;
  if (dibSize === 12) {
    width = r.u16(18, true);
    height = r.u16(20, true);
    bitsPerPixel = r.u16(24, true);
  } else {
    width = r.i32(18, true);
    height = Math.abs(r.i32(22, true));
    bitsPerPixel = r.u16(28, true);
  }
  const alphaMask = dibSize >= 56 ? r.u32(66, true) : 0;
  const hasAlpha = bitsPerPixel === 32 && alphaMask !== 0;
  return {
    format: "bmp",
    width,
    height,
    bitDepth: bitsPerPixel === 16 ? 5 : 8,
    channels: hasAlpha ? 4 : 3,
    colorModel: bitsPerPixel <= 8 ? "palette" : "rgb",
    hasAlpha,
    // PROFILE_EMBEDDED is the code 'MBED', stored little-endian.
    hasColorProfile: dibSize >= 124 && r.ascii(70, 4) === "DEBM",
  };
}

function readTiff(r: Reader): ImageHeader {
  const little = r.u8(0) === 0x49;
  let ifd = r.u32(4, little);
  const tags = new Map<number, { type: number; count: number; valueOffset: number }>();
  let pages = 0;
  const seen = new Set<number>();
  while (ifd !== 0 && !seen.has(ifd) && pages < 10000) {
    seen.add(ifd);
    const count = r.u16(ifd, little);
    for (let i = 0; i < count && pages === 0; i++) {
      const entry = ifd + 2 + i * 12;
      tags.set(r.u16(entry, little), {
        type: r.u16(entry + 2, little),
        count: r.u32(entry + 4, little),
        valueOffset: entry + 8,
      });
    }
    pages += 1;
    ifd = r.u32(ifd + 2 + count * 12, little);
  }
  const value = (tag: number): number | undefined => {
    const t = tags.get(tag);
    if (!t) return undefined;
    // SHORT values sit in the first two bytes of the value field. LONG values use all four.
    if (t.type === 3) {
      const position = t.count > 2 ? r.u32(t.valueOffset, little) : t.valueOffset;
      return r.u16(position, little);
    }
    return r.u32(t.valueOffset, little);
  };
  const samples = value(277) ?? 1;
  const photometric = value(262);
  const models: Record<number, ColorModel> = {
    0: "gray",
    1: "gray",
    2: "rgb",
    3: "palette",
    5: "cmyk",
    6: "ycbcr",
  };
  const orientation = value(274);
  return {
    format: "tiff",
    width: value(256) ?? 0,
    height: value(257) ?? 0,
    bitDepth: value(258) ?? 1,
    channels: samples,
    ...(photometric !== undefined && models[photometric]
      ? { colorModel: models[photometric] }
      : {}),
    hasAlpha: tags.has(338),
    hasColorProfile: tags.has(34675),
    frames: pages,
    ...(orientation !== undefined && orientation >= 1 && orientation <= 8 ? { orientation } : {}),
  };
}

function readAvif(r: Reader): ImageHeader {
  // Boxes in AVIF sit near the start. Search a bounded range for the ones we need.
  const limit = Math.min(r.length, 1 << 20);
  const ispe = r.indexOf("ispe", 0, limit);
  if (ispe < 0) throw new ImageFormatError("The AVIF file has no image size.");
  const pixi = r.indexOf("pixi", 0, limit);
  const colr = r.indexOf("colr", 0, limit);
  const colrType = colr >= 0 ? r.ascii(colr + 4, 4) : "";
  const hasAlpha =
    r.indexOf("auxiliary:alpha", 0, limit) >= 0 || r.indexOf("auxid:1", 0, limit) >= 0;
  return {
    format: "avif",
    width: r.u32(ispe + 8),
    height: r.u32(ispe + 12),
    ...(pixi >= 0 ? { bitDepth: r.u8(pixi + 9) } : {}),
    channels: hasAlpha ? 4 : 3,
    colorModel: "rgb",
    hasAlpha,
    hasColorProfile: colrType === "prof" || colrType === "rICC",
  };
}
