/**
 * Parameter sweeps for the compare grid (PLAN.md Phase 8): the values of one parameter to try
 * side by side, such as sigma 1 to 5. Every value keeps the parameter's own rules: its range,
 * whole numbers for integers, and odd numbers where only those are allowed.
 */
import type { ParamValue } from "@/core/filters/types";
import type { Param } from "@/generated/catalog-types";

export const MAX_CELLS = 12;

/** Parameters a sweep can vary. */
export function sweepable(param: Param): boolean {
  return ["number", "integer", "angle", "select", "boolean"].includes(param.type);
}

/** Round to the parameter's rules. */
function fit(param: Param, value: number): number {
  let v = Math.min(param.max ?? Infinity, Math.max(param.min ?? -Infinity, value));
  if (param.type === "integer") {
    v = Math.round(v);
    if (param.oddOnly && v % 2 === 0) v = v + 1 > (param.max ?? Infinity) ? v - 1 : v + 1;
  } else if (param.step) {
    const base = param.min ?? 0;
    v = base + Math.round((v - base) / param.step) * param.step;
    v = Number(v.toFixed(10));
  }
  return v;
}

/**
 * Evenly spaced values from `from` to `to`, both included, for a number, integer or angle
 * parameter. Every option of a choice, and both states of a switch. Repeats are dropped, and
 * there are at most MAX_CELLS values.
 */
export function sweepValues(param: Param, from = 0, to = 0, count = 5): ParamValue[] {
  if (param.type === "select") return (param.options ?? []).map((o) => o.value).slice(0, MAX_CELLS);
  if (param.type === "boolean") return [false, true];
  const n = Math.max(2, Math.min(MAX_CELLS, Math.round(count)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = fit(param, from + ((to - from) * i) / (n - 1));
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
