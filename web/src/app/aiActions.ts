/**
 * Run an AI task through the router with the studio's providers, consent dialog and request log,
 * and tell you what happened. When no provider is set, or the provider fails, the message names
 * the classical tool or filter from catalog/ai-tasks.yaml. The router never switches provider
 * on its own.
 *
 * Adapters register per provider kind. The engine model adapter arrives in Phase 7c, on-device
 * models in 7d, and the remote engine and external API adapters in 7e.
 */
import { catalog } from "@/catalog";
import { route, type RouteOutcome } from "@/core/ai/router";
import type {
  AiRequest,
  AiTask,
  ProviderAdapter,
  ProviderConfig,
  ProviderKindId,
} from "@/core/ai/types";
import { notify } from "@/state/notifications";
import { approvals, requestLog, useAi } from "@/state/ai";

type AdapterFactory = (provider: ProviderConfig) => ProviderAdapter;

const factories = new Map<ProviderKindId, AdapterFactory>();

export function registerAdapter(kind: ProviderKindId, factory: AdapterFactory): () => void {
  factories.set(kind, factory);
  return () => factories.delete(kind);
}

function adapterFor(provider: ProviderConfig): ProviderAdapter {
  const factory = factories.get(provider.kind);
  if (factory) return factory(provider);
  return {
    run: () =>
      Promise.reject(new Error("This kind of provider is not available in this version yet")),
  };
}

/** The name of the classical tool or filter for a task, from the catalog. */
export function classicalName(task: AiTask): string {
  const pool = task.classical.kind === "tool" ? catalog.tools : catalog.filters;
  return pool.find((entry) => entry.id === task.classical.id)?.name ?? task.classical.id;
}

/** End a message with exactly one period. */
const sentence = (text: string) => `${text.replace(/\.+$/, "")}.`;

/** Tell you about an outcome that has no result. Returns the outcome unchanged. */
export function reportOutcome(task: AiTask, outcome: RouteOutcome): RouteOutcome {
  const alternative = `Use ${classicalName(task)} instead.`;
  if (outcome.status === "no-provider") {
    notify(
      "info",
      `No AI provider is set for ${task.name}`,
      `Choose one in AI providers, or use ${classicalName(task)} instead.`,
    );
  } else if (outcome.status === "failed") {
    notify("error", `${task.name} did not run`, `${sentence(outcome.message)} ${alternative}`);
  } else if (outcome.status === "cancelled") {
    notify("info", `${task.name} was cancelled`, "Nothing was sent.");
  }
  return outcome;
}

export async function runAiTask(request: AiRequest, signal?: AbortSignal): Promise<RouteOutcome> {
  const state = useAi.getState();
  const outcome = await route(request, {
    settings: state.tasks,
    providers: state.providers,
    kinds: catalog.providers,
    adapter: adapterFor,
    askConsent: state.askConsent,
    approvals,
    log: requestLog,
    ...(signal ? { signal } : {}),
  });
  return reportOutcome(request.task, outcome);
}
