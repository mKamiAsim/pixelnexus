/** Rules for numeric parameter values. Pure functions, shared by every numeric control. */

export interface NumberRules {
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  /** Only odd integers are valid, as for kernel sizes. */
  oddOnly?: boolean;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Clamp and snap a value to the rules. Returns null when the input is not a finite number. */
export function normalizeNumber(value: number, rules: NumberRules): number | null {
  if (!Number.isFinite(value)) return null;
  const { min = -Infinity, max = Infinity, step, integer = false, oddOnly = false } = rules;
  let v = Math.min(max, Math.max(min, value));
  if (integer || oddOnly) {
    v = Math.round(v);
  } else if (step) {
    const base = Number.isFinite(min) ? min : 0;
    v = base + Math.round((v - base) / step) * step;
    v = Number(v.toFixed(decimalsOf(step)));
  }
  if (oddOnly && v % 2 === 0) {
    v = v + 1 <= max ? v + 1 : v - 1;
  }
  return Math.min(max, Math.max(min, v));
}

/** Parse what the user typed. Accepts a comma as the decimal mark. */
export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(",", ".");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

/** Format for display with a fixed number of decimals taken from the step. */
export function formatNumber(value: number, rules: NumberRules): string {
  if (rules.integer || rules.oddOnly) return String(Math.round(value));
  const decimals = rules.step ? decimalsOf(rules.step) : 2;
  return value.toFixed(decimals);
}

/** One keyboard or scrub increment. Shift makes it ten times larger. */
export function stepNumber(value: number, direction: 1 | -1, rules: NumberRules, big = false) {
  const unit = rules.oddOnly ? 2 : (rules.step ?? (rules.integer ? 1 : 0.1));
  return normalizeNumber(value + direction * unit * (big ? 10 : 1), rules) ?? value;
}
