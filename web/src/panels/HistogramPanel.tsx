import { useEffect, useRef, useState } from "react";

import { fixed } from "@/app/format";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { computeHistogram, histogramStats, type Histogram } from "@/core/image/histogram";
import type { RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useUi } from "@/state/ui";

type View = "rgb" | "luma" | "red" | "green" | "blue" | "alpha";

const VIEWS: readonly { value: View; label: string }[] = [
  { value: "rgb", label: "RGB" },
  { value: "luma", label: "Luma" },
  { value: "red", label: "R" },
  { value: "green", label: "G" },
  { value: "blue", label: "B" },
  { value: "alpha", label: "A" },
];

const CHANNEL_COLORS = { red: "#e5484d", green: "#30a46c", blue: "#3e63dd" } as const;

/** Histograms are counted once per image version and reused. */
const cache = new WeakMap<RgbaImage, Histogram>();

/**
 * Count the histogram after the browser has painted, so opening a large image never waits
 * for it. The previous result stays on screen until the new one is ready.
 */
function useHistogram(image: RgbaImage | null): { histogram: Histogram | null; counting: boolean } {
  const [state, setState] = useState<{ image: RgbaImage | null; histogram: Histogram | null }>({
    image: null,
    histogram: null,
  });
  useEffect(() => {
    if (!image) return;
    const cached = cache.get(image);
    const timer = window.setTimeout(() => {
      const histogram = cached ?? computeHistogram(image);
      cache.set(image, histogram);
      setState({ image, histogram });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [image]);
  return {
    histogram: image ? state.histogram : null,
    counting: image !== null && state.image !== image,
  };
}

/** Live histogram of the active image, with summary values. */
export function HistogramPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const showOriginal = useUi((s) => s.showOriginal);
  const image = doc ? (showOriginal ? doc.original : doc.current) : null;
  const { histogram, counting } = useHistogram(image);
  const [view, setView] = useState<View>("rgb");
  const [logScale, setLogScale] = useState(false);

  if (!doc) {
    return <p className="p-3 text-sm text-text-secondary">Open an image to see its histogram.</p>;
  }

  const statsChannel = view === "rgb" ? "luma" : view;
  const stats = histogram ? histogramStats(histogram[statsChannel]) : null;

  return (
    <div className="flex flex-col gap-2.5 p-3 text-xs">
      <SegmentedControl
        label="Histogram channel"
        value={view}
        onChange={(value) => setView(value as View)}
        segments={VIEWS}
        fullWidth
      />
      <div className="relative">
        {histogram ? (
          <HistogramPlot histogram={histogram} view={view} logScale={logScale} />
        ) : (
          <div className="h-24 rounded-control bg-raised" />
        )}
        {counting ? (
          <span role="status" className="absolute top-1 right-1.5 text-2xs text-text-muted">
            Counting pixels
          </span>
        ) : null}
      </div>
      <Switch label="Logarithmic scale" checked={logScale} onChange={setLogScale} />
      {stats ? (
        <dl className="tabular grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 font-mono">
          <dt className="font-sans text-text-muted">Mean</dt>
          <dd>{fixed(stats.mean, 2)}</dd>
          <dt className="font-sans text-text-muted">Std dev</dt>
          <dd>{fixed(stats.stdDev, 2)}</dd>
          <dt className="font-sans text-text-muted">Median</dt>
          <dd>{stats.median}</dd>
          <dt className="font-sans text-text-muted">Pixels</dt>
          <dd>{stats.count.toLocaleString("en-US")}</dd>
          <dt className="font-sans text-text-muted">Min</dt>
          <dd>{stats.min}</dd>
          <dt className="font-sans text-text-muted">Max</dt>
          <dd>{stats.max}</dd>
        </dl>
      ) : null}
      <p className="text-text-muted">
        {view === "rgb" ? "Values are for luma, Y' = 0.2126 R' + 0.7152 G' + 0.0722 B'. " : ""}
        {showOriginal ? "Showing the original image." : "Showing the current image."}
      </p>
    </div>
  );
}

function HistogramPlot({
  histogram,
  view,
  logScale,
}: {
  histogram: Histogram;
  view: View;
  logScale: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useUi((s) => s.theme);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(canvas);
    context.fillStyle = styles.getPropertyValue("--px-raised").trim() || "#eee";
    context.fillRect(0, 0, width, height);

    const series: { bins: Uint32Array; color: string }[] =
      view === "rgb"
        ? [
            { bins: histogram.red, color: CHANNEL_COLORS.red },
            { bins: histogram.green, color: CHANNEL_COLORS.green },
            { bins: histogram.blue, color: CHANNEL_COLORS.blue },
          ]
        : [
            {
              bins: histogram[view],
              color:
                view === "luma" || view === "alpha"
                  ? styles.getPropertyValue("--px-text-secondary").trim() || "#666"
                  : CHANNEL_COLORS[view],
            },
          ];
    const scale = (count: number) => (logScale ? Math.log1p(count) : count);
    let max = 1;
    for (const { bins } of series) for (const count of bins) max = Math.max(max, scale(count));
    context.globalAlpha = view === "rgb" ? 0.5 : 0.85;
    for (const { bins, color } of series) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, height);
      for (let v = 0; v < 256; v++) {
        const h = (scale(bins[v] ?? 0) / max) * (height - 2);
        context.lineTo((v / 256) * width, height - h);
        context.lineTo(((v + 1) / 256) * width, height - h);
      }
      context.lineTo(width, height);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 1;
  }, [histogram, view, logScale, theme, width]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Histogram of ${VIEWS.find((v) => v.value === view)?.label ?? view} values from 0 to 255${logScale ? ", logarithmic scale" : ""}`}
      className="block h-24 w-full rounded-control border border-border-subtle"
    />
  );
}
