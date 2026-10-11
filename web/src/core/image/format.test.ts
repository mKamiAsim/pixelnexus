import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ImageFormatError, readImageHeader, sniffFormat } from "@/core/image/format";
import { checkImage } from "@/core/image/limits";

const dir = fileURLToPath(new URL("../../../tests/fixtures/formats/", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
  files: Record<string, Record<string, unknown>>;
};
const read = (name: string) => new Uint8Array(readFileSync(path.join(dir, name)));
const HEADER_KEYS = [
  "format",
  "width",
  "height",
  "bitDepth",
  "channels",
  "colorModel",
  "hasAlpha",
  "hasColorProfile",
  "frames",
  "orientation",
];

describe("readImageHeader with files written by Pillow", () => {
  it("covers every file in the manifest", () => {
    const files = readdirSync(dir).filter((name) => name !== "manifest.json");
    expect(files.sort()).toEqual(Object.keys(manifest.files).sort());
  });

  it.each(Object.entries(manifest.files))("%s", (name, expected) => {
    const header = readImageHeader(read(name));
    for (const key of HEADER_KEYS) {
      if (key in expected) expect(header[key as keyof typeof header], key).toEqual(expected[key]);
    }
  });
});

describe("damaged and unknown files", () => {
  it("does not recognize random bytes", () => {
    const noise = Uint8Array.from({ length: 256 }, (_, i) => (i * 73 + 41) % 251);
    expect(sniffFormat(noise)).toBeNull();
    expect(() => readImageHeader(noise)).toThrow(ImageFormatError);
  });

  it.each(Object.keys(manifest.files))("%s fails cleanly when cut short", (name) => {
    const bytes = read(name);
    for (const length of [4, 9, 16, 24, 33, 64, 100]) {
      if (length >= bytes.length) continue;
      try {
        readImageHeader(bytes.subarray(0, length));
      } catch (error) {
        expect(error).toBeInstanceOf(ImageFormatError);
      }
    }
  });
});

describe("checkImage", () => {
  const png = readImageHeader(read("png-rgb8.png"));

  it("accepts a small image without issues", () => {
    expect(checkImage(1000, png)).toEqual([]);
  });

  it("rejects files and images above the limits", () => {
    const codes = checkImage(5000, png, { maxFileBytes: 100, maxPixels: 10, maxSide: 20 }).map(
      (issue) => `${issue.level}:${issue.code}`,
    );
    expect(codes).toEqual(["error:file-too-large", "error:too-many-pixels", "error:side-too-long"]);
  });

  it("warns about what decoding changes", () => {
    const codes = (name: string) =>
      checkImage(1000, readImageHeader(read(name))).map((issue) => issue.code);
    expect(codes("png-gray16.png")).toEqual(["bit-depth"]);
    expect(codes("png-icc.png")).toEqual(["color-profile"]);
    expect(codes("gif-anim.gif")).toEqual(["frames"]);
    expect(codes("jpeg-cmyk.jpg")).toEqual(["cmyk"]);
    expect(codes("jpeg-exif-orient6.jpg")).toEqual(["orientation"]);
  });
});
