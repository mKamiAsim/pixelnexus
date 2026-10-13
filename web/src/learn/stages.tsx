/**
 * The Stage viewer: run a multi-stage filter once per stage on the patch around the probe and
 * show the results side by side. The stages are the options of the filter's "stage" parameter in
 * the catalog, or of its "output" parameter when it has no stages, and every picture comes from
 * the real filter code.
 */
import { useMemo } from "react";

import { browserFilter } from "@/core/filters/registry";
import { runFilter } from "@/core/filters/run";

import { patchAt, stagesOf } from "./common";
import { PixelCanvas, type WidgetProps } from "./widgets";

export function StageViewer({ filterId, values, image, point }: WidgetProps) {
  const pictures = useMemo(() => {
    const filter = browserFilter(filterId);
    const patch = patchAt(image, point.x, point.y);
    if (!filter) return [];
    const { key, stages } = stagesOf(filterId);
    return [
      { value: "", label: "Input", image: patch, current: false },
      ...stages.map((stage) => ({
        ...stage,
        current: stage.value === values[key],
        image: runFilter(patch, filter, {
          ...values,
          [key]: stage.value,
          outputMapping: "normalize",
        }).image,
      })),
    ];
  }, [filterId, values, image, point.x, point.y]);
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
      <p className="text-text-secondary">
        Each stage runs the filter with its current settings on the 64x64 patch around the probe,
        stretched to the full gray range. The one the filter applies now is in bold. Steps that
        follow edges stop at the patch edge, so results near it can differ from the whole image.
      </p>
    </div>
  );
}
