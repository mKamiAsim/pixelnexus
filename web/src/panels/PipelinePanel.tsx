/**
 * The Pipeline panel (PLAN.md Phase 8): a chain of filter steps to run on the original image.
 * Steps can be turned on and off, reordered by dragging or with the arrow buttons, edited, and
 * saved or loaded as JSON.
 */
import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  GripVertical,
  History,
  Play,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { entryParams } from "@/catalog/params";
import {
  addSelectedFilter,
  cancelPipeline,
  describeStep,
  loadPipeline,
  pipelineFromHistory,
  runPipelineOnActive,
  savePipeline,
} from "@/app/pipelineActions";
import { filterById } from "@/app/filterActions";
import { ParamControl } from "@/components/params/ParamControl";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import type { PipelineStep, StepScope, StepState } from "@/core/pipeline/pipeline";
import { activeDocument, useDocuments } from "@/state/documents";
import { announce } from "@/state/notifications";
import { usePipeline } from "@/state/pipeline";

const SCOPES: { value: StepScope; label: string }[] = [
  { value: "whole", label: "Whole image" },
  { value: "selection", label: "Inside the selection" },
  { value: "inverse", label: "Outside the selection" },
];

function stateText(state: StepState | undefined): string {
  switch (state?.state) {
    case "running":
      return "Running";
    case "done":
      return `${state.ms} ms`;
    case "cached":
      return "Cached";
    case "failed":
      return "Failed";
    case "off":
      return "Off";
    default:
      return "";
  }
}

function StepSettings({ step }: { step: PipelineStep }) {
  const update = usePipeline((s) => s.update);
  const entry = filterById(step.filterId);
  if (!entry) return null;
  const params = entryParams(entry).filter((p) => p.type !== "image");
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle px-2 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">Where</span>
        <Select
          label={`Where step ${entry.name} works`}
          value={step.scope}
          onChange={(value) => update(step.id, { scope: value as StepScope })}
          options={SCOPES}
          size="sm"
          className="w-44"
        />
      </div>
      {params.map((param) => (
        <ParamControl
          key={param.key}
          param={param}
          value={step.params[param.key] ?? param.default}
          onChange={(value) => update(step.id, { params: { ...step.params, [param.key]: value } })}
        />
      ))}
    </div>
  );
}

export function PipelinePanel() {
  const steps = usePipeline((s) => s.steps);
  const states = usePipeline((s) => s.states);
  const open = usePipeline((s) => s.open);
  const running = usePipeline((s) => s.running);
  const { update, remove, move, setOpen, replace } = usePipeline.getState();
  const hasDoc = useDocuments((s) => activeDocument(s) !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const moveBy = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= steps.length) return;
    move(index, to);
    announce(`Moved step ${index + 1} to place ${to + 1}.`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border-subtle px-2 py-1">
        <IconButton
          label="Add the selected filter"
          icon={<Plus size={14} />}
          onClick={addSelectedFilter}
        />
        <IconButton
          label="Make from the history"
          icon={<History size={14} />}
          disabled={!hasDoc}
          onClick={pipelineFromHistory}
        />
        {running ? (
          <IconButton label="Cancel the run" icon={<Square size={14} />} onClick={cancelPipeline} />
        ) : (
          <IconButton
            label="Run on the original image"
            icon={<Play size={14} />}
            disabled={!hasDoc || steps.length === 0}
            onClick={() => void runPipelineOnActive()}
          />
        )}
        <IconButton
          label="Save as JSON"
          icon={<Save size={14} />}
          disabled={steps.length === 0}
          onClick={savePipeline}
        />
        <IconButton
          label="Load a pipeline"
          icon={<FolderOpen size={14} />}
          onClick={() => fileInput.current?.click()}
        />
        <IconButton
          label="Clear the pipeline"
          icon={<Trash2 size={14} />}
          disabled={steps.length === 0 || running !== null}
          onClick={() => {
            replace([]);
            announce("Cleared the pipeline.");
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Pipeline file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadPipeline(file);
            event.target.value = "";
          }}
        />
      </div>
      {steps.length === 0 ? (
        <p className="p-3 text-xs text-text-secondary">
          No steps yet. Choose a filter in the Library and press Add, or make the pipeline from the
          history. A run starts from the original image and adds one history step.
        </p>
      ) : (
        <ol aria-label="Pipeline steps" className="min-h-0 flex-1 overflow-auto p-1">
          {steps.map((step, index) => {
            const label = describeStep(step);
            const state = states[step.id];
            return (
              <li
                key={step.id}
                draggable={running === null}
                onDragStart={(event) => {
                  setDragging(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (dragging !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null && dragging !== index) {
                    move(dragging, index);
                    announce(`Moved step ${dragging + 1} to place ${index + 1}.`);
                  }
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={clsx(
                  "rounded-control",
                  dragging === index && "opacity-50",
                  open === step.id && "bg-raised",
                )}
              >
                <div className="flex items-center gap-1 px-1 py-0.5 text-xs">
                  <GripVertical
                    size={12}
                    aria-hidden
                    className="shrink-0 cursor-grab text-text-muted"
                  />
                  <span className="tabular w-4 shrink-0 text-right text-text-muted">
                    {index + 1}
                  </span>
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    aria-label={`Step ${index + 1} on`}
                    onChange={(event) => update(step.id, { enabled: event.target.checked })}
                  />
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate",
                      !step.enabled && "text-text-muted line-through",
                    )}
                    title={label}
                  >
                    {label}
                  </span>
                  <span
                    className={clsx(
                      "tabular shrink-0 text-2xs",
                      state?.state === "failed" ? "text-danger" : "text-text-muted",
                    )}
                    title={state?.state === "failed" ? state.error : undefined}
                  >
                    {stateText(state)}
                  </span>
                  <IconButton
                    label={`Move step ${index + 1} up`}
                    size="sm"
                    icon={<ArrowUp size={12} />}
                    disabled={index === 0 || running !== null}
                    onClick={() => moveBy(index, -1)}
                  />
                  <IconButton
                    label={`Move step ${index + 1} down`}
                    size="sm"
                    icon={<ArrowDown size={12} />}
                    disabled={index === steps.length - 1 || running !== null}
                    onClick={() => moveBy(index, 1)}
                  />
                  <IconButton
                    label={`Settings of step ${index + 1}`}
                    size="sm"
                    pressed={open === step.id}
                    icon={<Settings2 size={12} />}
                    onClick={() => setOpen(open === step.id ? null : step.id)}
                  />
                  <IconButton
                    label={`Remove step ${index + 1}`}
                    size="sm"
                    icon={<Trash2 size={12} />}
                    disabled={running !== null}
                    onClick={() => remove(step.id)}
                  />
                </div>
                {open === step.id ? <StepSettings step={step} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
