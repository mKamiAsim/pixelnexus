import { describe, expect, it } from "vitest";

import { buildCommands, MENUS } from "./commands";
import { scoreCommand, searchCommands } from "./palette";
import { parseShortcut } from "./shortcuts";

const commands = buildCommands();
const labels = (query: string) => searchCommands(commands, query).map((c) => c.label);

describe("command list", () => {
  it("gives every command a unique id and a known menu", () => {
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const menus = new Set(MENUS.map((m) => m.id));
    for (const command of commands) expect(menus.has(command.menu)).toBe(true);
  });

  it("never gives two commands the same shortcut", () => {
    const shortcuts = commands.flatMap((c) => (c.shortcut ? [c.shortcut.toLowerCase()] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("covers the shortcuts that the requirements ask for", () => {
    const byShortcut = new Map(commands.map((c) => [c.shortcut, c.id]));
    expect(byShortcut.get("Mod+Z")).toBe("edit.undo");
    expect(byShortcut.get("Mod+Shift+Z")).toBe("edit.redo");
    expect(byShortcut.get("Mod+0")).toBe("view.fit");
    expect(byShortcut.get("Mod+Plus")).toBe("view.zoom-in");
    expect(byShortcut.get("Mod+Minus")).toBe("view.zoom-out");
    expect(byShortcut.get("Mod+S")).toBe("file.export");
    expect(byShortcut.get("Mod+D")).toBe("select.deselect");
  });

  it("writes every shortcut in a form the parser reads", () => {
    for (const command of commands) {
      if (!command.shortcut) continue;
      expect(parseShortcut(command.shortcut).key).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("command palette search", () => {
  it("lists every command for an empty query", () => {
    expect(searchCommands(commands, "  ")).toHaveLength(commands.length);
  });

  it("ranks label matches first", () => {
    expect(labels("zoom")[0]).toBe("Zoom in");
    expect(labels("rotate 180")[0]).toBe("Rotate 180 degrees");
    expect(labels("export")[0]).toBe("Export...");
  });

  it("finds commands by keywords and menu path", () => {
    expect(labels("mirror")).toEqual(expect.arrayContaining(["Flip horizontal", "Flip vertical"]));
    expect(labels("siemens")).toContain("Siemens star");
    expect(labels("dark")).toContain("Dark");
  });

  it("requires every word to match", () => {
    expect(labels("zoom qqq")).toEqual([]);
    const fit = commands.find((c) => c.id === "view.fit");
    expect(fit && scoreCommand(fit, "fit screen")).toBeGreaterThan(0);
  });

  it("ignores case and accents", () => {
    expect(labels("ZOOM")[0]).toBe("Zoom in");
    expect(labels("pïxel")).toContain("Pixel grid");
  });
});
