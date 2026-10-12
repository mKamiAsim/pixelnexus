/** Search for the command palette. Pure, so it is easy to test. */
import type { Command } from "./commands";

/** Lower case, accents removed, so "Pixel" matches "pixel". */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/**
 * Score how well a command matches every word of the query. Higher is better. Zero means no
 * match. The label counts most, then the menu path, then the extra keywords.
 */
export function scoreCommand(command: Command, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const label = normalize(command.label);
  const path = normalize(`${command.menu} ${command.submenu ?? ""}`);
  const keywords = normalize(command.keywords ?? "");
  let score = 0;
  for (const word of words) {
    if (label.startsWith(word)) score += 8;
    else if (label.split(/[\s()]+/).some((part) => part.startsWith(word))) score += 6;
    else if (label.includes(word)) score += 4;
    else if (path.split(/\s+/).some((part) => part.startsWith(word))) score += 2;
    else if (keywords.split(/\s+/).some((part) => part.startsWith(word))) score += 2;
    else return 0;
  }
  return score;
}

/** Matching commands, best first. Ties keep the menu order. */
export function searchCommands(commands: readonly Command[], query: string): Command[] {
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}
