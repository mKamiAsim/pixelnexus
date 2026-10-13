import { clsx } from "clsx";

import type { KernelInfo, Representation } from "@/core/filters/types";

import { Formula } from "./Formula";
import { flipKernel } from "./kernels";
import { KernelGrid } from "./KernelGrid";

/** The largest kernel side drawn as a grid. Larger kernels show their center. */
const MAX_GRID = 15;

function centerCrop(kernel: KernelInfo): {
  rows: number[][];
  anchor: { x: number; y: number };
  cropped: boolean;
} {
  const size = kernel.rows.length;
  if (size <= MAX_GRID) {
    return { rows: kernel.rows.map((r) => [...r]), anchor: kernel.anchor, cropped: false };
  }
  const start = kernel.anchor.y - (MAX_GRID >> 1);
  const startX = kernel.anchor.x - (MAX_GRID >> 1);
  return {
    rows: kernel.rows.slice(start, start + MAX_GRID).map((r) => r.slice(startX, startX + MAX_GRID)),
    anchor: { x: MAX_GRID >> 1, y: MAX_GRID >> 1 },
    cropped: true,
  };
}

function KernelBlock({ kernel, convolution }: { kernel: KernelInfo; convolution: boolean }) {
  const shown = convolution ? { ...kernel, rows: flipKernel(kernel.rows) } : kernel;
  const { rows, anchor, cropped } = centerCrop(shown);
  const size = kernel.rows.length;
  const integer = kernel.rows.flat().every((v) => Number.isInteger(v * (kernel.divisor ?? 1)));
  const digits = integer && !kernel.divisor ? 0 : 4;
  const sum = kernel.rows.flat().reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-2">
      <Formula tex={`${kernel.name}${convolution ? "^{\\text{flipped}}" : ""}`} display={false} />
      <div className="overflow-x-auto">
        <KernelGrid
          rows={kernel.divisor ? rows.map((r) => r.map((v) => v * (kernel.divisor ?? 1))) : rows}
          digits={kernel.divisor ? 0 : digits}
          anchor={anchor}
          caption={kernel.name.replace(/[\\{}^_]/g, "")}
        />
      </div>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-text-muted">Size</dt>
        <dd>
          {size}x{kernel.rows[0]?.length ?? 0}
          {cropped ? `, showing the center ${MAX_GRID}x${MAX_GRID}` : ""}
        </dd>
        {kernel.divisor ? (
          <>
            <dt className="text-text-muted">Divisor</dt>
            <dd>Each shown number is divided by {kernel.divisor}.</dd>
          </>
        ) : null}
        <dt className="text-text-muted">Sum of weights</dt>
        <dd>{Number(sum.toFixed(10))}</dd>
        <dt className="text-text-muted">Anchor</dt>
        <dd>
          Row {kernel.anchor.y + 1}, column {kernel.anchor.x + 1} (outlined)
        </dd>
        <dt className="text-text-muted">Normalized</dt>
        <dd>{kernel.normalized ? "Yes, the weights add up to 1." : "No."}</dd>
        <dt className="text-text-muted">Offset</dt>
        <dd>0. Nothing is added after the weighted sum.</dd>
      </dl>
      {kernel.separable ? (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-text-muted">Separable: column factor times row factor</span>
          <Formula
            tex={`${kernel.name} = \\begin{bmatrix} ${kernel.separable.column.map((v) => Number(v.toFixed(4))).join(" \\\\ ")} \\end{bmatrix} \\begin{bmatrix} ${kernel.separable.row.map((v) => Number(v.toFixed(4))).join(" & ")} \\end{bmatrix}`}
          />
        </div>
      ) : null}
      {kernel.note ? <p className="text-xs text-text-secondary">{kernel.note}</p> : null}
    </div>
  );
}

function CurvePlot({ values }: { values: readonly number[] }) {
  const size = 160;
  const points = values.map(
    (v, i) => `${(i / 255) * size},${size - (Math.min(255, Math.max(0, v)) / 255) * size}`,
  );
  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`-28 -8 ${size + 40} ${size + 30}`}
        className="w-56 max-w-full"
        role="img"
        aria-label="Transfer curve from input value 0 to 255 on the horizontal axis to output value on the vertical axis"
      >
        <rect
          x={0}
          y={0}
          width={size}
          height={size}
          fill="var(--px-raised)"
          stroke="var(--px-border)"
        />
        <line x1={0} y1={size} x2={size} y2={0} stroke="var(--px-border)" strokeDasharray="3 3" />
        <polyline points={points.join(" ")} fill="none" stroke="var(--px-accent)" strokeWidth={2} />
        {[0, 128, 255].map((v) => (
          <g key={v} fontSize={10} fill="var(--px-text-muted)">
            <text x={(v / 255) * size} y={size + 14} textAnchor="middle">
              {v}
            </text>
            <text x={-6} y={size - (v / 255) * size + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-2xs text-text-muted">
        Input on the horizontal axis, output on the vertical axis. The dashed line changes nothing.
      </figcaption>
    </figure>
  );
}

function WindowCells({ size }: { size: number }) {
  const cells = Math.min(size, 9);
  return (
    <div
      aria-hidden
      className="grid w-max gap-px rounded-control border border-border bg-border p-px"
      style={{ gridTemplateColumns: `repeat(${cells}, 16px)` }}
    >
      {Array.from({ length: cells * cells }, (_, i) => (
        <span
          key={i}
          className={i === (cells * cells - 1) / 2 ? "size-4 bg-accent" : "size-4 bg-raised"}
        />
      ))}
    </div>
  );
}

function RankWindow({
  size,
  rank,
  rankTo,
  count,
  note,
}: {
  size: number;
  rank: number;
  rankTo?: number;
  count: number;
  note?: string;
}) {
  const range = rankTo !== undefined && rankTo !== rank;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <WindowCells size={size} />
      <p className="text-text-secondary">
        A {size}x{size} window holds {count} values. They are sorted, and{" "}
        {range
          ? `the values at positions ${rank} to ${rankTo} of ${count} make the output.`
          : `the value at position ${rank} of ${count} becomes the output.`}{" "}
        The highlighted cell is the pixel being computed.
        {size > 9 ? " The drawing shows a 9x9 part of the window." : ""}
      </p>
      {note ? <p className="text-text-secondary">{note}</p> : null}
    </div>
  );
}

function StatisticWindow({
  size,
  count,
  statistic,
  note,
  weights,
}: {
  size: number;
  count: number;
  statistic: string;
  note: string;
  weights?: readonly (readonly number[])[];
}) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      {weights ? (
        <div className="overflow-x-auto">
          <KernelGrid
            rows={weights.map((row) => [...row])}
            digits={weights.flat().every(Number.isInteger) ? 0 : 3}
            anchor={{ x: (weights[0]?.length ?? 1) >> 1, y: weights.length >> 1 }}
            caption="Weights"
          />
        </div>
      ) : (
        <WindowCells size={size} />
      )}
      <Formula tex={`I_{\\text{out}} = ${statistic}`} />
      <p className="text-text-secondary">
        The window holds {count} values. {note}
        {!weights && size > 9 ? " The drawing shows a 9x9 part of the window." : ""}
      </p>
    </div>
  );
}

