/**
 * A processing pipeline (PLAN.md Phase 8, requirements 1 section 7.1): an ordered chain of
 * filter steps, each with validated parameters, an on or off switch and a scope. It is saved and
 * loaded as JSON, so a result can be reproduced exactly.
 *
 * Each step's result is cached under a key made from the key before it and the step itself. A
 * change to one step therefore changes the keys of every later step, so their old results are no
 * longer used. A step that is off passes its input on and leaves the key as it was.
 *
 * Pure TypeScript: the studio passes the function that runs one step.
 */
import type { RgbaImage } from "@/core/image/types";
import type { ParamValue } from "@/core/filters/types";

export type StepScope = "whole" | "selection" | "inverse";

export interface PipelineStep {
  readonly id: string;
  readonly filterId: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly enabled: boolean;
  readonly scope: StepScope;
}

export const PIPELINE_FORMAT = "pixelnexus-pipeline";
export const PIPELINE_VERSION = 1;

/** The saved form. Step ids are not saved; they are made again on load. */
export interface PipelineFile {
  readonly format: typeof PIPELINE_FORMAT;
  readonly version: typeof PIPELINE_VERSION;
  readonly steps: readonly {
    readonly filter: string;
    readonly params: Readonly<Record<string, ParamValue>>;
    readonly enabled: boolean;
    readonly scope: StepScope;
  }[];
}

const SCOPES: readonly StepScope[] = ["whole", "selection", "inverse"];

let counter = 0;
export const newStepId = () => `step-${Date.now().toString(36)}-${++counter}`;

export function toPipelineFile(steps: readonly PipelineStep[]): PipelineFile {
  return {
    format: PIPELINE_FORMAT,
    version: PIPELINE_VERSION,
    steps: steps.map((s) => ({
      filter: s.filterId,
      params: s.params,
      enabled: s.enabled,
      scope: s.scope,
    })),
  };
}

export const pipelineJson = (steps: readonly PipelineStep[]) =>
  `${JSON.stringify(toPipelineFile(steps), null, 2)}\n`;

/**
 * Read a saved pipeline. `validate` checks one step's filter and parameters: it returns the
 * validated values with plain warnings, or null when the filter is unknown or cannot be used in
 * a pipeline. Steps it refuses are left out, with a warning. A file that is not a pipeline throws.
 */
export function parsePipeline(
  text: string,
  validate: (
    filterId: string,
    params: Readonly<Record<string, unknown>>,
  ) => { values: Record<string, ParamValue>; warnings: readonly string[] } | string,
): { steps: PipelineStep[]; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const file = data as Partial<PipelineFile> | null;
  if (!file || typeof file !== "object" || file.format !== PIPELINE_FORMAT) {
    throw new Error("This file is not a PixelNexus pipeline.");
  }
  if (file.version !== PIPELINE_VERSION) {
    throw new Error(
      `This pipeline has version ${String(file.version)}. This studio reads version 1.`,
    );
  }
  if (!Array.isArray(file.steps)) throw new Error("This pipeline has no steps.");
  const steps: PipelineStep[] = [];
  const warnings: string[] = [];
  file.steps.forEach((raw: unknown, index) => {
    const step = raw as Record<string, unknown> | null;
    const n = index + 1;
    if (!step || typeof step.filter !== "string") {
      warnings.push(`Step ${n} names no filter, so it was left out.`);
      return;
    }
    const params =
      step.params && typeof step.params === "object"
        ? (step.params as Record<string, unknown>)
        : {};
    const checked = validate(step.filter, params);
    if (typeof checked === "string") {
      warnings.push(`Step ${n} was left out: ${checked}`);
      return;
    }
    warnings.push(...checked.warnings.map((w) => `Step ${n}: ${w}`));
    steps.push({
      id: newStepId(),
      filterId: step.filter,
      params: checked.values,
      enabled: step.enabled !== false,
      scope: SCOPES.includes(step.scope as StepScope) ? (step.scope as StepScope) : "whole",
    });
  });
  return { steps, warnings };
}

/** Params with sorted keys, so equal settings always give the same key. */
function stable(params: Readonly<Record<string, ParamValue>>): string {
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]]),
  );
}

/** The cache key of a step's result, from the key of its input. */
export function stepKey(inputKey: string, step: PipelineStep): string {
  return step.enabled
    ? `${inputKey}|${step.filterId}:${step.scope}:${stable(step.params)}`
    : inputKey;
}

export type StepState =
  | { readonly state: "waiting" }
  | { readonly state: "off" }
  | { readonly state: "running" }
  | { readonly state: "cached" }
  | { readonly state: "done"; readonly ms: number }
  | { readonly state: "failed"; readonly error: string };

export interface RunOptions {
  /** A key for the input image, such as the document id and its original step. */
  readonly inputKey: string;
  /** Results by key. Entries that the chain no longer uses are dropped after the run. */
  readonly cache: Map<string, RgbaImage>;
  /** Run one step on an image. */
  readonly runStep: (
    step: PipelineStep,
    image: RgbaImage,
    signal?: AbortSignal,
  ) => Promise<RgbaImage>;
  readonly onState?: (stepId: string, state: StepState) => void;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}

/**
 * Run the chain on an image. Steps whose result is cached are not run again. Returns the final
 * image. When a step fails, the run stops there and throws with the step number.
 */
export async function runPipeline(
  input: RgbaImage,
  steps: readonly PipelineStep[],
  options: RunOptions,
): Promise<RgbaImage> {
  const now = options.now ?? (() => performance.now());
  let key = options.inputKey;
  let image = input;
  const used = new Set<string>();
  for (const step of steps)
    options.onState?.(step.id, step.enabled ? { state: "waiting" } : { state: "off" });
  for (const [index, step] of steps.entries()) {
    if (!step.enabled) continue;
    key = stepKey(key, step);
    used.add(key);
    const hit = options.cache.get(key);
    if (hit) {
      image = hit;
      options.onState?.(step.id, { state: "cached" });
      continue;
    }
    if (options.signal?.aborted)
      throw new DOMException("The pipeline was cancelled.", "AbortError");
    options.onState?.(step.id, { state: "running" });
    const started = now();
    try {
      image = await options.runStep(step, image, options.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onState?.(step.id, { state: "failed", error: message });
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error(`Step ${index + 1} failed: ${message}`, { cause: error });
    }
    options.cache.set(key, image);
    options.onState?.(step.id, { state: "done", ms: Math.round(now() - started) });
  }
  for (const k of [...options.cache.keys()]) if (!used.has(k)) options.cache.delete(k);
  return image;
}

/** Move a step from one place to another. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  const out = [...steps];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [moved] = out.splice(from, 1);
  if (moved !== undefined) out.splice(to, 0, moved);
  return out;
}
