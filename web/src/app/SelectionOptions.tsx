import { RotateCcw } from "lucide-react";
import { useId } from "react";

import { entryParams } from "@/catalog/params";
import { IconButton } from "@/components/ui/IconButton";
import { NumberField } from "@/components/ui/NumberField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import type { ParamValue } from "@/core/filters/types";
import type { Param } from "@/generated/catalog-types";
import type { CombineMode } from "@/core/mask/mask";
import type { SelectionToolId } from "@/selection/ids";
import { useSuperpixels } from "@/selection/superpixelCache";
import { toolEntry, useToolValues } from "@/selection/values";
import { activeDocument, useDocuments } from "@/state/documents";
import { useSelection } from "@/state/selection";

import { MODES } from "./selectionModes";

/** The brush tools always add or remove, so they have no mode buttons. */
const HAS_MODES: readonly SelectionToolId[] = [
  "marquee-rect",
  "marquee-ellipse",
  "lasso",
  "lasso-polygon",
  "lasso-magnetic",
  "magic-wand",
];

/** Parameters that only matter for one marquee style. */
function shown(param: Param, values: Readonly<Record<string, ParamValue>>): boolean {
  if (param.key === "ratioWidth" || param.key === "ratioHeight") return values.style === "ratio";
  if (param.key === "sizeWidth" || param.key === "sizeHeight") return values.style === "size";
  return true;
}

function Control({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}) {
  const id = useId();
  if (param.type === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"
      >
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-3.5 accent-accent"
        />
        {param.label}
      </label>
    );
  }
  if (param.type === "select") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
        {param.label}
        <Select
          size="sm"
          label={param.label}
          value={String(value)}
          onChange={onChange}
          options={(param.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))}
        />
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
      <label htmlFor={id}>{param.label}</label>
      <NumberField
        id={id}
        size="sm"
        className="w-20"
        label={param.label}
        value={typeof value === "number" ? value : Number(param.default)}
        onChange={onChange}
        min={param.min}
        max={param.max}
        step={param.step}
        integer={param.type === "integer"}
        unit={param.unit}
      />
    </span>
  );
}

/** Options bar content for a selection tool: the combine mode and the tool's settings. */
export function SelectionOptions({ tool }: { tool: SelectionToolId }) {
  const mode = useSelection((s) => s.mode);
  const setMode = useSelection((s) => s.setMode);
  const setValue = useSelection((s) => s.setValue);
  const resetValues = useSelection((s) => s.resetValues);
  const values = useToolValues(tool);
  const entry = toolEntry(tool);
  const params = entry ? entryParams(entry).filter((p) => !p.advanced && shown(p, values)) : [];
  return (
    <div className="flex shrink-0 items-center gap-3">
      {HAS_MODES.includes(tool) ? (
        <SegmentedControl
          label="Selection mode"
          value={mode}
          onChange={(value) => setMode(value as CombineMode)}
          iconOnly
          segments={MODES.map((m) => ({
            value: m.value,
            label: m.label,
            icon: m.icon,
            ...(m.shortcut ? { shortcut: m.shortcut } : {}),
          }))}
        />
      ) : null}
      {params.map((param) => (
        <Control
          key={param.key}
          param={param}
          value={values[param.key] ?? param.default}
          onChange={(value) => setValue(tool, param.key, value)}
        />
      ))}
      {tool === "quick-selection" ? <SuperpixelStatus /> : null}
      {params.length > 0 ? (
        <IconButton
          label="Reset tool settings"
          icon={<RotateCcw size={13} />}
          size="sm"
          onClick={() => resetValues(tool)}
        />
      ) : null}
    </div>
  );
}

/** Quick Selection needs superpixels first. This starts them and says when they are ready. */
function SuperpixelStatus() {
  const image = useDocuments((s) => activeDocument(s)?.current ?? null);
  const state = useSuperpixels(image);
  if (!image || !state || state.status === "ready") return null;
  return (
    <span role="status" className="shrink-0 text-xs text-text-muted">
      {state.status === "preparing"
        ? "Preparing the image for Quick Selection..."
        : `Quick Selection is not available: ${state.message}`}
    </span>
  );
}
