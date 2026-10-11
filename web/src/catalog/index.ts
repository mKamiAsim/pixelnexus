/**
 * Typed access to the catalog. The data comes from catalog/*.yaml through the
 * pixelnexus-catalog Vite plugin. Never hard-code filter data anywhere else.
 */
import catalog from "virtual:pixelnexus-catalog";

import type { Filter, Status, Tool } from "@/generated/catalog-types";

export { catalog };
export type { Catalog, Family, Filter, Status, Tool } from "@/generated/catalog-types";

/** Display labels for the seven statuses. Same wording as the docs. */
export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  "implemented-tested": "Implemented and tested",
  "implemented-untested": "Implemented, testing incomplete",
  partial: "Partially implemented",
  "optional-dependency": "Available through an optional dependency",
  "optional-model": "Available through an optional pretrained model",
  planned: "Planned but not implemented",
  unsupported: "Unsupported or deprecated",
};

const RUNNABLE: ReadonlySet<Status> = new Set<Status>([
  "implemented-tested",
  "implemented-untested",
  "partial",
  "optional-dependency",
  "optional-model",
]);

/** True when the studio may offer the entry as something you can run. */
export function isRunnable(entry: Pick<Filter | Tool, "status">): boolean {
  return RUNNABLE.has(entry.status);
}

/** Count items by a key, keeping first-seen order. */
export function countBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
