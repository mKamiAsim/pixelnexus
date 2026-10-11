/**
 * Keyboard shortcut strings such as "Mod+Shift+Z".
 * "Mod" means Cmd on Apple devices and Ctrl everywhere else.
 */

export const isApple =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export interface ParsedShortcut {
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly key: string;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+");
  // "Mod+Plus" style names avoid a literal "+" inside the string.
  const key = (parts.pop() ?? "").toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return { mod: mods.has("mod"), shift: mods.has("shift"), alt: mods.has("alt"), key };
}

const KEY_ALIASES: Record<string, string> = {
  "+": "plus",
  "=": "plus",
  "-": "minus",
  _: "minus",
  "/": "slash",
  "?": "slash",
  "\\": "backslash",
  "'": "quote",
  " ": "space",
  escape: "esc",
};

/** Normalize a KeyboardEvent key so "=" and "+" both read as "plus". */
export function eventKey(event: Pick<KeyboardEvent, "key" | "code">): string {
  const key = event.key.toLowerCase();
  if (event.code === "Equal" || event.code === "NumpadAdd") return "plus";
  if (event.code === "Minus" || event.code === "NumpadSubtract") return "minus";
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  return KEY_ALIASES[key] ?? key;
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  shortcut: string,
  apple = isApple,
): boolean {
  const parsed = parseShortcut(shortcut);
  const mod = apple ? event.metaKey : event.ctrlKey;
  const extraMod = apple ? event.ctrlKey : event.metaKey;
  // Shift is ignored for keys that need it on some layouts, such as "+" and "?".
  const shiftMatters = !["plus", "slash"].includes(parsed.key);
  return (
    mod === parsed.mod &&
    !extraMod &&
    event.altKey === parsed.alt &&
    (!shiftMatters || event.shiftKey === parsed.shift) &&
    eventKey(event) === parsed.key
  );
}

/** Text for menus and tooltips, for example "Ctrl+Shift+Z" or "Cmd+Shift+Z". */
export function displayShortcut(shortcut: string, apple = isApple): string {
  const names: Record<string, string> = {
    mod: apple ? "Cmd" : "Ctrl",
    plus: "+",
    minus: "-",
    slash: "/",
    backslash: "\\",
    esc: "Esc",
    quote: "'",
  };
  return shortcut
    .split("+")
    .map((part) => names[part.toLowerCase()] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}
