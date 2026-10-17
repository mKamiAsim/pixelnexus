import { clsx } from "clsx";
import { Redo2, RotateCcw, Undo2 } from "lucide-react";

import { runCommand } from "@/app/commands";
import { displayShortcut } from "@/app/shortcuts";
import { IconButton } from "@/components/ui/IconButton";
import { activeDocument, canRedo, canUndo, useDocuments } from "@/state/documents";
import { announce } from "@/state/notifications";
import { AI_RESULT_LABEL, isAiStep } from "@/app/aiLabel";

const time = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Every step of the active image. Click a step to go back or forward to it. */
export function HistoryPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const jumpTo = useDocuments((s) => s.jumpTo);
  if (!doc)
    return <p className="p-3 text-sm text-text-secondary">Open an image to see its history.</p>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-0.5 border-b border-border-subtle px-2 py-1">
        <IconButton
          label="Undo"
          shortcut={displayShortcut("Mod+Z")}
          icon={<Undo2 size={14} />}
          size="sm"
          disabled={!canUndo(doc)}
          onClick={() => runCommand("edit.undo")}
        />
        <IconButton
          label="Redo"
          shortcut={displayShortcut("Mod+Shift+Z")}
          icon={<Redo2 size={14} />}
          size="sm"
          disabled={!canRedo(doc)}
          onClick={() => runCommand("edit.redo")}
        />
        <IconButton
          label="Revert to original"
          icon={<RotateCcw size={14} />}
          size="sm"
          disabled={doc.current === doc.original}
          onClick={() => runCommand("edit.revert")}
        />
        <span className="ml-auto text-2xs text-text-muted">
          Step {doc.index} of {doc.steps.length - 1}
        </span>
      </div>
      <ol aria-label="History steps" className="min-h-0 flex-1 overflow-auto p-1">
        {doc.dropped > 0 ? (
          <li className="px-2 py-1 text-2xs text-text-muted">
            {doc.dropped} older {doc.dropped === 1 ? "step was" : "steps were"} dropped to save
            memory.
          </li>
        ) : null}
        {doc.steps.map((step, index) => {
          const current = index === doc.index;
          const undone = index > doc.index;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => {
                  jumpTo(doc.id, index);
                  announce(`Went to step ${index}: ${step.label}.`);
                }}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-xs",
                  current ? "bg-accent-subtle text-text" : "hover:bg-hover",
                  undone ? "text-text-muted" : "text-text",
                )}
              >
                <span className="tabular w-5 shrink-0 text-right text-text-muted">{index}</span>
                <span
                  className={clsx(
                    "min-w-0 flex-1 truncate",
                    undone && "line-through decoration-text-muted",
                  )}
                >
                  {step.label}
                </span>
                {isAiStep(step) ? (
                  <span
                    title={AI_RESULT_LABEL}
                    className="shrink-0 rounded-control border border-warning px-1 text-2xs text-warning"
                  >
                    AI<span className="sr-only">. {AI_RESULT_LABEL}</span>
                  </span>
                ) : null}
                <span className="tabular shrink-0 text-2xs text-text-muted">{time(step.at)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
