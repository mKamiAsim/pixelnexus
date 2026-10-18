import { clsx } from "clsx";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";
import type { QualityMetrics } from "@/core/metrics/quality";
import { metricsInWorker } from "@/core/workers/metrics-client";
import { usePanelVisible } from "@/app/panelVisibility";
import {
  activeDocument,
  activeSelection,
  useDocuments,
  type HistoryStep,
  type ImageDocument,
} from "@/state/documents";

const ORIGINAL = "original";

type Measured = {
  readonly key: object;
  readonly metrics: QualityMetrics | null;
  readonly error?: string;
};

/**
 * The metrics of an image against a reference, from the worker. Undefined while they are being
 * computed. Nothing is computed while `enabled` is false, as for a panel behind another tab.
 */
function useMetrics(
  image: RgbaImage | undefined,
  reference: RgbaImage | undefined,
  mask: Mask | null,
  enabled: boolean,
): Measured | undefined {
  const [answer, setAnswer] = useState<Measured | undefined>(undefined);
  const fits =
    image && reference && image.width === reference.width && image.height === reference.height;
  // One object per question, so an old answer is never shown for a new question.
  const key = useMemo(() => ({ image, reference, mask }), [image, reference, mask]);
  useEffect(() => {
    if (!enabled || !fits || !image || !reference) return;
    let current = true;
    metricsInWorker(image, reference, mask)
      .then((metrics) => current && setAnswer({ key, metrics }))
      .catch(
        (error: unknown) =>
          current &&
          setAnswer({
            key,
            metrics: null,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return () => {
      current = false;
    };
  }, [enabled, fits, image, reference, mask, key]);
  if (!fits) return { key, metrics: null };
  return answer?.key === key ? answer : undefined;
}

const format = (value: number, digits: number, unit: string, psnr = false) =>
  Number.isFinite(value)
    ? `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`
    : psnr && value === Infinity
      ? "Equal images"
      : "No value";

const ROWS = [
  {
    key: "psnr",
    label: "PSNR",
    unit: "dB",
    digits: 2,
    help: "Peak signal-to-noise ratio. Higher is closer. Above about 40 dB the difference is hard to see.",
  },
  {
    key: "ssim",
    label: "SSIM",
    unit: "",
    digits: 4,
    help: "Structural similarity of local means, contrasts and structure. 1 means equal.",
  },
  {
    key: "mse",
    label: "MSE",
    unit: "",
    digits: 2,
    help: "Mean of the squared differences, in levels squared. 0 means equal.",
  },
  {
    key: "mae",
    label: "MAE",
    unit: "levels",
    digits: 2,
    help: "Mean of the absolute differences. 0 means equal.",
  },
] as const;

function StepRow({
  step,
  index,
  current,
  reference,
  mask,
}: {
  step: HistoryStep;
  index: number;
  current: boolean;
  reference: RgbaImage;
  mask: Mask | null;
}) {
  const fits = step.image.width === reference.width && step.image.height === reference.height;
  const measured = useMetrics(step.image, reference, fits ? mask : null, true);
  const m = measured?.metrics;
  return (
    <tr className={clsx("border-t border-border-subtle", current && "font-medium")}>
      <td className="max-w-40 truncate py-1 pr-2" title={step.label}>
        {index} {step.label}
      </td>
      <td className="py-1 pr-2 text-right font-mono">
        {!fits ? "Other size" : m ? format(m.psnr, 2, "dB", true) : "Measuring"}
      </td>
      <td className="py-1 text-right font-mono">{m ? format(m.ssim, 4, "") : ""}</td>
    </tr>
  );
}

/** The PSNR and SSIM of every step against the reference, computed on request in the worker. */
function StepTable({
  doc,
  reference,
  mask,
}: {
  doc: ImageDocument;
  reference: RgbaImage;
  mask: Mask | null;
}) {
  const [shown, setShown] = useState<{
    steps: readonly HistoryStep[];
    reference: RgbaImage;
  } | null>(null);
  const fresh = shown?.steps === doc.steps && shown.reference === reference;
  if (!fresh) {
    return (
      <Button size="sm" onClick={() => setShown({ steps: doc.steps, reference })}>
        Measure every step
      </Button>
    );
  }
  return (
    <table className="tabular w-full border-collapse" aria-label="Metrics of every step">
      <thead>
        <tr className="text-text-muted">
          <th scope="col" className="text-left font-normal">
            Step
          </th>
          <th scope="col" className="text-right font-normal">
            PSNR
          </th>
          <th scope="col" className="text-right font-normal">
            SSIM
          </th>
        </tr>
      </thead>
      <tbody>
        {doc.steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            index={index}
            current={index === doc.index}
            reference={reference}
            mask={mask && mask.width === reference.width ? mask : null}
          />
        ))}
      </tbody>
    </table>
  );
}

/**
 * Quality metrics of the active image against a reference: its own original, an earlier step,
 * or another open image of the same size. Optionally only inside the selection. Use it to measure how well a filter repairs a noisy test image.
 */
export function MetricsPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const documents = useDocuments((s) => s.documents);
  const [referenceId, setReferenceId] = useState(ORIGINAL);
  const [inside, setInside] = useState(false);
  const others = doc
    ? documents.filter(
        (d) =>
          d.id !== doc.id &&
          d.current.width === doc.current.width &&
          d.current.height === doc.current.height,
      )
    : [];
  // Earlier steps of this image can be the reference too, such as the clean image before noise.
  const earlier = doc ? doc.steps.slice(1, doc.index) : [];
  const otherDoc = others.find((d) => d.id === referenceId);
  const step = earlier.find((s) => `step-${s.id}` === referenceId);
  const current = doc?.current;
  const reference = otherDoc?.current ?? step?.image ?? doc?.original;
  const selection = doc ? activeSelection(doc) : null;
  const mask = inside && selection ? selection : null;
  const visible = usePanelVisible();
  const measured = useMetrics(current, reference, mask, visible);
  const fits = Boolean(
    current &&
    reference &&
    reference.width === current.width &&
    reference.height === current.height,
  );
  const metrics = measured?.metrics ?? null;

  if (!doc || !reference) {
    return <p className="p-3 text-xs text-text-secondary">Open an image to compare it.</p>;
  }
  const options = [
    { value: ORIGINAL, label: "Original of this image" },
    ...earlier.map((s) => ({
      value: `step-${s.id}`,
      label: `Step ${doc.steps.indexOf(s)}: ${s.label}`,
    })),
    ...others.map((d) => ({ value: d.id, label: d.name })),
  ];
  const chosen = otherDoc ? referenceId : step ? referenceId : ORIGINAL;
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text-secondary">Reference</span>
        <Select
          label="Reference"
          size="sm"
          value={chosen}
          onChange={(value) => setReferenceId(String(value))}
          options={options}
          className="w-44"
        />
      </div>
      {selection ? (
        <Switch label="Only inside the selection" checked={inside} onChange={setInside} />
      ) : null}
      {fits && !measured ? (
        <p className="text-text-secondary" role="status">
          Measuring.
        </p>
      ) : null}
      {measured?.error ? <p className="text-danger">{measured.error}</p> : null}
      {metrics ? (
        <table className="tabular w-full border-collapse" aria-label="Quality metrics">
          <tbody>
            {ROWS.map((row) => {
              const value = metrics[row.key];
              const text = format(value, row.digits, row.unit, row.key === "psnr");
              return (
                <tr key={row.key} className="border-t border-border-subtle align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    {row.label}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-mono">{text}</td>
                  <td className="py-1.5 text-text-secondary">{row.help}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : fits ? null : (
        <p className="text-text-secondary">
          The reference has another size. Choose an image of {doc.current.width} x{" "}
          {doc.current.height} px.
        </p>
      )}
      <StepTable doc={doc} reference={reference} mask={mask} />
      <p className="text-text-muted">
        Inside the selection, a pixel counts when it is at least half selected. The metrics compare
        red, green and blue and leave out alpha. SSIM uses a Gaussian window with sigma 1.5, as
        scikit-image does. Add noise, run a filter, and compare with the original to measure the
        repair.
      </p>
    </div>
  );
}
