/**
 * The Morphology stepper: the values under the structuring element at the probe, the smallest
 * or largest of them, and the result of the real filter at the same pixel.
 */
import { clsx } from "clsx";

import { borderIndex } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { borderOf } from "@/core/filters/run";

import { channelOf, engineValueAt, round, valueAt } from "./common";
import { Stepper, type WidgetProps } from "./widgets";

/** Elements wider or taller than this are described, not drawn. */
const MAX_SHOWN = 15;

export function MorphologyStepper({ filterId, values, image, point, onMove }: WidgetProps) {
  const representation = browserFilter(filterId)?.representation(values);
  if (representation?.kind !== "morphology") {
    return <p className="text-text-secondary">This filter has no structuring element.</p>;
  }
  const { element, anchor, statistic } = representation;
  const border = borderOf(values);
  const channel = channelOf(values);
  const cells = element.map((row, j) =>
    row.map((inside, i) => {
      const sx = borderIndex(point.x + i - anchor.x, image.width, border);
      const sy = borderIndex(point.y + j - anchor.y, image.height, border);
      const v = sx < 0 || sy < 0 ? 0 : Math.round(valueAt(image, sx, sy, channel));
      return { inside: inside === 1, v };
    }),
  );
  const under = cells
    .flat()
    .filter((c) => c.inside)
    .map((c) => c.v);
  const low = Math.min(...under);
  const high = Math.max(...under);
  const result = engineValueAt(filterId, values, image, point);
  const iterations = Number(values.iterations ?? 1);
  const marked = (v: number) =>
    (statistic === "min" && v === low) ||
    (statistic === "max" && v === high) ||
    (statistic === "range" && (v === low || v === high));
  const width = element[0]?.length ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <Stepper point={point} image={image} onMove={onMove} />
      {width <= MAX_SHOWN && element.length <= MAX_SHOWN ? (
        <table
          aria-label="Values under the element"
          className="tabular w-max border-collapse font-mono text-2xs"
        >
          <tbody>
            {cells.map((row, j) => (
              <tr key={j}>
                {row.map((cell, i) => (
                  <td
                    key={i}
                    aria-current={cell.inside && marked(cell.v) ? "true" : undefined}
                    className={clsx(
                      "border border-border-subtle px-1 text-right",
                      !cell.inside && "text-text-disabled",
                      cell.inside && marked(cell.v) && "bg-accent text-on-accent",
                      i === anchor.x &&
                        j === anchor.y &&
                        "outline outline-1 outline-text-secondary",
                    )}
                  >
                    {cell.v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-text-secondary">
          The element is {width} x {element.length}, too large to draw here.
        </p>
      )}
      <p>
        Under the element, the smallest value is <strong className="tabular">{low}</strong> and the
        largest is <strong className="tabular">{high}</strong>. Gray values lie outside the element.{" "}
        {statistic === "min"
          ? "Erosion keeps the smallest."
          : statistic === "max"
            ? "Dilation keeps the largest, under the element turned by 180 degrees."
            : statistic === "range"
              ? `The gradient is their difference, ${high - low}.`
              : ""}{" "}
        The filter gives <strong className="tabular">{round(result, 2)}</strong> here
        {iterations > 1 ? `, after ${iterations} iterations, which can differ from one step` : ""}.
      </p>
    </div>
  );
}
