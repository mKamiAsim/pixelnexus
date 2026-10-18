import { clsx } from "clsx";
import type { ReactNode } from "react";

import { Tooltip } from "./Tooltip";

/**
 * A button in the tool strip. A small corner mark shows that more tools share this slot,
 * as in Photoshop. Press and hold or right-click opens them (Phase 2 shell).
 */
export function ToolButton({
  label,
  icon,
  shortcut,
  active = false,
  hasMore = false,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  active?: boolean;
  hasMore?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onSelect}
        className={clsx(
          "relative inline-flex size-8 items-center justify-center rounded-control text-text-secondary",
          "hover:bg-hover hover:text-text",
          active && "bg-accent-subtle text-accent-fg hover:bg-accent-subtle hover:text-accent-fg",
        )}
      >
        {icon}
        {hasMore ? (
          <svg
            aria-hidden
            width="4"
            height="4"
            viewBox="0 0 4 4"
            className="absolute right-[3px] bottom-[3px] opacity-60"
          >
            <path d="M4 0V4H0Z" fill="currentColor" />
          </svg>
        ) : null}
      </button>
    </Tooltip>
  );
}
