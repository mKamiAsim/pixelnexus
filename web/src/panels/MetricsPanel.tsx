import { useState } from "react";

import { Select } from "@/components/ui/Select";
import type { RgbaImage } from "@/core/image/types";
import { qualityMetrics, type QualityMetrics } from "@/core/metrics/quality";
import { activeDocument, useDocuments } from "@/state/documents";

const ORIGINAL = "original";

/** Metrics per image pair, so a panel redraw does not compute them again. */
const cache = new WeakMap<RgbaImage, WeakMap<RgbaImage, QualityMetrics>>();
function cachedMetrics(image: RgbaImage, reference: RgbaImage): QualityMetrics {
  let byReference = cache.get(image);
  if (!byReference) {
    byReference = new WeakMap();
    cache.set(image, byReference);
  }
  let metrics = byReference.get(reference);
  if (!metrics) {
    metrics = qualityMetrics(image, reference);
    byReference.set(reference, metrics);
  }
  return metrics;
}

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

/**
 * Quality metrics of the active image against a reference: its own original, or another open
 * image of the same size. Use it to measure how well a filter repairs a noisy test image.
 */
export function MetricsPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const documents = useDocuments((s) => s.documents);
  const [referenceId, setReferenceId] = useState(ORIGINAL);
  const others = doc
    ? documents.filter(
        (d) =>
          d.id !== doc.id &&
          d.current.width === doc.current.width &&
          d.current.height === doc.current.height,
      )
    : [];
  const otherDoc = others.find((d) => d.id === referenceId);
  const current = doc?.current;
  const reference = otherDoc?.current ?? doc?.original;
  const metrics =
    current && reference && reference.width === current.width && reference.height === current.height
      ? cachedMetrics(current, reference)
      : null;

  if (!doc) {
    return <p className="p-3 text-xs text-text-secondary">Open an image to compare it.</p>;
  }
  const options = [
    { value: ORIGINAL, label: "Original of this image" },
    ...others.map((d) => ({ value: d.id, label: d.name })),
  ];
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text-secondary">Reference</span>
        <Select
          label="Reference"
          size="sm"
          value={otherDoc ? referenceId : ORIGINAL}
          onChange={(value) => setReferenceId(String(value))}
          options={options}
          className="w-44"
        />
      </div>
      {metrics ? (
        <table className="tabular w-full border-collapse" aria-label="Quality metrics">
          <tbody>
            {ROWS.map((row) => {
              const value = metrics[row.key];
              const text = Number.isFinite(value)
                ? `${value.toFixed(row.digits)}${row.unit ? ` ${row.unit}` : ""}`
                : row.key === "psnr" && value === Infinity
                  ? "Equal images"
                  : "Too small";
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
      ) : (
        <p className="text-text-secondary">
          The reference has another size. Choose an image of {doc.current.width} x{" "}
          {doc.current.height} px.
        </p>
      )}
      <p className="text-text-muted">
        The metrics compare red, green and blue and leave out alpha. SSIM uses a Gaussian window
        with sigma 1.5, as scikit-image does. Add noise, run a filter, and compare with the original
        to measure the repair.
      </p>
    </div>
  );
}
