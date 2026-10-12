import { clsx } from "clsx";
import { ChevronRight, Search, Star } from "lucide-react";
import { Collapsible } from "radix-ui";
import { useMemo, useState } from "react";

import { catalog, isRunnable, type Filter } from "@/catalog";
import { selectFilter } from "@/app/filterActions";
import {
  ANY,
  DEFAULT_FACETS,
  facetValues,
  groupByFamily,
  searchFilters,
  type LibraryFacets,
} from "@/app/library";
import { StatusBadge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { useFilters } from "@/state/filters";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1).replace(/-/g, " ");

function FilterRow({ filter }: { filter: Filter }) {
  const selected = useFilters((s) => s.selectedId === filter.id);
  const favorite = useFilters((s) => s.favorites.includes(filter.id));
  const toggleFavorite = useFilters((s) => s.toggleFavorite);
  const runnable = isRunnable(filter);
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => selectFilter(filter.id)}
        className={clsx(
          "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control pr-1 pl-5 text-left text-sm",
          selected
            ? "bg-accent-subtle text-text"
            : runnable
              ? "text-text hover:bg-hover"
              : "text-text-muted hover:bg-hover",
        )}
      >
        <span className="truncate">{filter.name}</span>
        <span className="ml-auto shrink-0">
          <StatusBadge status={filter.status} />
        </span>
      </button>
      <IconButton
        label={
          favorite ? `Remove ${filter.name} from favorites` : `Add ${filter.name} to favorites`
        }
        pressed={favorite}
        icon={<Star size={12} className={favorite ? "fill-warning text-warning" : undefined} />}
        size="sm"
        className={
          favorite ? undefined : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }
        onClick={() => toggleFavorite(filter.id)}
      />
    </li>
  );
}

function Group({
  title,
  filters,
  defaultOpen,
}: {
  title: string;
  filters: Filter[];
  defaultOpen: boolean;
}) {
  const runnable = filters.filter(isRunnable).length;
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Collapsible.Trigger className="group flex h-7 w-full items-center gap-1 rounded-control px-1 text-left text-xs font-medium text-text-secondary hover:bg-hover hover:text-text">
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform group-data-[state=open]:rotate-90"
        />
        <span className="truncate">{title}</span>
        <span
          className="tabular ml-auto pl-2 text-text-muted"
          title={`${runnable} of ${filters.length} can run`}
        >
          {runnable}/{filters.length}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ul className="flex flex-col">
          {filters.map((filter) => (
            <FilterRow key={filter.id} filter={filter} />
          ))}
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function FacetSelect({
  label,
  value,
  values,
  onChange,
  format = capitalize,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  format?: (value: string) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text-secondary">{label}</span>
      <Select
        label={label}
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: ANY, label: "Any" },
          ...values.map((v) => ({ value: v, label: format(v) })),
        ]}
        className="w-36"
      />
    </div>
  );
}

/** The catalog: search, facets, favorites and every filter with its status. */
export function LibraryPanel() {
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<LibraryFacets>(DEFAULT_FACETS);
  const favorites = useFilters((s) => s.favorites);
  const results = useMemo(() => searchFilters(catalog.filters, query, facets), [query, facets]);
  const families = useMemo(() => [...catalog.families].sort((a, b) => a.order - b.order), []);
  const set = (key: keyof LibraryFacets) => (value: string) =>
    setFacets((f) => ({ ...f, [key]: value }));
  const favoriteFilters = results.filter((f) => favorites.includes(f.id));
  const refined = Object.entries(facets).some(([k, v]) => k !== "status" && v !== ANY);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-border-subtle p-2">
        <label className="flex h-7 items-center gap-1.5 rounded-control border border-border-control bg-raised px-2 text-text-muted focus-within:outline-2 focus-within:outline-focus">
          <Search size={13} aria-hidden />
          <input
            type="search"
            aria-label="Search filters"
            placeholder="Search filters, methods, aliases"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
        </label>
        <SegmentedControl
          label="Which filters to show"
          value={facets.status}
          onChange={(value) =>
            setFacets((f) => ({ ...f, status: value as LibraryFacets["status"] }))
          }
          fullWidth
          segments={[
            { value: "all", label: "All" },
            { value: "runnable", label: "Ready" },
            { value: "planned", label: "Planned" },
          ]}
        />
        <Collapsible.Root defaultOpen={false}>
          <Collapsible.Trigger className="group flex h-6 w-full items-center gap-1 text-xs text-text-secondary hover:text-text">
            <ChevronRight
              size={12}
              className="transition-transform group-data-[state=open]:rotate-90"
            />
            Refine{refined ? " (on)" : ""}
          </Collapsible.Trigger>
          <Collapsible.Content className="flex flex-col gap-1.5 pt-1.5">
            <FacetSelect
              label="Family"
              value={facets.family}
              values={families.map((f) => f.id)}
              format={(id) => families.find((f) => f.id === id)?.name ?? id}
              onChange={set("family")}
            />
            <FacetSelect
              label="Linearity"
              value={facets.linearity}
              values={["linear", "nonlinear"]}
              onChange={set("linearity")}
            />
            <FacetSelect
              label="Domain"
              value={facets.domain}
              values={facetValues(catalog.filters, "domain")}
              onChange={set("domain")}
            />
            <FacetSelect
              label="Purpose"
              value={facets.purpose}
              values={facetValues(catalog.filters, "purpose")}
              onChange={set("purpose")}
            />
            <FacetSelect
              label="Noise type"
              value={facets.noise}
              values={facetValues(catalog.filters, "noise")}
              onChange={set("noise")}
            />
            <FacetSelect
              label="Engine"
              value={facets.engine}
              values={["browser", "science", "model"]}
              format={(v) =>
                ({ browser: "Browser", science: "Science engine", model: "AI model" })[v] ?? v
              }
              onChange={set("engine")}
            />
            {refined ? (
              <button
                type="button"
                className="self-start text-xs text-accent-fg hover:underline"
                onClick={() => setFacets((f) => ({ ...DEFAULT_FACETS, status: f.status }))}
              >
                Clear refinements
              </button>
            ) : null}
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1" role="region" aria-label="Filters">
        <p className="sr-only" aria-live="polite">
          {results.length} filters match.
        </p>
        {results.length === 0 ? (
          <p className="p-3 text-sm text-text-secondary">
            No filter matches. Try fewer words or clear the refinements.
          </p>
        ) : query.trim() ? (
          <ul className="flex flex-col">
            {results.map((filter) => (
              <FilterRow key={filter.id} filter={filter} />
            ))}
          </ul>
        ) : (
          <>
            {favoriteFilters.length > 0 ? (
              <Group title="Favorites" filters={favoriteFilters} defaultOpen />
            ) : null}
            {groupByFamily(results).map((group) => (
              <Group
                key={`${group.id}-${facets.status}`}
                title={group.name}
                filters={group.filters}
                defaultOpen={group.filters.some(isRunnable)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
