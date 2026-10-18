import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCommands } from "../../src/app/commands";
import { displayShortcut } from "../../src/app/shortcuts";

/**
 * The keyboard shortcut page in the docs is written by hand. This test keeps it equal to the
 * command list, which is the source of truth for menus, keys and the command palette.
 */
const page = readFileSync(
  new URL("../../../docs/user-guide/keyboard-shortcuts.md", import.meta.url),
  "utf8",
);

/** Rows of the "Commands" table: label, Windows and Linux key, macOS key. */
function documentedRows(): Map<string, [string, string]> {
  const section = page.split("## Commands")[1]?.split("\n## ")[0] ?? "";
  const rows = new Map<string, [string, string]>();
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const [, label, , pc, mac] = cells;
    if (!label || !pc?.startsWith("`") || !mac) continue;
    rows.set(label, [pc.replaceAll("`", ""), mac.replaceAll("`", "")]);
  }
  return rows;
}

describe("keyboard shortcut docs", () => {
  const commands = buildCommands().filter((command) => command.shortcut);
  const rows = documentedRows();

  it("lists every command that has a shortcut, with the right keys", () => {
    for (const command of commands) {
      const shortcut = command.shortcut ?? "";
      expect(rows.get(command.label), command.label).toEqual([
        displayShortcut(shortcut, false),
        displayShortcut(shortcut, true),
      ]);
    }
  });

  it("lists no shortcut that the studio does not have", () => {
    const labels = new Set(commands.map((command) => command.label));
    expect([...rows.keys()].filter((label) => !labels.has(label))).toEqual([]);
  });
});
