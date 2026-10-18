/**
 * The color themes. Each id matches a [data-theme] block in tokens.css.
 * The choice is a per-browser convenience, so it lives in localStorage. Storage can be blocked
 * (private windows, strict settings), so every access is guarded and the light theme is the fallback.
 */

export const THEMES = [
  { id: "light", name: "Light", scheme: "light" },
  { id: "dim", name: "Dim", scheme: "dark" },
  { id: "dark", name: "Dark", scheme: "dark" },
  { id: "midnight", name: "Midnight", scheme: "dark" },
  { id: "contrast", name: "High contrast", scheme: "dark" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "light";

const STORAGE_KEY = "pixelnexus.theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** The saved theme, or the default when nothing valid is saved. */
export function storedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isThemeId(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Switch the theme on the page and remember the choice when storage allows it. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage is blocked. The theme still applies for this visit.
  }
}
