/**
 * The AI provider contract of PLAN.md section 3.11. Every provider kind has an adapter with one
 * shape: a task, an input image, an optional mask and prompts in, and a mask or an image out.
 *
 * The tasks and the provider kinds come from the catalog (ai-tasks.yaml and providers.yaml).
 */
import type { AiTask, ProviderKind } from "@/generated/catalog-types";
import type { Rect } from "@/core/filters/run";
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";

export type { AiTask, ProviderKind };
export type ProviderKindId = ProviderKind["id"];

/** A click prompt in image coordinates. Positive clicks mark the object. */
export interface PromptPoint {
  readonly x: number;
  readonly y: number;
  readonly positive: boolean;
}

/** A rectangle in image pixels. */
export type Box = Rect;

/** What goes to a provider. The image may be a crop of the document, placed at `origin`. */
export interface AiRequest {
  readonly task: AiTask;
  readonly image: RgbaImage;
  readonly mask?: Mask;
  readonly points?: readonly PromptPoint[];
  readonly box?: Box;
  /** Where the image sits in the document, when it is a crop. */
  readonly origin?: { readonly x: number; readonly y: number };
  /** The document size the crop came from. */
  readonly full?: { readonly width: number; readonly height: number };
}

/** What comes back. The label is set by the router, never by the provider. */
export type AiOutput =
  | { readonly kind: "mask"; readonly mask: Mask }
  | { readonly kind: "image"; readonly image: RgbaImage };

export type AiResult = AiOutput & { readonly label: string };

/** A provider you set up in the studio. Secrets are kept apart, see secrets.ts. */
export interface ProviderConfig {
  readonly id: string;
  readonly kind: ProviderKindId;
  readonly name: string;
  /** For remote engines and external APIs. */
  readonly baseUrl?: string;
  readonly model?: string;
}

/** One adapter per provider kind. It throws an Error with a plain message when it fails. */
export interface ProviderAdapter {
  run(request: AiRequest, signal?: AbortSignal): Promise<AiOutput>;
}

/** The label on every result from a learned or external model (section 3.11). */
export const AI_RESULT_LABEL = "AI result. Detail may not exist in the original scene.";
