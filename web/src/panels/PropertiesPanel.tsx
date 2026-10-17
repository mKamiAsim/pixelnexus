import { clsx } from "clsx";
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  Download,
  Info,
  LoaderCircle,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Collapsible } from "radix-ui";
import { useState } from "react";

import { isRunnable, modelFor, type Filter } from "@/catalog";
import { entryParams } from "@/catalog/params";
import { applySelected, cancelApply, filterById, stepLabel } from "@/app/filterActions";
import { runEntryCommand } from "@/app/geometryActions";
import { showPanel } from "@/app/layout";
import { GlossaryText } from "@/components/GlossaryText";
import { ParamControl } from "@/components/params/ParamControl";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EngineBadge } from "@/components/ui/EngineBadge";
import { ModelCard } from "@/panels/ModelCard";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { FilterScope } from "@/core/composite/scope";
import { activeDocument, activeSelection, useDocuments } from "@/state/documents";
import { useNeedsEngine } from "@/state/engine";
import { useFilterValues } from "@/app/useFilterValues";
import { chooseAndImportPresets, exportPresets } from "@/app/presetActions";
import { useFilters, type Preset, type RunInfo } from "@/state/filters";
import { notify } from "@/state/notifications";

/** A shared empty list. A new [] in a selector would re-render forever. */
const NO_PRESETS: readonly Preset[] = [];

const ENGINE_LABEL: Record<string, string> = {
  browser: "Browser",
  science: "Science engine",
  model: "AI model",
  none: "No engine",
};

function runText(run: RunInfo): string {
  const what = run.kind === "apply" ? "Last apply" : "Last preview";
  const workers = run.workers === 1 ? "1 worker" : `${run.workers} workers`;
  return `${what}: ${Math.round(run.totalMs)} ms, ${run.tiles} ${run.tiles === 1 ? "tile" : "tiles"} on ${workers}.`;
}

/** Parameters, preview and apply for the selected filter. Every control comes from the catalog. */
export function PropertiesPanel() {
  const selectedId = useFilters((s) => s.selectedId);
  const entry = filterById(selectedId);
  if (!entry) {
    return (
      <div className="flex flex-col items-start gap-3 p-3 text-sm text-text-secondary">
        <p>Choose a filter in the Library to see its settings here.</p>
        <Button size="sm" onClick={() => showPanel("library")}>
          Open the Library
        </Button>
      </div>
    );
  }
  return <FilterProperties key={entry.id} entry={entry} />;
}

