/**
 * The AI router. It sends each AI task to the provider you chose for it,
 * asks for consent when the provider kind requires it, logs every request that leaves the
 * device, and labels the result. When no provider is set, or the provider fails, it says so and
 * names the classical tool or filter from catalog/ai-tasks.yaml. It never switches provider on
 * its own.
 */
import {
  consentSummary,
  needsConsent,
  type ConsentSummary,
  type SessionApprovals,
} from "./consent";
import { checkEndpoint } from "./endpoint";
import type { RequestLog } from "./log";
import {
  AI_RESULT_LABEL,
  type AiRequest,
  type AiResult,
  type AiTask,
  type ProviderAdapter,
  type ProviderConfig,
  type ProviderKind,
} from "./types";

/** The provider chosen for each task, by task id. A missing or null entry means none. */
export type TaskSettings = Readonly<Record<string, string | null | undefined>>;

export type ConsentAnswer = "send" | "cancel";

export interface RouterContext {
  readonly settings: TaskSettings;
  readonly providers: readonly ProviderConfig[];
  /** The provider kinds from catalog/providers.yaml. */
  readonly kinds: readonly ProviderKind[];
  readonly adapter: (provider: ProviderConfig) => ProviderAdapter;
  readonly askConsent: (summary: ConsentSummary) => Promise<ConsentAnswer>;
  readonly approvals: SessionApprovals;
  readonly log: RequestLog;
  readonly signal?: AbortSignal;
}

export type RouteOutcome =
  | { readonly status: "done"; readonly result: AiResult; readonly provider: ProviderConfig }
  | { readonly status: "cancelled" }
  | { readonly status: "no-provider"; readonly classical: AiTask["classical"] }
  | {
      readonly status: "failed";
      readonly message: string;
      readonly classical: AiTask["classical"];
      readonly provider?: ProviderConfig;
    };

/** True when the provider kind sends images off this device. */
export function leavesDevice(kind: Pick<ProviderKind, "location">): boolean {
  return kind.location === "other-machine" || kind.location === "external-service";
}

function failed(
  request: AiRequest,
  message: string,
  provider?: ProviderConfig,
): RouteOutcome & { status: "failed" } {
  return { status: "failed", message, classical: request.task.classical, provider };
}

export async function route(request: AiRequest, context: RouterContext): Promise<RouteOutcome> {
  const { task } = request;
  const providerId = context.settings[task.id];
  if (!providerId) return { status: "no-provider", classical: task.classical };
  const provider = context.providers.find((p) => p.id === providerId);
  if (!provider) return failed(request, "The provider set for this task no longer exists.");
  const kind = context.kinds.find((k) => k.id === provider.kind);
  if (!kind) return failed(request, `Unknown provider kind "${provider.kind}".`, provider);

  let host: string | undefined;
  if (leavesDevice(kind)) {
    const check = checkEndpoint(provider.baseUrl ?? "");
    if (!check.ok) return failed(request, check.reason, provider);
    host = check.host;
  }

  if (needsConsent(kind, host, context.approvals)) {
    const summary = consentSummary(request, provider, kind, host ?? "");
    const answer = await context.askConsent(summary);
    if (answer !== "send") return { status: "cancelled" };
    if (kind.consent === "once-per-session-per-host" && host) context.approvals.add(host);
  }

  const entry =
    host === undefined
      ? undefined
      : context.log.add({
          time: new Date(),
          provider: provider.name,
          host,
          task: task.name,
          bytes: consentSummary(request, provider, kind, host).bytes,
        });
  try {
    const output = await context.adapter(provider).run(request, context.signal);
    if (output.kind !== task.output) {
      if (entry) context.log.finish(entry, "failed");
      return failed(
        request,
        `${provider.name} returned ${output.kind === "mask" ? "a mask" : "an image"}, not ${task.output === "mask" ? "a mask" : "an image"}.`,
        provider,
      );
    }
    if (entry) context.log.finish(entry, "done");
    return { status: "done", result: { ...output, label: AI_RESULT_LABEL }, provider };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    if (entry) context.log.finish(entry, aborted ? "cancelled" : "failed");
    if (aborted) return { status: "cancelled" };
    const message = error instanceof Error ? error.message : String(error);
    return failed(request, `${provider.name} failed: ${message}`, provider);
  }
}
