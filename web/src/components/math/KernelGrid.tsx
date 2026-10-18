import { clsx } from "clsx";

export interface KernelGridProps {
  rows: readonly (readonly number[])[];
  /** Decimals to show. */
  digits?: number;
  /** Anchor cell, usually the center. */
  anchor?: { x: number; y: number };
  caption?: string;
}

/**
 * A kernel as a grid of numbers with a heat tint. Positive weights are tinted amber and negative
 * weights blue, with strength by size. The numbers always carry the meaning; the tint only helps.
 */
export function KernelGrid({ rows, digits = 3, anchor, caption }: KernelGridProps) {
  const size = rows.length;
  const width = rows[0]?.length ?? 0;
  const center = anchor ?? { x: Math.floor(width / 2), y: Math.floor(size / 2) };
  const maxAbs = Math.max(1e-12, ...rows.flat().map((v) => Math.abs(v)));
  const sum = rows.flat().reduce((a, b) => a + b, 0);

  return (
    <figure className="flex flex-col gap-1.5">
      <div
        role="table"
        aria-label={caption ?? "Kernel"}
        className="inline-grid w-max gap-px rounded-control border border-border bg-border p-px"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(44px, auto))` }}
      >
        {rows.map((row, y) =>
          row.map((value, x) => {
            const strength = Math.abs(value) / maxAbs;
            const channel = value < 0 ? "--px-heat-negative" : "--px-heat-positive";
            return (
              <div
                key={`${x}-${y}`}
                role="cell"
                className={clsx(
                  "tabular px-1.5 py-1 text-right font-mono text-xs text-text",
                  x === center.x &&
                    y === center.y &&
                    "outline outline-1 -outline-offset-2 outline-text-secondary",
                )}
                style={{
                  backgroundColor: `color-mix(in srgb, rgb(var(${channel})) ${Math.round(strength * 45)}%, var(--px-raised))`,
                }}
              >
                {value.toFixed(digits)}
              </div>
            );
          }),
        )}
      </div>
      <figcaption className="text-2xs text-text-muted">
        {caption ? `${caption}. ` : ""}
        {width}x{size}, sum {sum.toFixed(digits)}. Outlined cell is the anchor.
      </figcaption>
    </figure>
  );
}
