import type { KeyboardEvent, PointerEvent } from "react";

/**
 * A small dial for angle parameters. Drag the handle, or focus the dial and use the arrow
 * keys: one degree per step, fifteen with Shift. Angles turn counterclockwise from the right,
 * as in the filter formulas.
 */
export function AngleDial({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const radians = (value * Math.PI) / 180;
  const r = 11;

  const fromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    let angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
    // A range such as 0 to 180 describes a line, so opposite directions mean the same angle.
    if (max - min <= 180 && angle < min) angle += 180;
    if (angle < 0) angle += 360;
    onChange(clamp(angle));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 15 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(clamp(value + step));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clamp(value - step));
    }
  };

  return (
    <svg
      role="slider"
      tabIndex={0}
      aria-label={`${label} dial`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} degrees`}
      viewBox="-14 -14 28 28"
      className="size-7 shrink-0 cursor-pointer touch-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-focus"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
      }}
      onKeyDown={onKeyDown}
    >
      <circle r={r + 1} fill="var(--px-raised)" stroke="var(--px-border-control)" />
      <line
        x1={0}
        y1={0}
        x2={r * Math.cos(radians)}
        y2={-r * Math.sin(radians)}
        stroke="var(--px-accent)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle r={1.8} fill="var(--px-text-secondary)" />
    </svg>
  );
}