function FilterProperties({ entry }: { entry: Filter }) {
  const runnable = isRunnable(entry);
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">{entry.name}</h3>
          <span className="flex shrink-0 gap-1">
            <EngineBadge entry={entry} />
            <StatusBadge status={entry.status} />
          </span>
        </div>
        {entry.summary ? (
          <p className="text-xs text-text-secondary">
            <GlossaryText text={entry.summary} />
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {entry.classification ? (
            <>
              <Badge>{entry.classification.linearity === "linear" ? "Linear" : "Nonlinear"}</Badge>
              <Badge>{entry.classification.domain}</Badge>
            </>
          ) : null}
          <Badge tone="accent">{ENGINE_LABEL[entry.engine] ?? entry.engine}</Badge>
        </div>
      </div>

      {entry.command && runnable ? (
        <div className="m-3 flex flex-col items-start gap-2 rounded-control border border-border bg-raised p-2.5 text-xs text-text-secondary">
          <p className="flex gap-2">
            <Info size={14} className="mt-px shrink-0 text-accent-fg" aria-hidden />
            <span>
              This changes the size of the image, so it runs from a dialog in the Image menu. The
              dialog has the parameters.
            </span>
          </p>
          <Button size="sm" variant="primary" onClick={() => runEntryCommand(entry.command ?? "")}>
            Open {entry.name}
          </Button>
        </div>
      ) : null}

      {entry.command ? null : <FilterBody entry={entry} runnable={runnable} />}
    </div>
  );
}

function FilterBody({ entry, runnable }: { entry: Filter; runnable: boolean }) {
  const needsEngine = useNeedsEngine(entry);
  const { values, warnings } = useFilterValues(entry);
  const modelId = modelFor(entry, values);
  const setValue = useFilters((s) => s.setValue);
  const resetValues = useFilters((s) => s.resetValues);
  const doc = useDocuments((s) => activeDocument(s));
  const params = entryParams(entry);
  const basic = params.filter((p) => !p.advanced);
  const advanced = params.filter((p) => p.advanced);
  return (
    <>
      {!runnable ? (
        <p className="m-3 flex gap-2 rounded-control border border-border bg-raised p-2.5 text-xs text-text-secondary">
          <Info size={14} className="mt-px shrink-0 text-accent-fg" aria-hidden />
          <span>
            This filter is planned{entry.phase ? ` for Phase ${entry.phase}` : ""} and cannot run
            yet.
            {entry.reason ? ` ${entry.reason}` : ""}
          </span>
        </p>
      ) : null}

      <section
        aria-labelledby="props-params"
        className="flex flex-col gap-3 border-b border-border-subtle px-3 py-3"
      >
        <h4 id="props-params" className="text-xs font-medium text-text-secondary">
          Parameters
        </h4>
        {params.length === 0 ? (
          <p className="text-xs text-text-muted">
            {runnable ? "This filter has no parameters." : "The parameters arrive with the filter."}
          </p>
        ) : null}
        {basic.map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={values[param.key] ?? param.default}
            onChange={(value) => setValue(entry.id, param.key, value)}
          />
        ))}
        {advanced.length > 0 ? (
          <Collapsible.Root>
            <Collapsible.Trigger className="group flex h-6 items-center gap-1 text-xs text-text-secondary hover:text-text">
              <ChevronRight
                size={12}
                className="transition-transform group-data-[state=open]:rotate-90"
              />
              More settings
            </Collapsible.Trigger>
            <Collapsible.Content className="flex flex-col gap-3 pt-2">
              {advanced.map((param) => (
                <ParamControl
                  key={param.key}
                  param={param}
                  value={values[param.key] ?? param.default}
                  onChange={(value) => setValue(entry.id, param.key, value)}
                />
              ))}
            </Collapsible.Content>
          </Collapsible.Root>
        ) : null}
      </section>

      {runnable ? <ScopeRow /> : null}
      {runnable ? entry.engine === "browser" ? <PreviewRow /> : <EnginePreviewNote /> : null}
      {runnable && modelId ? <ModelCard key={modelId} modelId={modelId} /> : null}

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 border-b border-border-subtle px-3 py-2">
          {warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-xs text-text-secondary">
              <AlertTriangle size={13} className="mt-px shrink-0 text-warning" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {needsEngine ? (
        <p className="mx-3 mt-2 text-xs text-warning">
          This filter runs in the PixelNexus engine on your computer, which is not running. Start it
          with: uv run pixelnexus-engine
        </p>
      ) : null}
      <ApplyRow
        entry={entry}
        disabled={!runnable || !doc || needsEngine}
        onReset={() => resetValues(entry.id)}
      />
      {params.length > 0 ? <PresetRow entry={entry} values={values} /> : null}
    </>
  );
}

const SCOPES: readonly { value: FilterScope; label: string }[] = [
  { value: "selection", label: "Selection" },
  { value: "inverse", label: "Outside" },
  { value: "whole", label: "Whole image" },
];

