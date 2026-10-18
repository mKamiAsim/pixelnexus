import { describe, expect, it } from "vitest";

import { displayShortcut, matchesShortcut } from "./shortcuts";

const key = (k: string, code: string, mods: Partial<KeyboardEvent> = {}) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("shortcuts", () => {
  it("maps Mod to Ctrl or Cmd", () => {
    expect(matchesShortcut(key("o", "KeyO", { ctrlKey: true }), "Mod+O", false)).toBe(true);
    expect(matchesShortcut(key("o", "KeyO", { metaKey: true }), "Mod+O", true)).toBe(true);
    expect(matchesShortcut(key("o", "KeyO", { metaKey: true }), "Mod+O", false)).toBe(false);
  });

  it("requires the exact modifiers", () => {
    expect(
      matchesShortcut(key("z", "KeyZ", { ctrlKey: true, shiftKey: true }), "Mod+Z", false),
    ).toBe(false);
    expect(
      matchesShortcut(key("Z", "KeyZ", { ctrlKey: true, shiftKey: true }), "Mod+Shift+Z", false),
    ).toBe(true);
    expect(matchesShortcut(key("h", "KeyH", { ctrlKey: true }), "H", false)).toBe(false);
  });

  it("treats = and + as the same zoom key, with or without Shift", () => {
    expect(matchesShortcut(key("=", "Equal", { ctrlKey: true }), "Mod+Plus", false)).toBe(true);
    expect(
      matchesShortcut(key("+", "Equal", { ctrlKey: true, shiftKey: true }), "Mod+Plus", false),
    ).toBe(true);
    expect(matchesShortcut(key("-", "Minus", { ctrlKey: true }), "Mod+Minus", false)).toBe(true);
  });

  it("reads digits by key code, so layouts do not matter", () => {
    expect(matchesShortcut(key("à", "Digit0", { ctrlKey: true }), "Mod+0", false)).toBe(true);
  });

  it("shows readable labels", () => {
    expect(displayShortcut("Mod+Shift+Z", false)).toBe("Ctrl+Shift+Z");
    expect(displayShortcut("Mod+Plus", true)).toBe("Cmd++");
    expect(displayShortcut("Mod+Slash", false)).toBe("Ctrl+/");
  });
});
