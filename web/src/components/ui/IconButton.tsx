import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name. Also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  shortcut?: string;
  /** For toggle buttons. Sets aria-pressed. */
  pressed?: boolean;
  size?: "sm" | "md" | "touch";
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

const SIZES = { sm: "size-6", md: "size-7", touch: "size-10" } as const;

export function IconButton({
  label,
  icon,
  shortcut,
  pressed,
  size = "md",
  tooltipSide,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={clsx(
          "inline-flex shrink-0 items-center justify-center rounded-control text-text-secondary select-none",
          "hover:bg-hover hover:text-text active:bg-pressed disabled:pointer-events-none disabled:opacity-40",
          pressed && "bg-accent-subtle text-accent-fg hover:bg-accent-subtle hover:text-accent-fg",
          SIZES[size],
          className,
        )}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
