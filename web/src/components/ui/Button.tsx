import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "touch";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed border border-transparent",
  secondary: "bg-raised text-text border border-border-control hover:bg-hover active:bg-pressed",
  ghost: "bg-transparent text-text border border-transparent hover:bg-hover active:bg-pressed",
  danger:
    "bg-transparent text-danger border border-border-control hover:bg-hover active:bg-pressed",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-xs gap-1",
  md: "h-7 px-3 text-sm gap-1.5",
  touch: "h-10 px-4 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
