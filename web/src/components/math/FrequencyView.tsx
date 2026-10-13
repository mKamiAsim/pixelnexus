/**
 * Pictures of a frequency response H(fx, fy): the response as a gray image over the spectrum, and
 * its profile along the fx axis.
 */
import { useEffect, useRef } from "react";

import { Formula } from "./Formula";

/** A size x size grid of values as a gray image. White is the largest of 1 and the values. */
export function ResponseImage({
  size,
  values,
  label,
  displaySize = 130,
}: {
  size: number;
  values: readonly number[];
  label: string;
  displaySize?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = size;
    canvas.height = size;
    const top = Math.max(1, ...values);
    const data = new Uint8ClampedArray(size * size * 4);
    values.forEach((v, i) => {
      const g = Math.round((Math.max(0, v) / top) * 255);
      data.set([g, g, g, 255], i * 4);
    });
    context.putImageData(new ImageData(data, size, size), 0, 0);
  }, [size, values]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="border border-border"
      style={{ width: displaySize, height: displaySize }}
    />
  );
}

/** A response along the fx axis from 0 to 0.5 cycles per pixel. */
export function ProfilePlot({
  profile,
  label = "Response along the fx axis, from 0 to 0.5 cycles per pixel",
}: {
  profile: readonly number[];
  label?: string;
}) {
  const width = 200;
  const height = 100;
  const top = Math.max(1, ...profile);
  const points = profile.map(
    (v, i) =>
      `${(i / Math.max(1, profile.length - 1)) * width},${height - (Math.max(0, v) / top) * height}`,
  );
  return (
    <svg viewBox={`-28 -8 ${width + 40} ${height + 30}`} className="w-60 max-w-full" role="img">
      <title>{label}</title>
      <rect width={width} height={height} fill="var(--px-raised)" stroke="var(--px-border)" />
      {top > 1 ? (
        <line
          x1={0}
          x2={width}
          y1={height - height / top}
          y2={height - height / top}
          stroke="var(--px-border)"
          strokeDasharray="3 3"
        />
      ) : null}
      <polyline points={points.join(" ")} fill="none" stroke="var(--px-accent)" strokeWidth={2} />
      <g fontSize={10} fill="var(--px-text-muted)">
        {[0, 0.25, 0.5].map((f) => (
          <text key={f} x={(f / 0.5) * width} y={height + 14} textAnchor="middle">
            {f}
          </text>
        ))}
        {[0, 1, ...(top > 1 ? [Number(top.toFixed(2))] : [])].map((v) => (
          <text key={v} x={-6} y={height - (v / top) * height + 3} textAnchor="end">
            {v}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function FrequencyView({
  formula,
  size,
  values,
  profile,
  note,
}: {
  formula: string;
  size: number;
  values: readonly number[];
  profile: readonly number[];
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <Formula tex={formula} />
      <div className="flex flex-wrap items-start gap-3">
        <figure className="flex flex-col gap-1">
          <ResponseImage size={size} values={values} label="The response over the spectrum" />
          <figcaption className="max-w-36 text-2xs text-text-muted">
            H over the spectrum. The center is frequency 0, the edges are 0.5 cycles per pixel.
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <ProfilePlot profile={profile} />
          <figcaption className="text-2xs text-text-muted">
            H along the fx axis, in cycles per pixel.
          </figcaption>
        </figure>
      </div>
      <p className="text-text-secondary">{note}</p>
    </div>
  );
}
