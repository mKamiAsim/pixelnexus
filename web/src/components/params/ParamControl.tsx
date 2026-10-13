import type { ParamValue } from "@/catalog/params";
import { AngleDial } from "@/components/ui/AngleDial";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { Param } from "@/generated/catalog-types";
import { parseKernel } from "@/core/filters/linear/weighted-average";
import { useDocuments } from "@/state/documents";
import { useId, useState } from "react";

/**
 * One parameter control, chosen from the catalog parameter type. The Properties panel renders
 * a list of these, so no filter needs its own hand-made form.
 */
export function ParamControl({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}) {
  switch (param.type) {
    case "angle":
      return (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <ScrubSlider
              label={param.label}
              description={param.description}
              value={Number(value)}
              onChange={onChange}
              min={param.min ?? 0}
              max={param.max ?? 360}
              step={param.step ?? 1}
              unit={param.unit ?? "deg"}
            />
          </div>
          <AngleDial
            label={param.label}
            value={Number(value)}
            min={param.min ?? 0}
            max={param.max ?? 360}
            onChange={onChange}
          />
        </div>
      );
    case "number":
    case "integer":
      return (
        <ScrubSlider
          label={param.label}
          description={param.description}
          value={Number(value)}
          onChange={onChange}
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={param.step}
          integer={param.type === "integer"}
          oddOnly={param.oddOnly}
          unit={param.unit}
        />
      );
    case "select":
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-secondary">{param.label}</span>
          <Select
            label={param.label}
            size="sm"
            value={String(value)}
            onChange={onChange}
            options={param.options ?? []}
            className="w-40"
          />
        </div>
      );
    case "boolean":
      return <Switch label={param.label} checked={Boolean(value)} onChange={onChange} />;
    case "kernel":
      return <KernelField param={param} value={String(value)} onChange={onChange} />;
    case "image":
      return <ImageField param={param} value={String(value)} onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-text-muted">
          {param.label}: the {param.type} editor arrives with the filters that need it.
        </p>
      );
  }
}

/**
 * Another open image as an input, such as a guide. Only images of the same size as the active
 * one can be chosen. An empty value means the active image itself.
 */
function ImageField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: string;
  onChange: (value: ParamValue) => void;
}) {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const active = documents.find((d) => d.id === activeId);
  const others = documents.filter(
    (d) =>
      d.id !== activeId &&
      active &&
      d.current.width === active.current.width &&
      d.current.height === active.current.height,
  );
  const options = [
    { value: "", label: "This image" },
    ...others.map((d) => ({ value: d.id, label: d.name })),
  ];
  const known = options.some((o) => o.value === value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">{param.label}</span>
        <Select
          label={param.label}
          size="sm"
          value={known ? value : ""}
          onChange={onChange}
          options={options}
          className="w-40"
        />
      </div>
      {others.length === 0 ? (
        <p className="text-2xs text-text-muted">
          Open another image of the same size to use it here.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kernel text: rows separated by semicolons or new lines. The value changes only when the text
 * can be read, and a message says what is wrong until then.
 */
function KernelField({
  param,
  value,
  onChange,
}: {
  param: Param;
  value: string;
  onChange: (value: ParamValue) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ text: string; for: string } | null>(null);
  // A draft belongs to the value it was typed over. A new value from elsewhere replaces it.
  const text = draft && draft.for === value ? draft.text : value.replace(/;\s*/g, "\n");
  const parsed = parseKernel(text);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-text-secondary">
        {param.label}
      </label>
      <textarea
        id={id}
        value={text}
        rows={Math.min(8, Math.max(3, text.split("\n").length))}
        spellCheck={false}
        aria-invalid={!parsed.ok}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft({ text: next, for: value });
          const check = parseKernel(next);
          if (check.ok) onChange(check.rows.map((row) => row.join(" ")).join("; "));
        }}
        className="tabular rounded-control border border-border-control bg-raised px-2 py-1 font-mono text-xs text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-invalid:border-danger"
      />
      <p
        id={`${id}-help`}
        className={parsed.ok ? "text-2xs text-text-muted" : "text-2xs text-danger"}
      >
        {parsed.ok
          ? `${parsed.rows.length} by ${parsed.rows[0]?.length ?? 0}. One row per line, numbers separated by spaces.`
          : parsed.message}
      </p>
    </div>
  );
}
