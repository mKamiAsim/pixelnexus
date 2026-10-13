/**
 * The Spectrum panel: the live log magnitude spectrum of the active image. When the selected
 * filter works in the frequency domain, the frequencies it removes are tinted. When the filter
 * takes notch positions, a click adds a notch there and a click with Shift removes the nearest.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { filterById } from "@/app/filterActions";
import { useFilterValues } from "@/app/useFilterValues";
import type { Filter } from "@/catalog";
import { entryParams } from "@/catalog/params";
import { Switch } from "@/components/ui/Switch";
import { frequencyResponse, hasFrequencyResponse } from "@/core/filters/frequency";
import {
  frequencyAt,
  positionOf,
  snapToPeak,
  spectrumPicture,
  spectrumView,
  SPECTRUM_SIDE,
  type SpectrumView,
} from "@/core/filters/frequency/display";
import {
  formatNotches,
  MAX_NOTCHES,
  mirrors,
  notchCenters,
  parseNotches,
  type Notch,
} from "@/core/filters/frequency/notch";
import { isBorderMode } from "@/core/filters/planes";
import type { RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

/** Spectra are computed once per image version and reused. */
const cache = new WeakMap<RgbaImage, SpectrumView>();

/** Compute the spectrum after the browser has painted, as the Histogram panel does. */
function useSpectrum(image: RgbaImage | null): SpectrumView | null {
  const [state, setState] = useState<{ image: RgbaImage; view: SpectrumView } | null>(null);
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => {
      const view = cache.get(image) ?? spectrumView(image);
      cache.set(image, view);
      setState({ image, view });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [image]);
  return image && state?.image === image ? state.view : null;
}

export function SpectrumPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const showOriginal = useUi((s) => s.showOriginal);
  const image = doc ? (showOriginal ? doc.original : doc.current) : null;
  const entry = filterById(useFilters((s) => s.selectedId));
  const view = useSpectrum(image);
  if (!doc) {
    return <p className="p-3 text-sm text-text-secondary">Open an image to see its spectrum.</p>;
  }
  if (!view) return <p className="p-3 text-xs text-text-muted">Computing the spectrum…</p>;
  return entry ? <WithFilter view={view} entry={entry} /> : <SpectrumFigure view={view} />;
}

function WithFilter({ view, entry }: { view: SpectrumView; entry: Filter }) {
  const { values } = useFilterValues(entry);
  const setValue = useFilters((s) => s.setValue);
  const [tinted, setTinted] = useState(true);
  const frequency = hasFrequencyResponse(entry.id);
  const pointsParam = entryParams(entry).find((p) => p.type === "points");
  const response = useMemo(
    () => (frequency ? frequencyResponse(entry.id, values, view.plane) : undefined),
    [frequency, entry.id, values, view.plane],
  );
  const border = isBorderMode(values.border) ? values.border : "reflect";
  const parsed = pointsParam ? parseNotches(String(values[pointsParam.key] ?? "")) : null;
  const notches = parsed?.ok ? parsed.notches : [];
  const edit = pointsParam
    ? (next: Notch[]) => setValue(entry.id, pointsParam.key, formatNotches(next))
    : undefined;
  return (
    <SpectrumFigure
      view={view}
      response={tinted ? response : undefined}
      notches={pointsParam ? notches : undefined}
      mirrorAxes={mirrors(border)}
      radius={Number(values.radius ?? 0)}
      onEdit={edit}
      header={
        frequency ? (
          <Switch label={`Tint what ${entry.name} removes`} checked={tinted} onChange={setTinted} />
        ) : null
      }
    />
  );
}

const round4 = (v: number) => Number(v.toFixed(4)) || 0;

