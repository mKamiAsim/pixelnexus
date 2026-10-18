import { clsx } from "clsx";
import { Slider } from "radix-ui";
import { useId, useRef, type PointerEvent } from "react";

import { NumberField } from "./NumberField";
import { normalizeNumber, type NumberRules } from "./number";
import { Tooltip } from "./Tooltip";

export interface ScrubSliderProps extends NumberRules {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  unit?: string;
  /** Plain-language help, shown as a tooltip on the label. */
  description?: string;
  disabled?: boolean;
}

/**
 * A parameter control in three parts, like the sliders in Photoshop:
 * drag the label left or right to scrub, drag the track, or type an exact value.
 */
export function ScrubSlider({
  label,
  value,
  onChange,
  unit,
  description,
  disabled,
  ...rules
}: ScrubSliderProps) {
  const id = useId();
  const drag = useRef<{ startX: number; startValue: number } | null>(null);
  const { min, max } = rules;
  const step = rules.oddOnly ? 2 : (rules.step ?? (rules.integer ? 1 : (max - min) / 200));

  const onPointerDown = (event: PointerEvent<HTMLLabelElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startValue: value };
  };
  const onPointerMove = (event: PointerEvent<HTMLLabelElement>) => {
    if (!drag.current) return;
    const pixels = event.clientX - drag.current.startX;
    const factor = event.shiftKey ? 10 : 1;
    const next = normalizeNumber(drag.current.startValue + pixels * step * factor * 0.5, rules);
    if (next !== null && next !== value) onChange(next);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const labelElement = (
    <label
      htmlFor={id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={clsx(
        "cursor-ew-resize truncate text-xs text-text-secondary select-none touch-none",
        "underline decoration-border-control decoration-dotted underline-offset-[3px]",
      )}
    >
      {label}
    </label>
  );

  return (
    <div className={clsx("flex flex-col gap-1", disabled && "pointer-events-none opacity-40")}>
      <div className="flex items-center justify-between gap-2">
        {description ? <Tooltip content={description}>{labelElement}</Tooltip> : labelElement}
        <NumberField
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          unit={unit}
          size="sm"
          className="w-[76px]"
          {...rules}
        />
      </div>
      <Slider.Root
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          const normalized = normalizeNumber(next ?? value, rules);
          if (normalized !== null && normalized !== value) onChange(normalized);
        }}
        className="relative flex h-4 w-full touch-none items-center select-none"
      >
        <Slider.Track className="relative h-[3px] grow rounded-full bg-border">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          className="block size-3 rounded-full border-2 border-accent bg-text shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </Slider.Root>
    </div>
  );
}
