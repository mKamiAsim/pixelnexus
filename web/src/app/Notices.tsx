import { clsx } from "clsx";
import { AlertTriangle, CircleCheck, CircleX, Info, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useNotices, type Notice, type NoticeTone } from "@/state/notifications";

const ICONS: Record<NoticeTone, ReactNode> = {
  info: <Info size={15} className="text-accent-fg" />,
  success: <CircleCheck size={15} className="text-success" />,
  warning: <AlertTriangle size={15} className="text-warning" />,
  error: <CircleX size={15} className="text-danger" />,
};

/** How long a notice stays, in milliseconds. Problems stay longer so there is time to read. */
const DURATION: Record<NoticeTone, number> = {
  info: 5000,
  success: 4000,
  warning: 10000,
  error: 12000,
};

function Toast({ notice }: { notice: Notice }) {
  const dismiss = useNotices((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notice.id), DURATION[notice.tone]);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);
  return (
    <li
      className={clsx(
        "pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-panel border bg-overlay p-3 text-sm shadow-popover",
        notice.tone === "error" ? "border-danger/50" : "border-border",
      )}
    >
      <span aria-hidden className="mt-px shrink-0">
        {ICONS[notice.tone]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium break-words text-text">{notice.title}</span>
        {notice.detail ? (
          <span className="text-xs break-words text-text-secondary">{notice.detail}</span>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={() => dismiss(notice.id)}
        className="-m-1 shrink-0 rounded-[3px] p-1 text-text-muted hover:bg-hover hover:text-text"
      >
        <X size={13} />
      </button>
    </li>
  );
}

/**
 * Toasts for the eyes and live regions for screen readers. Errors use an assertive region, so
 * they are read at once. Everything else waits for a pause.
 */
export function Notices() {
  const notices = useNotices((s) => s.notices);
  const announcement = useNotices((s) => s.announcement);
  return (
    <>
      <ol
        aria-label="Messages"
        className="pointer-events-none fixed right-4 bottom-10 z-40 flex flex-col items-end gap-2"
      >
        {notices.map((notice) => (
          <Toast key={notice.id} notice={notice} />
        ))}
      </ol>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
        {announcement && !announcement.urgent ? announcement.text : ""}
      </div>
      <div
        className="sr-only"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="announcer-urgent"
      >
        {announcement?.urgent ? announcement.text : ""}
      </div>
    </>
  );
}
