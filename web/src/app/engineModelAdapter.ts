/**
 * The adapter of the engine model provider kind (PLAN.md section 3.11): AI tasks run on the
 * local PixelNexus engine with the approved models of catalog/models.yaml. Images stay on this
 * computer, so the router never asks for consent. The provider's model setting picks a model
 * from the task's list in catalog/ai-tasks.yaml; without one the engine uses the first.
 */
import { createMask, type Mask } from "@/core/mask/mask";
import type { AiOutput, AiRequest, ProviderAdapter, ProviderConfig } from "@/core/ai/types";
import type { RgbaImage } from "@/core/image/types";
import type { ScienceEngine } from "@/engine-client/science";

/** The red channel of the engine's gray result is the mask. */
export function maskFromImage(image: RgbaImage): Mask {
  const mask = createMask(image.width, image.height);
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = image.data[i * 4] ?? 0;
  return mask;
}

export function engineModelAdapter(
  engine: ScienceEngine,
  provider: ProviderConfig,
): ProviderAdapter {
  return {
    async run(request: AiRequest, signal?: AbortSignal): Promise<AiOutput> {
      const result = await engine.aiTask(
        request.task.id,
        {
          image: request.image,
          ...(provider.model ? { model: provider.model } : {}),
          ...(request.points ? { points: request.points } : {}),
          ...(request.box ? { box: request.box } : {}),
        },
        signal,
      );
      return request.task.output === "mask"
        ? { kind: "mask", mask: maskFromImage(result) }
        : { kind: "image", image: result };
    },
  };
}
