import { normalizeNumber } from "@/components/ui/number";
import type { Param, ParamRef, ParamValue } from "@/generated/catalog-types";

import { catalog } from "./index";

export type { ParamValue } from "@/generated/catalog-types";

/** Replace shared parameter references with full definitions. Overrides win over shared values. */
export function resolveParams(
  params: readonly (Param | ParamRef)[] | undefined,
  common: readonly Param[] = catalog.commonParams,
): Param[] {
  return (params ?? []).map((param) => {
    if (!("ref" in param)) return param;
    const shared = common.find((candidate) => candidate.key === param.ref);
    if (!shared) throw new Error(`Unknown shared parameter "${param.ref}".`);
    const { ref: _ref, ...overrides } = param;
    return { ...shared, ...overrides } as Param;
  });
}

/** Default values keyed by parameter key. */
export function defaultValues(params: readonly Param[]): Record<string, ParamValue> {
  return Object.fromEntries(params.map((param) => [param.key, param.default]));
}

export interface ValidatedParams {
  readonly values: Record<string, ParamValue>;
  /** Plain sentences about values that were changed to fit the rules. */
  readonly warnings: readonly string[];
}

/**
 * Check values against the parameter definitions. Missing values get their default. Numbers
 * are clamped and snapped to their step, integer and odd-only rules. Unknown keys are dropped.
 * The Properties panel and the engine client both call this, so the engine always gets the
 * same validated values that the panel shows.
 */
export function validateParams(
  params: readonly Param[],
  values: Readonly<Record<string, unknown>>,
): ValidatedParams {
  const out: Record<string, ParamValue> = {};
  const warnings: string[] = [];
  for (const param of params) {
    const raw = values[param.key];
    if (raw === undefined) {
      out[param.key] = param.default;
      continue;
    }
    switch (param.type) {
      case "number":
      case "integer":
      case "angle": {
        const number = typeof raw === "number" ? raw : Number(raw);
        const fixed = normalizeNumber(number, {
          min: param.min,
          max: param.max,
          step: param.step,
          integer: param.type === "integer",
          oddOnly: param.oddOnly,
        });
        if (fixed === null) {
          warnings.push(`${param.label} was not a number, so the default is used.`);
          out[param.key] = param.default;
        } else {
          if (fixed !== number)
            warnings.push(`${param.label} was changed from ${number} to ${fixed}.`);
          out[param.key] = fixed;
        }
        break;
      }
      case "select": {
        const ok = (param.options ?? []).some((option) => option.value === raw);
        if (!ok)
          warnings.push(`${param.label} has no option "${String(raw)}", so the default is used.`);
        out[param.key] = ok ? (raw as ParamValue) : param.default;
        break;
      }
      case "boolean":
        out[param.key] = typeof raw === "boolean" ? raw : param.default;
        break;
      default:
        out[param.key] = raw as ParamValue;
    }
  }
  return { values: out, warnings };
}

/**
 * The parameters of a catalog entry, ready for the panel and the engine. Shared parameters are
 * expanded, and the channel scope offers only the scopes the entry allows.
 */
export function entryParams(entry: {
  readonly params?: readonly (Param | ParamRef)[];
  readonly channelScopes?: readonly string[];
}): Param[] {
  const allowed = entry.channelScopes;
  return resolveParams(entry.params).map((param) => {
    if (param.key !== "channelScope" || !allowed || !param.options) return param;
    const [first, ...rest] = param.options.filter((o) => allowed.includes(String(o.value)));
    // The catalog checker makes sure the default scope is allowed, so the list is never empty.
    return first ? { ...param, options: [first, ...rest] } : param;
  });
}
