import { useMemo } from "react";

import type { Filter } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";
import { useFilters } from "@/state/filters";

/**
 * The validated values of a filter, as a stable object. It changes only when the stored values
 * change, so widgets can memoize work on it.
 */
export function useFilterValues(entry: Filter) {
  const stored = useFilters((s) => s.values[entry.id]);
  return useMemo(() => validateParams(entryParams(entry), stored ?? {}), [entry, stored]);
}
