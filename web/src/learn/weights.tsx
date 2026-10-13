/**
 * The Weight viewer: the weights of an edge-preserving filter at one pixel. It uses the weight
 * function of the real filter, so the picture matches what Apply computes.
 */
import { bilateralRadius, bilateralWeights } from "@/core/filters/nonlinear/bilateral";
import { borderIndex } from "@/core/filters/planes";
import { borderOf } from "@/core/filters/run";

import { channelOf, engineValueAt, round, valueAt, windowAt } from "./common";
import { Stepper, type WidgetProps } from "./widgets";

/** The largest half-width the viewer draws. Larger windows show their center part. */
const MAX_SHOWN = 7;

function HeatGrid({ rows, caption }: { rows: number[][]; caption: string }) {
  const max = Math.max(1e-12, ...rows.flat());
  return (
    <figure className="flex flex-col gap-0.5">
      <figcaption className="text-2xs text-text-muted">{caption}</figcaption>
      <div
        role="img"
        aria-label={`${caption}. The largest weight is ${round(max, 3)}.`}
        className="grid w-max gap-px rounded-control border border-border bg-border p-px"
        style={{ gridTemplateColumns: `repeat(${rows[0]?.length ?? 1}, 10px)` }}
      >
        {rows.flat().map((v, i) => (
          <span
            key={i}
            className="size-2.5"
            style={{
              background: `color-mix(in srgb, var(--px-accent) ${Math.round((v / max) * 100)}%, var(--px-raised))`,
            }}
          />
        ))}
      </div>
    </figure>
  );
}

const crop = (rows: number[][], keep: number) => {
  const cut = (rows.length - (2 * keep + 1)) >> 1;
  return rows.slice(cut, rows.length - cut).map((row) => row.slice(cut, row.length - cut));
};

export function WeightViewer({ filterId, values, image, point, onMove }: WidgetProps) {
  const sigmaSpace = Number(values.sigmaSpace ?? 3);
  const sigmaRange = Number(values.sigmaRange ?? 30);
  const color = values.range === "color";
  const r = bilateralRadius(sigmaSpace);
  const border = borderOf(values);
  const channel = channelOf(values);

  let differences: number[][];
  if (color) {
    const rgb = (x: number, y: number) => {
      const sx = borderIndex(x, image.width, border);
      const sy = borderIndex(y, image.height, border);
      if (sx < 0 || sy < 0) return [0, 0, 0];
      const o = (sy * image.width + sx) * 4;
      return [image.data[o] ?? 0, image.data[o + 1] ?? 0, image.data[o + 2] ?? 0];
    };
    const center = rgb(point.x, point.y);
    differences = Array.from({ length: 2 * r + 1 }, (_, j) =>
      Array.from({ length: 2 * r + 1 }, (_, i) => {
        const v = rgb(point.x + i - r, point.y + j - r);
        return Math.hypot(...v.map((c, k) => c - (center[k] ?? 0)));
      }),
    );
  } else {
    const window = windowAt(image, point, 2 * r + 1, border, channel);
    const center = valueAt(image, point.x, point.y, channel);
    differences = window.map((row) => row.map((v) => v - center));
  }
  const { spatial, range, combined } = bilateralWeights(differences, sigmaSpace, sigmaRange);
  const keep = Math.min(r, MAX_SHOWN);
  const centerShare = combined[r]?.[r] ?? 0;
  const result = engineValueAt(filterId, values, image, point);
  return (
    <div className="flex flex-col gap-2">
      <Stepper point={point} image={image} onMove={onMove} />
      <div className="flex flex-wrap gap-3">
        <HeatGrid rows={crop(spatial, keep)} caption="Distance weight" />
        <HeatGrid rows={crop(range, keep)} caption="Value weight" />
        <HeatGrid rows={crop(combined, keep)} caption="Product, normalized" />
      </div>
      <p>
        The window has radius {r}
        {r > MAX_SHOWN ? `, and the viewer shows the center ${2 * keep + 1}x${2 * keep + 1}` : ""}.
        Pixels that differ {color ? "in color" : "in value"} from the center get little weight, even
        when they are close. The center pixel holds{" "}
        <strong className="tabular">{round(centerShare * 100, 1)} percent</strong> of the total
        weight. The filter gives <strong className="tabular">{round(result, 1)}</strong> in the red
        channel here.
      </p>
    </div>
  );
}
