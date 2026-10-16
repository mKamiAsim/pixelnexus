/**
 * Entry point for running filters. It finds the catalog entry, validates the parameters
 * against it and sends the job to the entry's engine.
 */
import { catalog, isRunnable, STATUS_LABELS, type Filter } from "@/catalog";
import { entryParams, validateParams } from "@/catalog/params";

import { BrowserEngine } from "./browser";
import { DEFAULT_ENGINE_URL, ScienceEngine } from "./science";
import {
  EngineError,
  type EngineClient,
  type FilterJob,
  type JobOptions,
  type JobResult,
} from "./types";

export { EngineError } from "./types";
export { OFFLINE_MESSAGE } from "./science";
export type { ModelStatus } from "./science";
export type { FilterJob, JobOptions, JobResult, JobTiming } from "./types";

export const browserEngine = new BrowserEngine();

/** The local science engine. VITE_ENGINE_URL can point the studio at another address. */
export const scienceEngine = new ScienceEngine(
  (import.meta.env.VITE_ENGINE_URL as string | undefined) ?? DEFAULT_ENGINE_URL,
);

export function filterEntry(id: string): Filter {
  const entry = catalog.filters.find((filter) => filter.id === id);
  if (!entry) throw new EngineError(`There is no filter "${id}" in the catalog.`);
  return entry;
}

export function engineFor(entry: Filter): EngineClient {
  return entry.engine === "browser" ? browserEngine : scienceEngine;
}

/** Validate values against the catalog entry, exactly as the Properties panel does. */
export function prepareParams(entry: Filter, values: Readonly<Record<string, unknown>>) {
  return validateParams(entryParams(entry), values);
}

/**
 * Run a filter. Parameters are validated against the catalog first, so the engine always gets
 * values that obey the catalog rules. Planned and unsupported entries are refused.
 */
export async function runJob(
  job: Omit<FilterJob, "params"> & { readonly values: Readonly<Record<string, unknown>> },
  options: JobOptions = {},
): Promise<JobResult> {
  const entry = filterEntry(job.filterId);
  if (!isRunnable(entry)) {
    throw new EngineError(`${entry.name} cannot run yet. Status: ${STATUS_LABELS[entry.status]}.`);
  }
  const { values, warnings } = prepareParams(entry, job.values);
  const result = await engineFor(entry).run({ ...job, params: values }, options);
  return warnings.length ? { ...result, warnings: [...warnings, ...result.warnings] } : result;
}
