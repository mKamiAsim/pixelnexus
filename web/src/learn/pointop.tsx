/**
 * The Point-op curve: the transfer curve of a point operation, with the histograms of the image
 * before and after. Fixed curves come from the filter's transfer function. Curves built from the
 * image, such as histogram equalization, come from the filter's own table and the histogram of
 * the whole image, so the widget draws the curve the filter really applies. For local
 * operations such as CLAHE, the curve is the one that applies at the probe pixel, and the
 * histogram after comes from running the filter on the whole image.
 */
import { useMemo } from "react";

import { histogram256 } from "@/core/filters/enhancement/histogram";
import { createPlane, type Plane } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import type { RgbaImage } from "@/core/image/types";

import { channelOf, curveOf, round, valueAt } from "./common";
import type { WidgetProps } from "./widgets";

const SIZE = 200;
const BARS = 64;

function histogramOf(image: RgbaImage, channel: "luma" | "red"): Float64Array {
  const counts = new Float64Array(256);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const k = Math.min(255, Math.max(0, Math.round(valueAt(image, x, y, channel))));
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return counts;
}

function planeOf(image: RgbaImage, channel: "luma" | "red"): Plane {
  const plane = createPlane(image.width, image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      plane.data[y * image.width + x] = valueAt(image, x, y, channel);
    }
  }
  return plane;
}

const CONTEXT = { border: "reflect101", originX: 0, originY: 0, channel: 0 } as const;

const at = (curve: readonly number[], v: number) => {
  const k = Math.min(254, Math.floor(v));
  const low = curve[k] ?? 0;
  return low + (v - k) * ((curve[k + 1] ?? low) - low);
};

function Histogram({ counts, label }: { counts: ArrayLike<number>; label: string }) {
  // Groups of four levels, so bars stay visible at this size.
  const groups = Array.from({ length: BARS }, (_, i) => {
    let sum = 0;
    for (let k = 4 * i; k < 4 * i + 4; k++) sum += counts[k] ?? 0;
    return sum;
  });
  const top = Math.max(1, ...groups);
  const width = SIZE / BARS;
  return (
    <svg viewBox={`0 0 ${SIZE} 48`} className="w-full max-w-72" role="img" aria-label={label}>
      <rect width={SIZE} height={48} fill="var(--px-raised)" />
      {groups.map((v, i) => (
        <rect
          key={i}
          x={i * width}
          y={48 - (v / top) * 46}
          width={width - 0.5}
          height={(v / top) * 46}
          fill="var(--px-accent)"
        />
      ))}
    </svg>
  );
}

export function PointOpCurve({ filterId, values, image, point }: WidgetProps) {
  const channel = channelOf(values);
  const before = useMemo(() => histogramOf(image, channel), [image, channel]);
  // Local operations: the channel as a plane, and the histogram of the real result.
  const local = useMemo(() => {
    const filter = browserFilter(filterId);
    if (filter?.kind !== "smooth" && filter?.kind !== "derived") return null;
    const tableAt = filter.pointTableAt;
    if (!tableAt) return null;
    const plane = planeOf(image, channel);
    return { tableAt, plane, after: histogram256(filter.plane(plane, values, CONTEXT)) };
  }, [filterId, values, image, channel]);
  const data = useMemo(() => {
    const curve = local
      ? Array.from(local.tableAt(values, local.plane, point.x, point.y))
      : curveOf(filterId, values, before);
    if (!curve) return null;
    let after: ArrayLike<number> = local?.after ?? new Float64Array(256);
    if (!local) {
      const counts = new Float64Array(256);
      curve.forEach((v, k) => {
        const j = Math.min(255, Math.max(0, Math.round(v)));
        counts[j] = (counts[j] ?? 0) + (before[k] ?? 0);
      });
      after = counts;
    }
    const probe = valueAt(image, point.x, point.y, channel);
    return { curve, after, probe, out: Math.min(255, Math.max(0, at(curve, probe))) };
  }, [filterId, values, before, local, image, point.x, point.y, channel]);
  if (!data) return null;
  const xy = (v: number, out: number) =>
    `${(v / 255) * SIZE},${SIZE - (Math.min(255, Math.max(0, out)) / 255) * SIZE}`;
  const name = channel === "luma" ? "luma" : "red channel";
  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`-4 -4 ${SIZE + 8} ${SIZE + 8}`}
        className="w-full max-w-60"
        role="img"
        aria-label={`Transfer curve: input level on the horizontal axis, output level on the vertical axis. The probe value ${round(data.probe)} becomes ${round(data.out)}.`}
      >
        <rect width={SIZE} height={SIZE} fill="var(--px-raised)" />
        <line
          x1={0}
          y1={SIZE}
          x2={SIZE}
          y2={0}
          stroke="var(--px-text-muted)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <polyline
          points={data.curve.map((v, k) => xy(k, v)).join(" ")}
          fill="none"
          stroke="var(--px-accent)"
          strokeWidth={2}
        />
        <circle
          cx={(data.probe / 255) * SIZE}
          cy={SIZE - (data.out / 255) * SIZE}
          r={4}
          fill="var(--px-text)"
        />
      </svg>
      <p className="text-text-secondary">
        The curve maps each input level, left to right, to an output level, bottom to top. The
        dashed line changes nothing. At the probe, the {name} value {round(data.probe)} becomes{" "}
        {round(data.out)}.
        {local
          ? " This filter uses a different curve in each part of the image. The one shown applies at the probe pixel."
          : ""}
      </p>
      <Histogram counts={before} label={`Histogram of the ${name} before the filter`} />
      <Histogram counts={data.after} label={`Histogram of the ${name} after the filter`} />
      <p className="flex gap-4 text-2xs text-text-muted">
        <span>Top: before</span>
        <span>Bottom: after</span>
        <span>Whole image, {name}</span>
      </p>
    </div>
  );
}
