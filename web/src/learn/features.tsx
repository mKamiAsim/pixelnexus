/**
 * The Feature viewer: run a feature detector in the engine on the patch around the probe, and
 * draw what it finds on the patch, with the strongest features in a small table.
 */
import { useMemo } from "react";

import { featurePoints, hasPoints } from "@/core/features/table";

import { patchAt } from "./common";
import { useEngineResults } from "./engine";
import { PixelCanvas, type WidgetProps } from "./widgets";

const PATCH = 128;
const SCALE = 2;
const LISTED = 5;

export function FeatureViewer({ filterId, values, image, point }: WidgetProps) {
  const patch = useMemo(() => patchAt(image, point.x, point.y, PATCH), [image, point.x, point.y]);
  const inputs = useMemo(() => [{ image: patch, values }], [patch, values]);
  const engine = useEngineResults(filterId, inputs, true);
  const table = engine.features?.[0] ?? null;
  const points = table ? featurePoints(table) : [];
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative self-start"
        style={{ width: patch.width * SCALE + 2, height: patch.height * SCALE + 2 }}
      >
        <PixelCanvas
          image={patch}
          scale={SCALE}
          label={table ? `Patch around the probe with ${table.summary}` : "Patch around the probe"}
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-px"
          width={patch.width * SCALE}
          height={patch.height * SCALE}
          fill="none"
        >
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x * SCALE}
              cy={p.y * SCALE}
              r={Math.max(2, (p.radius ?? 0) * SCALE)}
              stroke="#ffd60a"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
      {engine.note ? (
        <p role="status" className="text-text-secondary">
          {engine.note}
        </p>
      ) : null}
      {table && table.rows.length > 0 ? (
        <table className="tabular border-collapse" aria-label="Strongest features in the patch">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} scope="col" className="pr-3 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, LISTED).map((row, i) => (
              <tr key={i} className="border-t border-border-subtle">
                {row.map((value, j) => (
                  <td key={j} className="pr-3 text-right font-mono">
                    {Number.isInteger(value) ? value : Number(value.toPrecision(3))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="text-text-secondary">
        The detector runs in the PixelNexus engine with the current settings on the {PATCH} x{" "}
        {PATCH} patch around the probe.{" "}
        {!table
          ? ""
          : hasPoints(table)
            ? `It finds ${table.summary}. Each circle shows the size of a feature. The table lists the strongest, with x and y counted from the top left of the patch.`
            : `It gives ${table.summary} for the patch. The table lists the first rows.`}
      </p>
    </div>
  );
}
