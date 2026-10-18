/**
 * Select > Color Range, Select by brightness and Select by hue and saturation. One dialog shape
 * for all three: the catalog parameters, a small live preview, and how the result combines with
 * the current selection. The preview runs on a small copy of the image. Color samples carry the
 * colors read from the full image, so the preview matches the final result.
 */
import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";

import { entryParams } from "@/catalog/params";
import { ParamControl } from "@/components/params/ParamControl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Params, ParamValue } from "@/core/filters/types";
import { resizeImage } from "@/core/image/resize";
import type { RgbaImage } from "@/core/image/types";
import {
  combineMasks,
  isMaskEmpty,
  maskToImage,
  type CombineMode,
  type Mask,
} from "@/core/mask/mask";
import { sampleColor, type ColorSpace } from "@/core/selection/color";
import {
  colorRange,
  selectBrightness,
  selectHsv,
  type RangePreset,
  type RangeSample,
} from "@/core/selection/range";
import type { Param } from "@/generated/catalog-types";
import { toolEntry, useToolValues } from "@/selection/values";
import { activeDocument, activeSelection, useDocuments } from "@/state/documents";
import { useSelection } from "@/state/selection";
import { useUi, type DialogId } from "@/state/ui";

import { commitSelection } from "./selectionActions";
import { MODES } from "./selectionModes";

/** Longest side of the preview, in CSS pixels. */
const PREVIEW_SIZE = 240;

const num = (value: ParamValue | undefined, fallback = 0) =>
  typeof value === "number" ? value : fallback;

interface RangeSpec {
  readonly dialog: Exclude<DialogId, null>;
  /** Catalog id in catalog/tools/. */
  readonly tool: string;
  readonly description: string;
  /** True when the user samples colors by clicking the preview. */
  readonly samples: boolean;
  readonly shown?: (param: Param, values: Params) => boolean;
  readonly make: (image: RgbaImage, values: Params, samples: readonly RangeSample[]) => Mask;
}

const SPECS: readonly RangeSpec[] = [
  {
    dialog: "select-color-range",
    tool: "color-range",
    description: "Selects every pixel near the colors you sample, or a range of tones.",
    samples: true,
    // The tone presets ignore the color settings, and Range only matters for localized colors.
    shown: (param, values) =>
      values.preset !== "sampled"
        ? param.key === "preset"
        : param.key !== "range" || values.localized === true,
    make: (image, values, samples) =>
      colorRange(image, {
        preset: String(values.preset) as RangePreset,
        samples,
        tolerance: num(values.tolerance),
        fuzziness: num(values.fuzziness),
        colorSpace: String(values.colorSpace) as ColorSpace,
        localized: values.localized === true,
        range: num(values.range, 25),
      }),
  },
  {
    dialog: "select-brightness",
    tool: "select-brightness",
    description:
      "Selects pixels by brightness, from 0 (black) to 255 (white). The selection fades outside the range.",
    samples: false,
    make: (image, values) =>
      selectBrightness(image, {
        low: num(values.low),
        high: num(values.high, 255),
        softness: num(values.softness),
      }),
  },
  {
    dialog: "select-hsv",
    tool: "select-hsv",
    description:
      "Selects pixels by hue, saturation and value. Use it to pick one family of colors, such as all the greens.",
    samples: false,
    make: (image, values) =>
      selectHsv(image, {
        hue: num(values.hue),
        hueWidth: num(values.hueWidth, 30),
        saturationMin: num(values.saturationMin),
        saturationMax: num(values.saturationMax, 100),
        valueMin: num(values.valueMin),
        valueMax: num(values.valueMax, 100),
        softness: num(values.softness),
      }),
  },
];

const NO_SAMPLES: readonly RangeSample[] = [];

/** The three range dialogs. Each is mounted once and opens from the Select menu. */
export function RangeSelectDialogs() {
  return (
    <>
      {SPECS.map((spec) => (
        <RangeSelectDialog key={spec.dialog} spec={spec} />
      ))}
    </>
  );
}

