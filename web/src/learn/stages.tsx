/**
 * The Stage viewer: run a multi-stage filter once per stage on the patch around the probe and
 * show the results side by side. The stages are the options of the filter's "stage" parameter in
 * the catalog, or of its "output" parameter when it has no stages, and every picture comes from
 * the real filter code. Science filters run their stages in the local engine.
 */
import { useMemo } from "react";

import { browserFilter } from "@/core/filters/registry";
import { runFilter } from "@/core/filters/run";
import type { RgbaImage } from "@/core/image/types";

import { patchAt, stagesOf } from "./common";
import { useEngineResults } from "./engine";
import { PixelCanvas, type WidgetProps } from "./widgets";

interface Picture {
  readonly label: string;
  readonly image: RgbaImage;
  readonly current: boolean;
}

export function StageViewer({ filterId, values, image, point }: WidgetProps) {
  const filter = browserFilter(filterId);
  const patch = useMemo(() => patchAt(image, point.x, point.y), [image, point.x, point.y]);
  const { key, stages } = useMemo(() => stagesOf(filterId), [filterId]);
  const browserPictures = useMemo<Picture[] | null>(() => {
    if (!filter) return null;
    return stages.map((stage) => ({
      label: stage.label,
      current: stage.value === values[key],
      image: runFilter(patch, filter, {
        ...values,
        [key]: stage.value,
        outputMapping: "normalize",
      }).image,
    }));
  }, [filter, stages, key, values, patch]);
  const inputs = useMemo(
    () => stages.map((stage) => ({ image: patch, values: { ...values, [key]: stage.value } })),
    [stages, key, values, patch],
  );
  const engine = useEngineResults(filterId, inputs, !filter);
  const stagePictures =
    browserPictures ??
    engine.images?.map((result, i) => ({
      label: stages[i]?.label ?? "",
      current: stages[i]?.value === values[key],
      image: result,
    })) ??
    [];
  const pictures = [{ label: "Input", image: patch, current: false }, ...stagePictures];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {pictures.map((p) => (
          <figure key={p.label} className="flex flex-col gap-0.5">
            <figcaption
              className={p.current ? "text-2xs font-semibold" : "text-2xs text-text-muted"}
            >
              {p.label}
            </figcaption>
            <PixelCanvas image={p.image} scale={2} label={`${p.label}, patch around the probe`} />
          </figure>
        ))}
      </div>
      {engine.note ? (
        <p role="status" className="text-text-secondary">
          {engine.note}
        </p>
      ) : null}
      <p className="text-text-secondary">
        Each stage runs the filter with its current settings on the 64x64 patch around the probe.
        {filter
          ? " Each result is stretched to the full gray range."
          : " Each result is shown as the engine returns it."}{" "}
        The one the filter applies now is in bold. Steps that follow edges stop at the patch edge,
        so results near it can differ from the whole image.
      </p>
    </div>
  );
}
