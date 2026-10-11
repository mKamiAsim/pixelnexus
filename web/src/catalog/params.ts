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
