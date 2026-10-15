/**
 * Learn panel demo widgets for Phase 3. Each one runs the real filter code, so what it shows
 * always matches the result of Apply.
 */
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { hsvToRgb } from "@/core/color/convert";
import { sobelGradients } from "@/core/filters/edges/sobel";
import { createPlane } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { borderOf, runFilter } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { createImage, type RgbaImage } from "@/core/image/types";

import {
  channelOf,
  engineValueAt,
  patchAt,
  patchFrame,
  round,
  valueAt,
  windowAt,
  type Point,
} from "./common";
import { useEngineResults } from "./engine";

export interface WidgetProps {
  readonly filterId: string;
  readonly values: Params;
  readonly image: RgbaImage;
  readonly point: Point;
  /** Move the probe point, for steppers. */
  readonly onMove: (point: Point) => void;
}

/** Draw an RGBA image into a canvas at a whole-number scale, with sharp pixels. */
export function PixelCanvas({
  image,
  scale,
  label,
}: {
  image: RgbaImage;
  scale: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = image.width;
    canvas.height = image.height;
    context.putImageData(new ImageData(image.data.slice(), image.width, image.height), 0, 0);
  }, [image]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="checkerboard border border-border"
      style={{
        width: image.width * scale,
        height: image.height * scale,
        imageRendering: "pixelated",
      }}
    />
  );
}

export function Stepper({
  point,
  image,
  onMove,
}: {
  point: Point;
  image: RgbaImage;
  onMove: (p: Point) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="One pixel to the left"
        icon={<ChevronLeft size={14} />}
        size="sm"
        disabled={point.x <= 0}
        onClick={() => onMove({ x: point.x - 1, y: point.y })}
      />
      <span className="tabular w-24 text-center font-mono text-2xs text-text-secondary">
        x {point.x}, y {point.y}
      </span>
      <IconButton
        label="One pixel to the right"
        icon={<ChevronRight size={14} />}
        size="sm"
        disabled={point.x >= image.width - 1}
        onClick={() => onMove({ x: point.x + 1, y: point.y })}
      />
    </div>
  );
}