/** A structuring element as a grid: filled cells belong to it, and the anchor is outlined. */
export function ElementGrid({
  element,
  anchor,
}: {
  element: readonly (readonly number[])[];
  anchor: { x: number; y: number };
}) {
  const width = element[0]?.length ?? 0;
  const count = element.flat().filter(Boolean).length;
  return (
    <figure className="flex flex-col gap-1">
      <div
        role="img"
        aria-label={`Structuring element, ${width} by ${element.length}, ${count} pixels`}
        className="grid w-max gap-px rounded-control border border-border bg-border p-px"
        style={{ gridTemplateColumns: `repeat(${width}, ${width > 15 ? 8 : 14}px)` }}
      >
        {element.flatMap((row, j) =>
          row.map((v, i) => (
            <span
              key={`${i},${j}`}
              className={clsx(
                "aspect-square",
                v ? "bg-accent" : "bg-panel",
                i === anchor.x &&
                  j === anchor.y &&
                  "outline outline-2 -outline-offset-2 outline-text-secondary",
              )}
            />
          )),
        )}
      </div>
      <figcaption className="text-text-muted">
        {width} x {element.length} element with {count} pixels. The outlined cell is the anchor.
      </figcaption>
    </figure>
  );
}

/** The operator of a filter, drawn from its representation. */
export function OperatorView({
  representation,
  convolution,
}: {
  representation: Representation;
  convolution: boolean;
}) {
  switch (representation.kind) {
    case "kernels":
      return (
        <div className="flex flex-col gap-5">
          {representation.kernels.map((kernel) => (
            <KernelBlock key={kernel.name} kernel={kernel} convolution={convolution} />
          ))}
        </div>
      );
    case "rank":
      return (
        <RankWindow
          size={representation.size}
          rank={representation.rank}
          count={representation.count}
          {...(representation.rankTo !== undefined ? { rankTo: representation.rankTo } : {})}
          {...(representation.note !== undefined ? { note: representation.note } : {})}
        />
      );
    case "window":
      return (
        <StatisticWindow
          size={representation.size}
          count={representation.count}
          statistic={representation.statistic}
          note={representation.note}
          {...(representation.weights ? { weights: representation.weights } : {})}
        />
      );
    case "curve":
      return <CurvePlot values={representation.values} />;
    case "weights":
      return (
        <div className="flex flex-col gap-2 text-xs">
          <table className="tabular w-max border-collapse">
            <caption className="pb-1 text-left text-text-muted">Channel weights</caption>
            <tbody>
              {representation.weights.map((w) => (
                <tr key={w.name} className="border-t border-border-subtle">
                  <th scope="row" className="py-1 pr-4 text-left font-normal">
                    <Formula tex={w.name} display={false} />
                  </th>
                  <td className="py-1 font-mono">{w.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-text-secondary">
            Applied to{" "}
            {representation.space === "linear"
              ? "linear light values, decoded from sRGB"
              : "the stored sRGB values"}
            .
          </p>
        </div>
      );
    case "iterative":
      return (
        <div className="flex flex-col gap-2 text-xs">
          <Formula tex={representation.update} />
          <p className="text-text-secondary">
            The step runs {representation.iterations} times. {representation.note}
          </p>
        </div>
      );
    case "generator":
      return <p className="text-xs text-text-secondary">{representation.description}</p>;
    case "morphology":
      return (
        <div className="flex flex-col gap-2 text-xs">
          <ElementGrid element={representation.element} anchor={representation.anchor} />
          <Formula tex={representation.operation} />
          {representation.note ? (
            <p className="text-text-secondary">{representation.note}</p>
          ) : null}
        </div>
      );
    case "stages":
      return (
        <div className="flex flex-col gap-2 text-xs">
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            {representation.stages.map((stage) => (
              <li key={stage.name}>
                <span className="font-medium">{stage.name}</span>
                <Formula tex={stage.formula} />
                {stage.note ? <p className="text-text-secondary">{stage.note}</p> : null}
              </li>
            ))}
          </ol>
          {representation.note ? (
            <p className="text-text-secondary">{representation.note}</p>
          ) : null}
        </div>
      );
  }
}
