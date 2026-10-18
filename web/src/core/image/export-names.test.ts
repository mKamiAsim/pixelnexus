import { describe, expect, it } from "vitest";

import {
  exportFileName,
  resizeTo,
  sanitizeFilePart,
  stripExtension,
} from "@/core/image/export-names";

describe("export names", () => {
  it("builds the pattern from requirements 2", () => {
    expect(exportFileName("original-name.jpg", "png", "gaussian-blur_sigma-2")).toBe(
      "original-name_gaussian-blur_sigma-2.png",
    );
  });

  it("uses the right extension and handles names without one", () => {
    expect(exportFileName("photo", "jpeg")).toBe("photo.jpg");
    expect(exportFileName("scan.final.tiff", "tiff")).toBe("scan.final.tif");
  });

  it("removes unsafe characters and accents", () => {
    expect(sanitizeFilePart("Café / plan: v2?")).toBe("Cafe-plan-v2");
    expect(exportFileName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(exportFileName("C:\\photos\\cat.jpeg", "png")).toBe("cat.png");
    expect(exportFileName("   ", "webp")).toBe("image.webp");
  });

  it("strips only the last extension", () => {
    expect(stripExtension("a.b.c")).toBe("a.b");
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
});

describe("resizeTo", () => {
  const size = { width: 400, height: 300 };
  it("keeps the aspect ratio", () => {
    expect(resizeTo(size, { width: 200 })).toEqual({ width: 200, height: 150 });
    expect(resizeTo(size, { height: 30 })).toEqual({ width: 40, height: 30 });
  });
  it("can ignore the aspect ratio and never goes below one pixel", () => {
    expect(resizeTo(size, { width: 10, height: 0 }, false)).toEqual({ width: 10, height: 1 });
  });
});
