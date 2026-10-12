import { describe, expect, it } from "vitest";

import { fixed, formatBytes, formatSize, hexColor } from "./format";

describe("interface formatting", () => {
  it("formats file sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(30 * 1024 * 1024)).toBe("30.0 MB");
  });

  it("drops the minus sign on values that round to zero", () => {
    expect(fixed(-0.0001, 2)).toBe("0.00");
    expect(fixed(-1.234, 1)).toBe("-1.2");
  });

  it("formats sizes and colors", () => {
    expect(formatSize({ width: 640, height: 480 })).toBe("640 x 480 px");
    expect(hexColor(255, 8, 171)).toBe("#FF08AB");
  });
});
