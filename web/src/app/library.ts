/** Search and facets for the Library panel. Pure, so it is easy to test. */
import { catalog, isRunnable, type Filter } from "@/catalog";

export interface LibraryFacets {
  readonly family: string;
  readonly linearity: string;
  readonly domain: string;
  readonly purpose: string;
  readonly noise: string;
  readonly engine: string;
  /** "runnable" shows only filters that can run now. */
  readonly status: "runnable" | "all";
}

export const ANY = "any";

export const DEFAULT_FACETS: LibraryFacets = {
  family: ANY,
  linearity: ANY,
  domain: ANY,
  purpose: ANY,
  noise: ANY,
  engine: ANY,
  status: "all",
};

const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

const familyNames = new Map(catalog.families.map((f) => [f.id, f.name]));

/** Tag values for a facet, such as "denoise" from "purpose:denoise". */
export function tagValues(filter: Filter, facet: "purpose" | "noise"): string[] {
  return (filter.tags ?? [])
    .filter((tag) => tag.startsWith(`${facet}:`))
    .map((tag) => tag.slice(facet.length + 1));
}

/** Every value that a facet can take in the catalog, sorted. */
export function facetValues(
  filters: readonly Filter[],
  facet: "purpose" | "noise" | "domain",
): string[] {
  const values = new Set<string>();
  for (const filter of filters) {
    if (facet === "domain") {
      if (filter.classification?.domain) values.add(filter.classification.domain);
    } else {
      tagValues(filter, facet).forEach((v) => values.add(v));
    }
  }
  return [...values].sort();
}

function matchesFacets(filter: Filter, facets: LibraryFacets): boolean {
  if (facets.status === "runnable" && !isRunnable(filter)) return false;
  if (
    facets.family !== ANY &&
    filter.family !== facets.family &&
    !(filter.alsoIn ?? []).some((f) => f === facets.family)
  ) {
    return false;
  }
  if (facets.linearity !== ANY && filter.classification?.linearity !== facets.linearity)
    return false;
  if (facets.domain !== ANY && filter.classification?.domain !== facets.domain) return false;
  if (facets.purpose !== ANY && !tagValues(filter, "purpose").includes(facets.purpose))
    return false;
  if (facets.noise !== ANY && !tagValues(filter, "noise").includes(facets.noise)) return false;
  if (facets.engine !== ANY && filter.engine !== facets.engine) return false;
  return true;
}

/**
 * Score a filter for a query. Every word must match somewhere. The name counts most, then the
 * aliases, then the summary, purpose, family, tags and planning notes. Zero means no match.
 */
export function scoreFilter(filter: Filter, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const name = normalize(filter.name);
  const aliases = normalize((filter.aliases ?? []).join(" "));
  const rest = normalize(
    [
      filter.id,
      filter.summary ?? "",
      filter.purpose ?? "",
      familyNames.get(filter.family) ?? "",
      (filter.tags ?? []).join(" "),
      filter.planNotes ?? "",
      filter.classification?.operation ?? "",
    ].join(" "),
  );
  let score = 0;
  for (const word of words) {
    if (name.startsWith(word)) score += 10;
    else if (name.split(/[\s(),-]+/).some((part) => part.startsWith(word))) score += 8;
    else if (name.includes(word)) score += 6;
    else if (aliases.includes(word)) score += 5;
    else if (rest.includes(word)) score += 2;
    else return 0;
  }
  // An exact id wins, and filters that can run now come before planned ones of equal score.
  if (normalize(query).trim().replace(/\s+/g, "-") === filter.id) score += 20;
  return score + (isRunnable(filter) ? 0.5 : 0);
}

/** Filters that match the query and the facets, best match first. */
export function searchFilters(
  filters: readonly Filter[],
  query: string,
  facets: LibraryFacets,
): Filter[] {
  return filters
    .map((filter, index) => ({ filter, index, score: scoreFilter(filter, query) }))
    .filter((entry) => entry.score > 0 && matchesFacets(entry.filter, facets))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.filter);
}

/** Filters grouped by family, in the catalog's family order. Empty families are left out. */
export function groupByFamily(
  filters: readonly Filter[],
): { id: string; name: string; filters: Filter[] }[] {
  return [...catalog.families]
    .sort((a, b) => a.order - b.order)
    .map((family) => ({
      id: family.id,
      name: family.name,
      filters: filters.filter((f) => f.family === family.id),
    }))
    .filter((group) => group.filters.length > 0);
}
