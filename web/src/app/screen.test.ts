// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { presetForScreen, screenClass } from "./layout";

beforeEach(() => localStorage.clear());

describe("layouts for the screen size", () => {
  it("sorts widths into phone, tablet and desktop", () => {
    expect([screenClass(375), screenClass(768), screenClass(1179), screenClass(1180)]).toEqual([
      "phone",
      "tablet",
      "tablet",
      "desktop",
    ]);
  });

  it("changes the layout only when the screen class changes", () => {
    expect(presetForScreen(1600)).toBeNull(); // A first visit on a desktop keeps its layout.
    expect(presetForScreen(375)).toBe("phone");
    expect(presetForScreen(390)).toBeNull();
    expect(presetForScreen(900)).toBe("compact");
    // Back on a desktop, your own last choice returns.
    localStorage.setItem("pixelnexus.preset.v1", "study");
    expect(presetForScreen(1600)).toBe("study");
  });
});
