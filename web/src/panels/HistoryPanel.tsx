import { clsx } from "clsx";
import { Info, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Fragment, useState } from "react";

import { runCommand } from "@/app/commands";
import { displayShortcut } from "@/app/shortcuts";
import { entryParams } from "@/catalog/params";
import { filterById } from "@/app/filterActions";
import { deleteHistoryStep } from "@/app/historyActions";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  activeDocument,
  canRedo,
  canUndo,
  historyBytes,
  useDocuments,
  type HistoryStep,
  type ImageDocument,
} from "@/state/documents";
import { useSettings } from "@/state/settings";
import { Thumbnail } from "@/panels/Thumbnail";
import { announce } from "@/state/notifications";
import { AI_RESULT_LABEL, isAiStep } from "@/app/aiLabel";

const time = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const MB = 1024 * 1024;

const SCOPE_TEXT: Record<string, string> = {
  selection: "Inside the selection",
  inverse: "Outside the selection",
};

/** The values and scope of a filter step, by the parameter labels of the catalog. */
function StepDetails({ step }: { step: HistoryStep }) {
  const entry = step.filter ? filterById(step.filter.id) : null;
  const params = entry && step.filter ? entryParams(entry) : [];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-8 pb-1.5 text-2xs text-text-secondary">
      <dt className="text-text-muted">Time</dt>
      <dd>{new Date(step.at).toLocaleString("en-US")}</dd>
      <dt className="text-text-muted">Size</dt>
      <dd>
        {step.image.width} x {step.image.height} px
      </dd>
      {step.filter ? (
        <>
          <dt className="text-text-muted">Filter</dt>
          <dd>{entry?.name ?? step.filter.id}</dd>
          <dt className="text-text-muted">Where</dt>
          <dd>{SCOPE_TEXT[step.filter.scope ?? ""] ?? "Whole image"}</dd>
          {params.map((p) => {
            const value = step.filter?.params[p.key];
            if (value === undefined) return null;
            const option = p.options?.find((o) => o.value === value);
            return (
              <Fragment key={p.key}>
                <dt className="text-text-muted">{p.label}</dt>
                <dd className="break-words">
                  {option?.label ?? String(value)}
                  {p.unit && typeof value === "number" ? ` ${p.unit}` : ""}
                </dd>
              </Fragment>
            );
          })}
        </>
      ) : null}
      {isAiStep(step) ? (
        <>
          <dt className="text-text-muted">Note</dt>
          <dd>{AI_RESULT_LABEL}</dd>
        </>
      ) : null}
    </dl>
  );
}

/** How much memory the history holds, against the limit, with a way to free it. */
function MemoryLine({ doc }: { doc: ImageDocument }) {
  const purge = useDocuments((s) => s.purgeHistory);
  const history = useSettings((s) => s.history);
  const used = historyBytes(doc.steps) / MB;
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1 text-2xs text-text-muted">
      <span className="tabular">
        Memory {used.toFixed(0)} of {history.megabytes} MB, {doc.steps.length - 1} of{" "}
        {history.steps} steps
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={doc.steps.length <= 2}
        onClick={() => {
          purge(doc.id);
          announce("Freed memory. The original and the current step are kept.");
        }}
      >
        Free memory
      </Button>
    </div>
  );
}

/**
 * Every step of the active image, with a thumbnail. Click a step to go back or forward to it.
 * Details show its values, scope and time. Delete removes a step and recomputes the later ones.
 */
export function HistoryPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const jumpTo = useDocuments((s) => s.jumpTo);
  const [open, setOpen] = useState<string | number | null>(null);
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
      <MemoryLine doc={doc} />
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
          const showing = open === step.id;
          return (
            <li key={step.id} className={clsx("rounded-control", showing && "bg-raised")}>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => {
                    jumpTo(doc.id, index);
                    announce(`Went to step ${index}: ${step.label}.`);
                  }}
                  className={clsx(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1 text-left text-xs",
                    current ? "bg-accent-subtle text-text" : "hover:bg-hover",
                    undone ? "text-text-muted" : "text-text",
                  )}
                >
                  <span className="tabular w-5 shrink-0 text-right text-text-muted">{index}</span>
                  <Thumbnail image={step.image} max={28} label="" />
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
                <IconButton
                  label={`Details of step ${index}`}
                  size="sm"
                  pressed={showing}
                  icon={<Info size={12} />}
                  onClick={() => setOpen(showing ? null : step.id)}
                />
                {index > 0 ? (
                  <IconButton
                    label={`Delete step ${index}`}
                    size="sm"
                    icon={<Trash2 size={12} />}
                    onClick={() => void deleteHistoryStep(doc.id, index)}
                  />
                ) : (
                  <span aria-hidden className="w-6 shrink-0" />
                )}
              </div>
              {showing ? <StepDetails step={step} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
