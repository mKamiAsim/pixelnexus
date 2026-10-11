import type { ParamValue } from "./params";

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

function formatValue(value: ParamValue): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  return typeof value === "boolean" ? (value ? "\\text{on}" : "\\text{off}") : `\\text{${value}}`;
}

/**
 * Put current parameter values into a catalog formula. Unknown placeholders stay visible as
 * \text{?}, so a mistake shows up in the Inspector instead of silently disappearing.
 */
export function fillFormula(tex: string, values: Readonly<Record<string, ParamValue>>): string {
  return tex.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    return value === undefined ? "\\text{?}" : formatValue(value);
  });
}
