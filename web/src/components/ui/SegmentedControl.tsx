import { clsx } from "clsx";
import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";

import { Tooltip } from "./Tooltip";

export interface Segment {
  value: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
}

/** A row of mutually exclusive choices, such as the selection modes New, Add, Subtract, Intersect. */
export function SegmentedControl({
  label,
  value,
  onChange,
  segments,
  iconOnly = false,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  segments: readonly Segment[];
  iconOnly?: boolean;
  /** Stretch to the parent width and share it equally between segments. */
  fullWidth?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => next && onChange(next)}
      className={clsx(
        "inline-flex h-7 items-center rounded-control border border-border-control bg-raised p-0.5",
        fullWidth ? "w-full" : "w-max self-start",
      )}
    >
      {segments.map((segment) => {
        const item = (
          <ToggleGroup.Item
            key={segment.value}
            value={segment.value}
            aria-label={segment.label}
            className={clsx(
              "inline-flex h-full items-center gap-1 rounded-[3px] px-2 text-xs text-text-secondary hover:text-text",
              "aria-checked:bg-accent aria-checked:text-on-accent",
              iconOnly && "w-7 justify-center px-0",
              fullWidth && "flex-1 justify-center",
            )}
          >
            {segment.icon}
            {iconOnly ? null : segment.label}
          </ToggleGroup.Item>
        );
        return iconOnly ? (
          <Tooltip key={segment.value} content={segment.label} shortcut={segment.shortcut}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}