function RangeSelectDialog({ spec }: { spec: RangeSpec }) {
  const open = useUi((s) => s.dialog === spec.dialog);
  const setDialog = useUi((s) => s.setDialog);
  const probe = useUi((s) => s.probe);
  const doc = useDocuments((s) => activeDocument(s));
  const values = useToolValues(spec.tool);
  const setValue = useSelection((s) => s.setValue);
  const resetValues = useSelection((s) => s.resetValues);
  const [mode, setMode] = useState<CombineMode>("new");
  const [show, setShow] = useState<"selection" | "image">("selection");
  const [picked, setPicked] = useState<{ docId: string; samples: readonly RangeSample[] }>({
    docId: "",
    samples: NO_SAMPLES,
  });
  const [proxy, setProxy] = useState<{ source: RgbaImage; image: RgbaImage } | null>(null);
  const formId = useId();
  const entry = toolEntry(spec.tool);
  const image = doc?.current ?? null;
  const samples = doc && picked.docId === doc.id ? picked.samples : NO_SAMPLES;
  const small = proxy && proxy.source === image ? proxy.image : null;

  // Make the small copy of the image when the dialog opens.
  useEffect(() => {
    if (!open || !image) return;
    let cancelled = false;
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    resizeImage(image, width, height).then(
      (result) => {
        if (!cancelled) setProxy({ source: image, image: result });
      },
      () => {
        // The preview stays empty. OK still works on the full image.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, image]);

  const preview = useMemo(() => {
    if (!small || !image) return null;
    const sx = small.width / image.width;
    const sy = small.height / image.height;
    const scaled = samples.map((s) => ({
      x: Math.min(small.width - 1, Math.floor(s.x * sx)),
      y: Math.min(small.height - 1, Math.floor(s.y * sy)),
      ...(s.color ? { color: s.color } : {}),
    }));
    return spec.make(small, values, scaled);
  }, [small, image, samples, values, spec]);

  const coverage = useMemo(() => {
    if (!preview) return null;
    let sum = 0;
    for (const v of preview.data) sum += v;
    return sum / (255 * preview.data.length);
  }, [preview]);

  const previewImage = useMemo(() => (preview ? maskToImage(preview) : null), [preview]);

  if (!entry) return null;
  const needsSamples = spec.samples && values.preset === "sampled";
  const params = entryParams(entry).filter((p) => !p.advanced && (spec.shown?.(p, values) ?? true));

  const setSamples = (next: readonly RangeSample[]) => {
    if (doc) setPicked({ docId: doc.id, samples: next });
  };
  const sampleAt = (x: number, y: number): RangeSample | null =>
    image ? { x, y, color: sampleColor(image, x, y, 1) } : null;

  const pick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!image || !needsSamples) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * image.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * image.height);
    const at = sampleAt(
      Math.min(image.width - 1, Math.max(0, x)),
      Math.min(image.height - 1, Math.max(0, y)),
    );
    if (!at) return;
    if (event.altKey) {
      // Remove the sample nearest to the click.
      let nearest = -1;
      let best = Infinity;
      samples.forEach((s, i) => {
        const d = Math.hypot(s.x - at.x, s.y - at.y);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      if (nearest >= 0) setSamples(samples.filter((_, i) => i !== nearest));
    } else if (event.shiftKey) {
      setSamples([...samples, at]);
    } else {
      setSamples([at]);
    }
  };

  const probeHere = probe && doc && probe.documentId === doc.id ? probe : null;
  const canApply = Boolean(doc) && (!needsSamples || samples.length > 0);

  const apply = () => {
    if (!doc || !canApply) return;
    const made = spec.make(doc.current, values, samples);
    const mask = combineMasks(activeSelection(doc), made, mode);
    commitSelection(doc.id, isMaskEmpty(mask) ? null : mask, entry.name);
    setDialog(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? spec.dialog : null)}
      title={entry.name}
      description={spec.description}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              resetValues(spec.tool);
              setSamples(NO_SAMPLES);
            }}
          >
            Reset
          </Button>
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!canApply}>
            OK
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label="Preview"
            value={show}
            onChange={(value) => setShow(value === "image" ? "image" : "selection")}
            segments={[
              { value: "selection", label: "Selection" },
              { value: "image", label: "Image" },
            ]}
          />
          <PreviewCanvas
            image={show === "image" ? small : previewImage}
            samples={samples}
            source={image}
            onPick={needsSamples ? pick : undefined}
          />
          <p className="tabular text-xs text-text-secondary" aria-live="polite">
            {coverage === null
              ? "Making the preview..."
              : needsSamples && samples.length === 0
                ? "Click the preview to sample a color."
                : `Selects about ${Math.round(coverage * 100)}% of the image.`}
          </p>
          {needsSamples ? (
            <Samples
              samples={samples}
              onRemove={(index) => setSamples(samples.filter((_, i) => i !== index))}
              onClear={() => setSamples(NO_SAMPLES)}
              onAddProbe={
                probeHere
                  ? () => {
                      const at = sampleAt(probeHere.x, probeHere.y);
                      if (at) setSamples([...samples, at]);
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {params.map((param) => (
            <ParamControl
              key={param.key}
              param={param}
              value={values[param.key] ?? param.default}
              onChange={(value) => setValue(spec.tool, param.key, value)}
            />
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Combine with the current selection</span>
            <SegmentedControl
              label="Combine with the current selection"
              value={mode}
              onChange={(value) => setMode(value as CombineMode)}
              iconOnly
              segments={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** The preview image with the sample points on top. Click handling is optional. */
function PreviewCanvas({
  image,
  samples,
  source,
  onPick,
}: {
  image: RgbaImage | null;
  samples: readonly RangeSample[];
  source: RgbaImage | null;
  onPick: ((event: MouseEvent<HTMLCanvasElement>) => void) | undefined;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas
      .getContext("2d")
      ?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  }, [image]);
  if (!image || !source) {
    return <div className="size-60 rounded-[3px] border border-border bg-raised" />;
  }
  return (
    <div className="relative self-start">
      <canvas
        ref={ref}
        role="img"
        aria-label="Preview. Click to sample a color, Shift-click to add one, Alt-click to remove the nearest."
        onClick={onPick}
        className="checkerboard block rounded-[3px] border border-border"
        style={{
          width: image.width,
          height: image.height,
          cursor: onPick ? "crosshair" : undefined,
        }}
      />
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" fill="none">
        {samples.map((s, i) => {
          const cx = ((s.x + 0.5) / source.width) * image.width + 1;
          const cy = ((s.y + 0.5) / source.height) * image.height + 1;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={4} stroke="white" strokeWidth={3} />
              <circle cx={cx} cy={cy} r={4} stroke="black" strokeWidth={1} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Samples({
  samples,
  onRemove,
  onClear,
  onAddProbe,
}: {
  samples: readonly RangeSample[];
  onRemove: (index: number) => void;
  onClear: () => void;
  onAddProbe: (() => void) | undefined;
}) {
  return (
    <div className="flex max-w-60 flex-col gap-1.5">
      {samples.length > 0 ? (
        <ul aria-label="Color samples" className="flex flex-wrap gap-1">
          {samples.map((s, i) => {
            const [r, g, b] = s.color ?? [0, 0, 0];
            return (
              <li
                key={i}
                className="flex items-center gap-1 rounded-control border border-border-subtle py-0.5 pr-0.5 pl-1"
              >
                <span
                  aria-hidden
                  className="size-3 rounded-[2px] border border-border"
                  style={{ background: `rgb(${r} ${g} ${b})` }}
                />
                <span className="tabular text-xs text-text-secondary">
                  {s.x}, {s.y}
                </span>
                <IconButton
                  label={`Remove the sample at x ${s.x}, y ${s.y}`}
                  icon={<X size={11} />}
                  size="sm"
                  onClick={() => onRemove(i)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {onAddProbe ? (
          <Button size="sm" onClick={onAddProbe}>
            Add the Probe pixel
          </Button>
        ) : null}
        {samples.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear samples
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-text-muted">
        Shift-click adds a sample. Alt-click removes the nearest one. To sample with the keyboard,
        pin a pixel with the Probe tool (I) first.
      </p>
    </div>
  );
}
