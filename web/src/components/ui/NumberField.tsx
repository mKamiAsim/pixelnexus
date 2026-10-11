import { clsx } from "clsx";
import { useState, type KeyboardEvent } from "react";

import { formatNumber, normalizeNumber, parseNumber, stepNumber, type NumberRules } from "./number";

export interface NumberFieldProps extends NumberRules {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name, used when there is no visible label element. */
  label: string;
  unit?: string;
  id?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "touch";
  className?: string;
}

const SIZES = { sm: "h-6 text-xs", md: "h-7 text-sm", touch: "h-10 text-base" } as const;

/**
 * Exact numeric input. Arrow keys change the value by one step, Shift by ten steps.
 * Enter or leaving the field applies the value. Escape restores the last good value.
 */
export function NumberField({
  value,
  onChange,
  label,
  unit,
  id,
  disabled,
  size = "md",
  className,
  ...rules
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value, rules);

  const commit = () => {
    if (draft === null) return;
    const next = normalizeNumber(parseNumber(draft), rules);
    setDraft(null);
    if (next !== null && next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    else if (event.key === "Escape") setDraft(null);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setDraft(null);
      onChange(stepNumber(value, event.key === "ArrowUp" ? 1 : -1, rules, event.shiftKey));
    }
  };

  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-control border border-border-control bg-raised focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus",
        disabled && "opacity-40",
        SIZES[size],
        className,
      )}
    >
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onFocus={(event) => event.target.select()}
        className="tabular w-full min-w-0 bg-transparent px-1.5 text-right font-mono text-text outline-none"
      />
      {unit ? <span className="pr-1.5 text-xs text-text-muted">{unit}</span> : null}
    </div>
  );
}
