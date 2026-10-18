import { clsx } from "clsx";
import { Ban, CircleCheck, CircleDashed, CircleDot, Package } from "lucide-react";
import type { ReactNode } from "react";

import type { Status } from "@/catalog";
import { STATUS_LABELS } from "@/catalog";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "optional";

const TONES: Record<BadgeTone, string> = {
  neutral: "text-text-secondary border-border",
  accent: "text-accent-fg border-accent-fg/40",
  success: "text-success border-success/40",
  warning: "text-warning border-warning/40",
  danger: "text-danger border-danger/40",
  optional: "text-optional border-optional/40",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  title,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex h-[18px] items-center gap-1 rounded-[3px] border px-1.5 text-2xs font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const STATUS_STYLE: Record<Status, { tone: BadgeTone; short: string; icon: ReactNode }> = {
  "implemented-tested": { tone: "success", short: "Tested", icon: <CircleCheck size={11} /> },
  "implemented-untested": { tone: "warning", short: "Untested", icon: <CircleDot size={11} /> },
  partial: { tone: "warning", short: "Partial", icon: <CircleDot size={11} /> },
  "optional-dependency": { tone: "optional", short: "Optional", icon: <Package size={11} /> },
  "optional-model": { tone: "optional", short: "AI model", icon: <Package size={11} /> },
  planned: { tone: "neutral", short: "Planned", icon: <CircleDashed size={11} /> },
  unsupported: { tone: "danger", short: "Unsupported", icon: <Ban size={11} /> },
};

/**
 * Catalog status as a badge. The icon and the word carry the meaning, not the color alone.
 * Tested filters show no badge: every filter that runs is tested, so the badge says nothing.
 */
export function StatusBadge({ status }: { status: Status }) {
  if (status === "implemented-tested") return null;
  const style = STATUS_STYLE[status];
  return (
    <Badge tone={style.tone} icon={style.icon} title={STATUS_LABELS[status]}>
      {style.short}
    </Badge>
  );
}
