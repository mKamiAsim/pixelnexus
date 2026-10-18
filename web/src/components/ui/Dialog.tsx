import { clsx } from "clsx";
import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";

/**
 * Where the focus goes when a dialog closes and the element that opened it is gone, as with a
 * menu item: the image canvas, or else the menu bar.
 */
function focusFallback(): void {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    // Two queries, since one selector list would return the menu bar, which comes first.
    const target =
      document.querySelector<HTMLElement>('canvas[tabindex="0"]') ??
      document.querySelector<HTMLElement>('[role="menubar"] button');
    target?.focus({ preventScroll: true });
  });
}

/** A modal dialog with a title, an optional description and a close button. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  hideHeader = false,
  focusField = false,
  scrollableText = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Keep the title for screen readers only, for example in the command palette. */
  hideHeader?: boolean;
  /** Focus the first text or number field on open, instead of the first button. */
  focusField?: boolean;
  /** The body holds only text that may scroll. It becomes a tab stop, so keys can scroll it. */
  scrollableText?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <RadixDialog.Content
          onCloseAutoFocus={focusFallback}
          onOpenAutoFocus={(event) => {
            if (!focusField || !(event.target instanceof HTMLElement)) return;
            const field = event.target.querySelector<HTMLInputElement>(
              "input:not([type=hidden]):not([type=checkbox]):not([disabled])",
            );
            if (!field) return;
            event.preventDefault();
            field.focus();
            field.select();
          }}
          className={clsx(
            "fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-panel border border-border bg-panel text-text shadow-popover outline-none",
            className,
          )}
        >
          {hideHeader ? (
            <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          ) : (
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="text-xs text-text-secondary">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <RadixDialog.Close
                aria-label="Close"
                className="-mr-1 rounded-control p-1 text-text-muted hover:bg-hover hover:text-text"
              >
                <X size={15} />
              </RadixDialog.Close>
            </div>
          )}
          {hideHeader || !description ? (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          ) : null}
          <div
            className="min-h-0 flex-1 overflow-auto"
            {...(scrollableText ? { tabIndex: 0, role: "region", "aria-label": title } : {})}
          >
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
