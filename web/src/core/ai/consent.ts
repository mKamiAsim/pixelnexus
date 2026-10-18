/**
 * When to ask before a request leaves the device, and what the consent dialog shows
 *. The rule for each provider kind comes from catalog/providers.yaml:
 * never for local models, once per session per host for a remote engine, and every time for an
 * external service. There is no "always allow" for external AI.
 */
import type { AiRequest, ProviderConfig, ProviderKind } from "./types";

/** Hosts of remote engines you allowed in this session. Kept in memory only. */
export class SessionApprovals {
  private readonly hosts = new Set<string>();

  has(host: string): boolean {
    return this.hosts.has(host.toLowerCase());
  }

  add(host: string): void {
    this.hosts.add(host.toLowerCase());
  }
}

export function needsConsent(
  kind: Pick<ProviderKind, "consent">,
  host: string | undefined,
  approvals: SessionApprovals,
): boolean {
  switch (kind.consent) {
    case "never":
      return false;
    case "once-per-session-per-host":
      return host === undefined || !approvals.has(host);
    case "every-time":
      return true;
  }
}

/** What the consent dialog lists. */
export interface ConsentSummary {
  readonly provider: string;
  readonly host: string;
  readonly task: string;
  readonly imageSize: string;
  /** True when only a crop of the document is sent. */
  readonly crop: boolean;
  readonly mask: boolean;
  readonly points: number;
  readonly box: boolean;
  readonly returns: "a mask" | "an image";
  readonly bytes: number;
  /** True when the dialog may offer to remember the host for this session. */
  readonly perSession: boolean;
}

/** The bytes of pixel data a request sends: 4 per image pixel and 1 per mask pixel. */
export function requestBytes(request: AiRequest): number {
  const image = request.image.width * request.image.height * 4;
  const mask = request.mask ? request.mask.width * request.mask.height : 0;
  return image + mask;
}

export function consentSummary(
  request: AiRequest,
  provider: ProviderConfig,
  kind: Pick<ProviderKind, "consent">,
  host: string,
): ConsentSummary {
  const full = request.full;
  const crop =
    full !== undefined &&
    (full.width !== request.image.width || full.height !== request.image.height);
  return {
    provider: provider.name,
    host,
    task: request.task.name,
    imageSize: `${request.image.width} x ${request.image.height} px`,
    crop,
    mask: request.mask !== undefined,
    points: request.points?.length ?? 0,
    box: request.box !== undefined,
    returns: request.task.output === "mask" ? "a mask" : "an image",
    bytes: requestBytes(request),
    perSession: kind.consent === "once-per-session-per-host",
  };
}
