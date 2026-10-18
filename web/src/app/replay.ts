/**
 * Run a recorded filter step again on another image. The Pipeline panel and
 * the History panel's delete both use it, so a replayed step works exactly as Apply did: the
 * scope picks the area through the selection, and the result goes through the compositor.
 */
import { composite } from "@/core/composite/compose";
import { processingRegion, scopeMask, type FilterScope } from "@/core/composite/scope";
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";
import { runJob } from "@/engine-client";

import { isGlobal } from "./filterActions";

export interface ReplayStep {
  readonly filterId: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly scope: FilterScope;
}

/**
 * The image after running the step on `image`. A step with a selection scope needs a selection
 * of the same size. A filter that changes the size, such as an enlargement, returns its whole
 * result, and only on the whole image.
 */
export async function replayFilter(
  step: ReplayStep,
  image: RgbaImage,
  selection: Mask | null,
  signal?: AbortSignal,
): Promise<RgbaImage> {
  const fits = selection && selection.width === image.width && selection.height === image.height;
  if (step.scope !== "whole" && !fits) {
    throw new Error(
      selection
        ? "The selection does not fit the image at this step, since an earlier step changed its size."
        : "This step works on the selection. Make a selection first.",
    );
  }
  const mask = fits ? scopeMask(selection, step.scope) : null;
  const region = processingRegion(image, mask, isGlobal(step.params));
  if (!region) return image;
  const result = await runJob(
    { filterId: step.filterId, values: step.params, image, region },
    signal ? { signal } : {},
  );
  // A result that fills its region goes back through the compositor. Another size means the
  // filter changed the image size, as an enlargement does, and the result replaces the image.
  const fills =
    result.image.width === result.region.width && result.image.height === result.region.height;
  if (fills) return composite(image, result.image, result.region, mask);
  if (mask) throw new Error("A step that changes the image size cannot work on the selection.");
  return result.image;
}
