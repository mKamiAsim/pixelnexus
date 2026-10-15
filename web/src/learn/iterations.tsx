/**
 * The Iteration viewer: run an iterative filter on the patch around the probe, show the estimate
 * after a few iterations, and plot how it converges.
 *
 * - For the deconvolution filters it calls the same iterate() function the filter runs, and
 *   plots the residual |g - h * f| at every iteration.
 * - For other filters with an iterations parameter, such as anisotropic diffusion, it runs the
 *   real filter with growing iteration counts, at most 30 of them, and plots the mean change per
 *   iteration between those counts.
 * - Science filters do the same in the local engine, with only the counts it shows, at most 4,
 *   since each count is one job.
 */
import { useMemo } from "react";

import { createPlane, type Plane } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { ITERATIVE_METHODS, iterate } from "@/core/filters/restoration/iterative";
import { borderOf, runFilter } from "@/core/filters/run";
import { read } from "@/core/filters/types";
import { createImage, type RgbaImage } from "@/core/image/types";

import { channelOf, patchAt, round, valueAt } from "./common";
import { useEngineResults } from "./engine";
import { PixelCanvas, type WidgetProps } from "./widgets";

/** The most iteration counts the viewer runs for filters without a blur model. */
const MAX_COUNTS = 30;

function grayImage(plane: Plane): RgbaImage {
  const out = createImage(plane.width, plane.height);
  plane.data.forEach((v, i) => {
    const g = Math.round(Math.min(255, Math.max(0, v)));
    out.data.set([g, g, g, 255], i * 4);
  });
  return out;
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

/** The iterations to show: the first, the last and two between, without repeats. */
function snapshotsOf(count: number): number[] {
  return [...new Set([1, Math.ceil(count / 4), Math.ceil(count / 2), count])];
}

/** Up to `most` iteration counts from 1 to count, always with the snapshot counts. */
function countsOf(count: number, most: number): number[] {
  const n = Math.min(count, most);
  const spread = Array.from({ length: n }, (_, i) =>
    Math.max(1, Math.round(1 + ((count - 1) * i) / Math.max(1, n - 1))),
  );
  return [...new Set([...spread, ...snapshotsOf(count)])].sort((a, b) => a - b);
}

interface Run {
  readonly input: RgbaImage;
  readonly snapshots: { iteration: number; image: RgbaImage }[];
  /** Iteration and value pairs for the plot. */
  readonly curve: [number, number][];
  readonly measure: "residual" | "change";
}

/** Snapshots and the mean change per iteration from results at growing iteration counts. */
function changeRun(input: Plane, counts: readonly number[], results: readonly Plane[]): Run {
  const wanted = new Set(snapshotsOf(counts[counts.length - 1] ?? 1));
  const snapshots: { iteration: number; image: RgbaImage }[] = [];
  const curve: [number, number][] = [];
  let previous = input;
  let previousCount = 0;
  counts.forEach((c, k) => {
    const result = results[k] ?? input;
    let sum = 0;
    result.data.forEach((v, i) => (sum += Math.abs(v - (previous.data[i] ?? 0))));
    curve.push([c, sum / result.data.length / (c - previousCount)]);
    if (wanted.has(c)) snapshots.push({ iteration: c, image: grayImage(result) });
    previous = result;
    previousCount = c;
  });
  return { input: grayImage(input), snapshots, curve, measure: "change" };
}

const iterationsOf = (values: WidgetProps["values"]) =>
  Math.max(1, Math.round(read.number(values, "iterations", 20)));

export function IterationViewer(props: WidgetProps) {
  return browserFilter(props.filterId) ? (
    <BrowserIterations {...props} />
  ) : (
    <EngineIterations {...props} />
  );
}

function BrowserIterations({ filterId, values, image, point }: WidgetProps) {
  const data = useMemo((): Run | null => {
    const filter = browserFilter(filterId);
    if (!filter) return null;
    const patch = patchAt(image, point.x, point.y);
    const channel = channelOf(values);
    const plane = planeOf(patch, channel);
    const count = iterationsOf(values);
    const method = ITERATIVE_METHODS[filterId];
    if (method) {
      const wanted = new Set(snapshotsOf(count));
      const snapshots: { iteration: number; image: RgbaImage }[] = [];
      const curve: [number, number][] = [];
      iterate(plane, borderOf(values), values, method, (iteration, estimate, residual) => {
        curve.push([iteration, residual]);
        if (wanted.has(iteration)) snapshots.push({ iteration, image: grayImage(estimate) });
      });
      return { input: grayImage(plane), snapshots, curve, measure: "residual" };
    }
    const counts = countsOf(count, MAX_COUNTS);
    const results = counts.map((c) =>
      planeOf(runFilter(patch, filter, { ...values, iterations: c }).image, channel),
    );
    return changeRun(plane, counts, results);
  }, [filterId, values, image, point.x, point.y]);
  if (!data) return <p className="text-text-secondary">This filter cannot run here.</p>;
  return <IterationView data={data} where="" />;
}

function EngineIterations({ filterId, values, image, point }: WidgetProps) {
  const patch = useMemo(() => patchAt(image, point.x, point.y), [image, point.x, point.y]);
  const counts = useMemo(() => snapshotsOf(iterationsOf(values)), [values]);
  const inputs = useMemo(
    () => counts.map((c) => ({ image: patch, values: { ...values, iterations: c } })),
    [counts, patch, values],
  );
  const engine = useEngineResults(filterId, inputs, true);
  const data = useMemo(() => {
    if (!engine.images) return null;
    const channel = channelOf(values);
    return changeRun(
      planeOf(patch, channel),
      counts,
      engine.images.map((result) => planeOf(result, channel)),
    );
  }, [engine.images, counts, patch, values]);
  if (!data) {
    return (
      <p role="status" className="text-text-secondary">
        {engine.note}
      </p>
    );
  }
  return (
    <IterationView
      data={data}
      where={` It runs in the PixelNexus engine once for each of the ${counts.length} counts on the plot.`}
    />
  );
}

function IterationView({ data, where }: { data: Run; where: string }) {
  const width = 220;
  const height = 90;
  const top = Math.max(...data.curve.map(([, v]) => v), 1e-9);
  const last = data.curve[data.curve.length - 1]?.[0] ?? 1;
  const points = data.curve
    .map(([i, v]) => `${((i - 1) / Math.max(1, last - 1)) * width},${height - (v / top) * height}`)
    .join(" ");
  const firstValue = data.curve[0]?.[1] ?? 0;
  const lastValue = data.curve[data.curve.length - 1]?.[1] ?? 0;
  const what =
    data.measure === "residual"
      ? "the root mean square of g - h * f before each iteration"
      : "the mean change of a pixel per iteration";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <figure className="flex flex-col gap-0.5">
          <figcaption className="text-2xs text-text-muted">Input</figcaption>
          <PixelCanvas image={data.input} scale={1} label="Patch around the probe" />
        </figure>
        {data.snapshots.map((s) => (
          <figure key={s.iteration} className="flex flex-col gap-0.5">
            <figcaption
              className={
                s.iteration === last ? "text-2xs font-semibold" : "text-2xs text-text-muted"
              }
            >
              Iteration {s.iteration}
            </figcaption>
            <PixelCanvas
              image={s.image}
              scale={1}
              label={`Estimate after iteration ${s.iteration}`}
            />
          </figure>
        ))}
      </div>
      <svg
        viewBox={`-4 -4 ${width + 8} ${height + 8}`}
        className="w-full max-w-72"
        role="img"
        aria-label={`Convergence over ${last} iterations, from ${round(firstValue, 2)} to ${round(lastValue, 2)}`}
      >
        <rect width={width} height={height} fill="var(--px-raised)" />
        <polyline points={points} fill="none" stroke="var(--px-accent)" strokeWidth={2} />
      </svg>
      <p className="text-text-secondary">
        The filter runs on the 64x64 patch around the probe, with the current settings. The plot
        shows {what}, from {round(firstValue, 2)} to {round(lastValue, 2)}. A falling curve means
        the result settles.{where}
        {data.measure === "residual" ? " Too many iterations also fit the noise." : ""}
      </p>
    </div>
  );
}