function SpectrumFigure({
  view,
  response,
  notches,
  mirrorAxes = false,
  radius = 0,
  onEdit,
  header,
}: {
  view: SpectrumView;
  response?: ((fx: number, fy: number) => number) | undefined;
  notches?: Notch[] | undefined;
  mirrorAxes?: boolean;
  radius?: number;
  onEdit?: ((notches: Notch[]) => void) | undefined;
  header?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ fx: number; fy: number } | null>(null);
  const picture = useMemo(() => spectrumPicture(view, response), [view, response]);
  const { width, height } = view.spectrum;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = picture.width;
    canvas.height = picture.height;
    context.putImageData(new ImageData(picture.data.slice(), picture.width, picture.height), 0, 0);
  }, [picture]);

  const positionAt = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      column: Math.floor(((event.clientX - box.left) / box.width) * width),
      row: Math.floor(((event.clientY - box.top) / box.height) * height),
    };
  };
  const frequencyOf = ({ column, row }: { column: number; row: number }) => {
    const f = frequencyAt(view, column, row);
    return { fx: round4(f.fx), fy: round4(f.fy) };
  };
  const click = (event: MouseEvent<SVGSVGElement>) => {
    if (!onEdit || !notches) return;
    const at = positionAt(event);
    const f = frequencyOf(event.shiftKey ? at : snapToPeak(view, at.column, at.row));
    if (event.shiftKey) {
      // Remove the notch nearest to the click, counting its mirror points.
      let best = -1;
      let distance = Infinity;
      notches.forEach((n, i) => {
        for (const c of notchCenters([n], mirrorAxes)) {
          const d = Math.hypot(c.fx - f.fx, c.fy - f.fy);
          if (d < distance) [best, distance] = [i, d];
        }
      });
      if (best >= 0) onEdit(notches.filter((_, i) => i !== best));
    } else if (notches.length < MAX_NOTCHES && (f.fx !== 0 || f.fy !== 0)) {
      onEdit([...notches, f]);
    }
  };
  const centers = (notches ?? []).flatMap((n) =>
    notchCenters([n], mirrorAxes).map((c, k) => ({ ...c, primary: k === 0 })),
  );
  const period = hover ? 1 / Math.hypot(hover.fx, hover.fy) : 0;
  const angle = hover ? (Math.atan2(-hover.fy, hover.fx) * 180) / Math.PI : 0;
  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      {header}
      <div className="relative w-full max-w-80" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 size-full border border-border"
        />
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={
            onEdit ? "absolute inset-0 size-full cursor-crosshair" : "absolute inset-0 size-full"
          }
          role="img"
          aria-label={`Log magnitude spectrum of the image${notches ? `, with ${notches.length} notch${notches.length === 1 ? "" : "es"}` : ""}`}
          onClick={click}
          onMouseMove={(event) => setHover(frequencyOf(positionAt(event)))}
          onMouseLeave={() => setHover(null)}
        >
          {centers.map((c, i) => {
            const p = positionOf(view, c.fx, c.fy);
            return (
              <ellipse
                key={i}
                cx={p.column + 0.5}
                cy={p.row + 0.5}
                rx={Math.max(2, radius * width)}
                ry={Math.max(2, radius * height)}
                fill="none"
                stroke="var(--px-accent)"
                strokeWidth={Math.max(1, width / 160)}
                strokeDasharray={c.primary ? undefined : "3 2"}
              />
            );
          })}
        </svg>
      </div>
      <p className="tabular min-h-4 font-mono text-2xs text-text-secondary">
        {hover
          ? `fx ${hover.fx}, fy ${hover.fy} cycles/px` +
            (period < Infinity ? `, period ${period.toFixed(1)} px at ${angle.toFixed(0)} deg` : "")
          : " "}
      </p>
      <p className="text-text-secondary">
        log(1 + |F|) of the image
        {view.cropped ? `, center ${view.plane.width} x ${view.plane.height}` : ""}, with its mean
        removed and a Hann window, so periodic patterns show as sharp peaks. Frequency 0 is in the
        center and the edges are 0.5 cycles per pixel.
        {view.cropped ? ` Larger images show their center ${SPECTRUM_SIDE} pixels.` : ""}
      </p>
      {onEdit ? (
        <p className="text-text-secondary">
          Click a peak to add a notch there. A click lands on the brightest point within 2 steps.
          Shift and click removes the nearest notch. Dashed rings are the mirror points the filter
          adds.
        </p>
      ) : null}
    </div>
  );
}