function Grid({
  rows,
  caption,
  highlight = true,
  digits = 1,
}: {
  rows: number[][];
  caption: string;
  highlight?: boolean;
  digits?: number;
}) {
  const c = (rows.length - 1) >> 1;
  return (
    <table className="tabular border-collapse font-mono text-2xs">
      <caption className="pb-0.5 text-left font-sans text-text-muted">{caption}</caption>
      <tbody>
        {rows.map((row, j) => (
          <tr key={j}>
            {row.map((v, i) => (
              <td
                key={i}
                className={clsx(
                  "border border-border-subtle px-1 py-0.5 text-right",
                  highlight && i === c && j === c && "bg-accent-subtle font-semibold",
                )}
              >
                {round(v, digits)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function NeighborhoodStepper({ filterId, values, image, point, onMove }: WidgetProps) {
  const filter = browserFilter(filterId);
  const representation = filter?.representation(values);
  const kernel = representation?.kind === "kernels" ? representation.kernels[0] : undefined;
  if (!kernel) return <p className="text-text-muted">This filter has no kernel to step through.</p>;
  if (kernel.rows.length > 7) {
    return (
      <p className="text-text-muted">
        The kernel is {kernel.rows.length} pixels wide. Make it 7 or smaller to step through it
        here.
      </p>
    );
  }
  const channel = channelOf(values);
  const window = windowAt(image, point, kernel.rows.length, borderOf(values), channel);
  const products = window.map((row, j) => row.map((v, i) => v * (kernel.rows[j]?.[i] ?? 0)));
  const sum = products.flat().reduce((a, b) => a + b, 0);
  const engineValues =
    representation?.kind === "kernels" && representation.kernels.length > 1 && "output" in values
      ? { ...values, output: "gx" }
      : values;
  const engine = engineValueAt(filterId, engineValues, image, point);
  return (
    <div className="flex flex-col gap-2">
      <Stepper point={point} image={image} onMove={onMove} />
      <div className="flex flex-wrap gap-3">
        <Grid rows={window} caption={channel === "luma" ? "Luma values" : "Red values"} />
        <Grid rows={kernel.rows.map((r) => [...r])} caption="Weights" digits={3} />
        <Grid rows={products} caption="Value x weight" />
      </div>
      <p>
        Sum of the products: <strong className="tabular">{round(sum, 2)}</strong>. The filter gives{" "}
        <strong className="tabular">{round(engine, 2)}</strong> here
        {engineValues !== values ? " for Gx" : ""}, before rounding.
      </p>
    </div>
  );
}

/** An image with one bright pixel in the middle. */
function impulseImage(size: number): RgbaImage {
  const image = createImage(size, size);
  for (let i = 0; i < size * size; i++) image.data[i * 4 + 3] = 255;
  image.data.set([255, 255, 255, 255], ((size >> 1) * size + (size >> 1)) * 4);
  return image;
}

export function ImpulseResponse({ filterId, values }: WidgetProps) {
  const [stretch, setStretch] = useState(true);
  const result = useMemo(() => {
    const filter = browserFilter(filterId);
    if (!filter) return null;
    const radius = Math.min(40, Math.max(4, filter.radius(values) + 3));
    const size = 2 * radius + 1;
    const derived = filter.kind === "derived";
    const params = derived
      ? { ...values, outputMapping: "offset", channelScope: "luminance" }
      : { ...values, linearLight: false };
    const out = runFilter(impulseImage(size), filter, params).image;
    if (!stretch || derived) return { image: out, size };
    // A blurred point is dim. Stretch the brightest value to 255 so its shape is easy to see.
    let max = 1;
    for (let i = 0; i < out.data.length; i += 4) max = Math.max(max, out.data[i] ?? 0);
    const data = out.data.slice();
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.round(((data[i] ?? 0) * 255) / max);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    return { image: { ...out, data }, size };
  }, [filterId, values, stretch]);
  if (!result) return null;
  const scale = Math.max(2, Math.floor(200 / result.size));
  return (
    <div className="flex flex-col gap-2">
      <PixelCanvas
        image={result.image}
        scale={scale}
        label="The filter result for one bright pixel in the middle of a black square"
      />
      <label className="flex items-center gap-2 text-text-secondary">
        <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} />
        Stretch the brightness so faint weights show
      </label>
      <p className="text-text-secondary">
        One white pixel on black, after the filter. For a linear filter this picture is the kernel
        itself.
      </p>
    </div>
  );
}

/** The window statistic of the real filter at the center of a window, before rounding. */
function windowResult(filterId: string, values: Params, window: number[][]): number {
  const filter = browserFilter(filterId);
  if (!filter || (filter.kind !== "smooth" && filter.kind !== "derived")) return Number.NaN;
  const size = window.length;
  const plane = { width: size, height: size, data: Float32Array.from(window.flat()) };
  const context = { border: borderOf(values), originX: 0, originY: 0, channel: 0 };
  return filter.plane(plane, values, context).data[(size * size - 1) / 2] ?? Number.NaN;
}

const MAX_SHOWN = 7;

export function RankStepper({ filterId, values, image, point, onMove }: WidgetProps) {
  const representation = browserFilter(filterId)?.representation(values);
  const size =
    representation?.kind === "rank" || representation?.kind === "window"
      ? representation.size
      : Number(values.size ?? 3);
  const channel = channelOf(values);
  const full = windowAt(image, point, size, borderOf(values), channel);
  const shown = Math.min(size, MAX_SHOWN);
  const cut = (size - shown) >> 1;
  const window = full
    .slice(cut, cut + shown)
    .map((row) => row.slice(cut, cut + shown).map((v) => Math.round(v)));
  const sorted = [...window.flat()].sort((a, b) => a - b);
  // Ranks are marked only when the whole window is shown.
  const [from, to] =
    representation?.kind === "rank" && shown === size
      ? [representation.rank - 1, (representation.rankTo ?? representation.rank) - 1]
      : [-1, -2];
  const mean = full.flat().reduce((a, b) => a + b, 0) / (size * size);
  const result = windowResult(filterId, values, full);
  return (
    <div className="flex flex-col gap-2">
      <Stepper point={point} image={image} onMove={onMove} />
      <Grid
        rows={window}
        caption={`${size}x${size} window${size > MAX_SHOWN ? ` (the demo shows the center ${MAX_SHOWN}x${MAX_SHOWN})` : ""}`}
        digits={0}
      />
      <div className="flex flex-col gap-1">
        <span className="text-text-muted">Sorted values</span>
        <ol
          aria-label="Sorted window values"
          className="tabular flex flex-wrap gap-0.5 font-mono text-2xs"
        >
          {sorted.map((v, i) => {
            const used = i >= from && i <= to;
            return (
              <li
                key={i}
                aria-current={used ? "true" : undefined}
                className={clsx(
                  "rounded-[3px] border px-1",
                  used ? "border-accent bg-accent text-on-accent" : "border-border-subtle",
                )}
              >
                {v}
              </li>
            );
          })}
        </ol>
      </div>
      <p>
        The filter gives <strong className="tabular">{round(result, 2)}</strong> here
        {from >= 0
          ? to > from
            ? `, from the marked values at positions ${from + 1} to ${to + 1}`
            : `, the value at position ${from + 1}`
          : ""}
        . The mean of the same window is <strong className="tabular">{round(mean, 1)}</strong>. One
        extreme value can pull the mean far away.
      </p>
    </div>
  );
}

/** Direction as hue and strength as brightness, for a small copy of the image. */
function directionWheel(image: RgbaImage): RgbaImage {
  const step = Math.max(1, Math.ceil(Math.max(image.width, image.height) / 160));
  const width = Math.max(1, Math.floor(image.width / step));
  const height = Math.max(1, Math.floor(image.height / step));
  const plane = createPlane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      plane.data[y * width + x] = valueAt(image, x * step, y * step, "luma");
  }
  const { gx, gy } = sobelGradients(plane, "reflect101");
  let max = 1e-6;
  for (let i = 0; i < plane.data.length; i++)
    max = Math.max(max, Math.hypot(gx.data[i] ?? 0, gy.data[i] ?? 0));
  const out = createImage(width, height);
  for (let i = 0; i < plane.data.length; i++) {
    const x = gx.data[i] ?? 0;
    const y = gy.data[i] ?? 0;
    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const [r, g, b] = hsvToRgb(hue, 1, Math.min(1, Math.hypot(x, y) / max));
    out.data.set([Math.round(r), Math.round(g), Math.round(b), 255], i * 4);
  }
  return out;
}

export function GradientExplorer({ filterId, values, image, point, onMove }: WidgetProps) {
  const window = windowAt(image, point, 3, borderOf(values), "luma");
  // Gx and Gy come from the real Sobel code, on brightness, at this pixel.
  const on = (output: string) => ({ ...values, output, channelScope: "luminance" });
  const gx = engineValueAt(filterId, on("gx"), image, point);
  const gy = engineValueAt(filterId, on("gy"), image, point);
  const magnitude = Math.hypot(gx, gy);
  const angle = (Math.atan2(gy, gx) * 180) / Math.PI;
  const wheel = useMemo(() => directionWheel(image), [image]);
  const length = magnitude > 0 ? 28 : 0;
  return (
    <div className="flex flex-col gap-2">
      <Stepper point={point} image={image} onMove={onMove} />
      <div className="flex flex-wrap items-center gap-3">
        <Grid rows={window} caption="Luma values" />
        <svg
          viewBox="-40 -40 80 80"
          className="size-20"
          role="img"
          aria-label={`Gradient direction ${round(angle, 0)} degrees`}
        >
          <circle r={36} fill="none" stroke="var(--px-border)" />
          <line
            x1={0}
            y1={0}
            x2={(length * gx) / (magnitude || 1)}
            y2={(length * gy) / (magnitude || 1)}
            stroke="var(--px-accent)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle r={3} fill="var(--px-text)" />
        </svg>
      </div>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
        <dt className="font-sans text-text-muted">Gx</dt>
        <dd>{round(gx, 1)}</dd>
        <dt className="font-sans text-text-muted">Gy</dt>
        <dd>{round(gy, 1)}</dd>
        <dt className="font-sans text-text-muted">Magnitude</dt>
        <dd>{round(magnitude, 1)}</dd>
        <dt className="font-sans text-text-muted">Direction</dt>
        <dd>{magnitude > 0 ? `${round(angle, 0)} degrees` : "none, the window is flat"}</dd>
      </dl>
      <p className="text-text-secondary">
        The arrow points from dark to bright. y points down, so a positive angle points below the x
        axis.
      </p>
      <figure className="flex flex-col gap-1">
        <PixelCanvas
          image={wheel}
          scale={1}
          label="Gradient direction of the whole image as colors"
        />
        <figcaption className="text-2xs text-text-muted">
          Color shows the direction of change at each pixel, brightness its strength.
        </figcaption>
      </figure>
    </div>
  );
}

interface Profile {
  readonly before: number[];
  readonly filtered: number[];
  readonly offset: number;
}

/**
 * Brightness along the row or column through the probe, before and after the filter. Browser
 * filters run on a line of up to 97 pixels. Science filters run in the engine on the 64x64
 * patch around the probe, and the line is cut from the patch.
 */
export function LineProfile({ filterId, values, image, point }: WidgetProps) {
  const [axis, setAxis] = useState("row");
  const channel = channelOf(values);
  const inBrowser = browserFilter(filterId) !== undefined;
  const browserData = useMemo((): Profile | null => {
    const filter = browserFilter(filterId);
    if (!filter) return null;
    const half = 48;
    const along = axis === "row" ? image.width : image.height;
    const center = axis === "row" ? point.x : point.y;
    const start = Math.max(0, Math.min(center - half, along - 2 * half - 1));
    const length = Math.min(along, 2 * half + 1);
    const region =
      axis === "row"
        ? { x: Math.max(0, start), y: point.y, width: length, height: 1 }
        : { x: point.x, y: Math.max(0, start), width: 1, height: length };
    const after = runFilter(image, filter, values, region).image;
    const before: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < length; i++) {
      const x = axis === "row" ? region.x + i : point.x;
      const y = axis === "row" ? point.y : region.y + i;
      before.push(valueAt(image, x, y, channel));
      filtered.push(valueAt(after, axis === "row" ? i : 0, axis === "row" ? 0 : i, channel));
    }
    return { before, filtered, offset: axis === "row" ? region.x : region.y };
  }, [filterId, values, image, point, axis, channel]);
  const patch = useMemo(() => patchAt(image, point.x, point.y), [image, point.x, point.y]);
  const inputs = useMemo(() => [{ image: patch, values }], [patch, values]);
  const engine = useEngineResults(filterId, inputs, !inBrowser);
  const engineData = useMemo((): Profile | null => {
    const after = engine.images?.[0];
    if (inBrowser || !after) return null;
    const { x0, y0 } = patchFrame(image, point.x, point.y);
    const length = axis === "row" ? patch.width : patch.height;
    const before: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < length; i++) {
      const x = axis === "row" ? i : point.x - x0;
      const y = axis === "row" ? point.y - y0 : i;
      before.push(valueAt(patch, x, y, channel));
      filtered.push(valueAt(after, x, y, channel));
    }
    return { before, filtered, offset: axis === "row" ? x0 : y0 };
  }, [inBrowser, engine.images, image, patch, point.x, point.y, axis, channel]);
  const data = browserData ?? engineData;
  if (!data) {
    return engine.note ? (
      <p role="status" className="text-text-secondary">
        {engine.note}
      </p>
    ) : null;
  }
  const width = 240;
  const height = 110;
  const path = (series: number[]) =>
    series
      .map(
        (v, i) => `${(i / Math.max(1, series.length - 1)) * width},${height - (v / 255) * height}`,
      )
      .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="Direction of the line"
        value={axis}
        onChange={setAxis}
        segments={[
          { value: "row", label: "Along the row" },
          { value: "column", label: "Along the column" },
        ]}
      />
      <svg
        viewBox={`-4 -4 ${width + 8} ${height + 8}`}
        className="w-full max-w-72"
        role="img"
        aria-label={`Brightness along the ${axis} through the probe pixel, before and after the filter`}
      >
        <rect width={width} height={height} fill="var(--px-raised)" />
        <polyline
          points={path(data.before)}
          fill="none"
          stroke="var(--px-text-muted)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <polyline
          points={path(data.filtered)}
          fill="none"
          stroke="var(--px-accent)"
          strokeWidth={2}
        />
      </svg>
      <p className="flex gap-4 text-2xs text-text-muted">
        <span>Dashed: before</span>
        <span className="text-accent-fg">Solid: after</span>
        <span>
          {axis === "row" ? "x" : "y"} from {data.offset} to {data.offset + data.before.length - 1},{" "}
          {channel === "luma" ? "luma" : "red channel"}
        </span>
      </p>
    </div>
  );
}
