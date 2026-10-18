/** Tool settings, validated against the catalog entry of the tool. */
import { useMemo } from "react";

import { catalog, type Tool } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";
import type { Params } from "@/core/filters/types";
import { useSelection } from "@/state/selection";

export function toolEntry(id: string): Tool | null {
  return catalog.tools.find((t) => t.id === id) ?? null;
}

export function toolValues(id: string, stored = useSelection.getState().values[id]): Params {
  const entry = toolEntry(id);
  return entry ? validateParams(entryParams(entry), stored ?? {}).values : {};
}

/** The validated values of a tool, updated when they change. */
export function useToolValues(id: string): Params {
  const stored = useSelection((s) => s.values[id]);
  return useMemo(() => toolValues(id, stored), [id, stored]);
}