/** Where the filter works: the selection, everything outside it, or the whole image. */
function ScopeRow() {
  const scope = useFilters((s) => s.scope);
  const setScope = useFilters((s) => s.setScope);
  const hasSelection = useDocuments((s) => Boolean(activeSelection(activeDocument(s))));
  const disabledSelection = useDocuments((s) => {
    const doc = activeDocument(s);
    return Boolean(doc?.selection && !doc.selectionEnabled);
  });
  if (!hasSelection) {
    return (
      <p className="border-b border-border-subtle px-3 py-2.5 text-2xs text-text-muted">
        {disabledSelection
          ? "Applies to the whole image, because the selection is off (Select > Use the selection)."
          : "Applies to the whole image. Make a selection to limit the filter to a part of it."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-2.5">
      <span id="props-scope" className="text-xs text-text-secondary">
        Apply to
      </span>
      <SegmentedControl
        label="Apply to"
        value={scope}
        onChange={(value) => setScope(value as FilterScope)}
        segments={SCOPES}
        fullWidth
      />
      <p className="text-2xs text-text-muted">
        {scope === "whole"
          ? "The selection is ignored."
          : "Soft selection edges blend the result with the image."}
      </p>
    </div>
  );
}

function PreviewRow() {
  const previewOn = useFilters((s) => s.previewOn);
  const setPreviewOn = useFilters((s) => s.setPreviewOn);
  const preview = useFilters((s) => s.preview);
  const status = !previewOn
    ? "Preview is off."
    : preview.status === "running"
      ? "Computing the preview"
      : preview.status === "error"
        ? (preview.note ?? "The preview failed.")
        : preview.status === "ready"
          ? (preview.note ?? "Exact preview at full resolution.")
          : "";
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-2.5">
      <Switch label="Preview" checked={previewOn} onChange={setPreviewOn} />
      <p
        role="status"
        className={clsx(
          "flex min-h-4 items-center gap-1.5 text-2xs",
          preview.status === "error"
            ? "text-danger"
            : preview.approximate
              ? "text-warning"
              : "text-text-muted",
        )}
      >
        {previewOn && preview.status === "running" ? (
          <LoaderCircle size={11} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {status}
      </p>
    </div>
  );
}

/** Science filters have no live preview. Their result arrives when they are applied. */
function EnginePreviewNote() {
  return (
    <p className="border-b border-border-subtle px-3 py-2.5 text-2xs text-text-muted">
      This filter runs in the PixelNexus engine on the whole image. There is no live preview. Click
      Apply to see the result, and Undo to go back.
    </p>
  );
}

function ApplyRow({
  entry,
  disabled,
  onReset,
}: {
  entry: Filter;
  disabled: boolean;
  onReset: () => void;
}) {
  const applying = useFilters((s) => s.applying);
  const lastRun = useFilters((s) => s.lastRun[entry.id]);
  const busy = applying?.filterId === entry.id;
  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
          Reset
        </Button>
        {busy ? (
          <Button size="sm" className="ml-auto" onClick={cancelApply}>
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            disabled={disabled || applying !== null}
            onClick={() => void applySelected()}
          >
            Apply
          </Button>
        )}
      </div>
      {busy ? (
        <div
          role="progressbar"
          aria-label={`Applying ${entry.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(applying.progress * 100)}
          className="h-1 overflow-hidden rounded-full bg-raised"
        >
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${applying.progress * 100}%` }}
          />
        </div>
      ) : null}
      {lastRun ? <p className="text-2xs text-text-muted">{runText(lastRun)}</p> : null}
    </div>
  );
}

function PresetRow({
  entry,
  values,
}: {
  entry: Filter;
  values: Readonly<Record<string, unknown>>;
}) {
  const presets = useFilters((s) => s.presets[entry.id]) ?? NO_PRESETS;
  const savePreset = useFilters((s) => s.savePreset);
  const deletePreset = useFilters((s) => s.deletePreset);
  const setValues = useFilters((s) => s.setValues);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState("");
  const json = JSON.stringify({ filter: entry.id, params: values }, null, 2);

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-secondary">Presets</span>
        {presets.length ? (
          <Select
            label="Load a preset"
            size="sm"
            value={chosen}
            onChange={(value) => {
              setChosen(value);
              const preset = presets.find((p) => p.name === value);
              if (preset) setValues(entry.id, preset.values);
            }}
            options={presets.map((p) => ({ value: p.name, label: p.name }))}
            className="min-w-0 flex-1"
          />
        ) : (
          <span className="min-w-0 flex-1 text-xs text-text-muted">None saved yet</span>
        )}
        <IconButton
          label="Delete this preset"
          icon={<Trash2 size={13} />}
          size="sm"
          disabled={!presets.some((p) => p.name === chosen)}
          onClick={() => {
            deletePreset(entry.id, chosen);
            setChosen("");
          }}
        />
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          savePreset(entry.id, { name: trimmed, values: values as Record<string, never> });
          setChosen(trimmed);
          setName("");
          notify(
            "success",
            `Saved preset "${trimmed}"`,
            stepLabel(entry, values as Record<string, never>),
          );
        }}
      >
        <input
          aria-label="New preset name"
          placeholder="Name for the current values"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-6 min-w-0 flex-1 rounded-control border border-border-control bg-raised px-2 text-xs text-text outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus"
        />
        <IconButton
          label="Save preset"
          type="submit"
          icon={<Save size={13} />}
          size="sm"
          disabled={!name.trim()}
        />
        <IconButton
          label="Export the presets of this filter"
          icon={<Download size={13} />}
          size="sm"
          disabled={presets.length === 0}
          onClick={() => exportPresets(entry.id)}
        />
        <IconButton
          label="Import presets"
          icon={<Upload size={13} />}
          size="sm"
          onClick={chooseAndImportPresets}
        />
        <IconButton
          label="Copy the settings as JSON"
          icon={<Copy size={13} />}
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(json)
              .then(() => notify("success", "Copied the settings as JSON"))
              .catch(() => notify("error", "Could not copy", "The browser did not allow it."));
          }}
        />
      </form>
    </div>
  );
}
