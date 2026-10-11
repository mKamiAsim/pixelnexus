import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

import { Kbd } from "./Kbd";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/** A short label shown on hover and on keyboard focus. */
export function Tooltip({ content, shortcut, side = "bottom", children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-w-64 items-center gap-2 rounded-control bg-overlay px-2 py-1 text-xs text-text shadow-popover"
        >
          <span>{content}</span>
          {shortcut ? <Kbd keys={shortcut} /> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
