import type { ParamValue } from "@/catalog/params";
import { ElementGrid } from "@/components/math/OperatorView";
import { AngleDial } from "@/components/ui/AngleDial";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { Param } from "@/generated/catalog-types";
import { parseKernel } from "@/core/filters/linear/weighted-average";
import { parseStructuringElement } from "@/core/filters/morphology/structuring";
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
    case "structuring-element":
      return <ElementField param={param} value={String(value)} onChange={onChange} />;
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

const ELEMENT_SHAPES = [
  { value: "disk", label: "Disk" },
  { value: "rect", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "cross", label: "Cross" },
  { value: "diamond", label: "Diamond" },
  { value: "line", label: "Line" },
  { value: "custom", label: "Custom" },
];

/** The sizes each shape takes, with their limits, in the order of the text form. */
const ELEMENT_SIZES: Record<
  string,
  { label: string; min: number; max: number; odd?: boolean; fallback: number }[]
> = {
  disk: [{ label: "Radius", min: 1, max: 15, fallback: 2 }],
  cross: [{ label: "Arm length", min: 1, max: 15, fallback: 2 }],
  diamond: [{ label: "Radius", min: 1, max: 15, fallback: 2 }],
  rect: [
    { label: "Width", min: 1, max: 31, odd: true, fallback: 5 },
    { label: "Height", min: 1, max: 31, odd: true, fallback: 3 },
  ],
  ellipse: [
    { label: "Half width", min: 1, max: 15, fallback: 3 },
    { label: "Half height", min: 1, max: 15, fallback: 2 },
  ],
  line: [
    { label: "Length", min: 1, max: 31, odd: true, fallback: 9 },
    { label: "Angle", min: 0, max: 180, fallback: 0 },
  ],
};

/**
 * The structuring element editor shared by the morphology filters: a shape, its sizes or a
 * custom grid of 0 and 1, and a preview of the element.
 */
function ElementField({
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
  const parsed = parseStructuringElement(value);
  const [shape = "disk", ...rest] = value.trim().split(/\s+/);
  const sizes = ELEMENT_SIZES[shape] ?? [];
  const numbers = sizes.map((size, i) => {
    const v = Number(rest[i]);
    return Number.isFinite(v) ? v : size.fallback;
  });
  const customText =
    draft && draft.for === value ? draft.text : rest.join(" ").replace(/;\s*/g, "\n");
  const setShape = (next: string) => {
    if (next === "custom") {
      const rows = parsed.ok
        ? parsed.element.rows
        : [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0],
          ];
      onChange(`custom ${rows.map((row) => row.join(" ")).join("; ")}`);
    } else {
      onChange([next, ...(ELEMENT_SIZES[next] ?? []).map((s) => s.fallback)].join(" "));
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">{param.label}</span>
        <Select
          label={`${param.label} shape`}
          size="sm"
          value={shape}
          onChange={(next) => setShape(String(next))}
          options={ELEMENT_SHAPES}
          className="w-40"
        />
      </div>
      {sizes.map((size, i) => (
        <ScrubSlider
          key={`${shape}-${size.label}`}
          label={size.label}
          value={numbers[i] ?? size.fallback}
          onChange={(v) => {
            const next = [...numbers];
            next[i] = Number(v);
            onChange([shape, ...next].join(" "));
          }}
          min={size.min}
          max={size.max}
          step={1}
          integer
          oddOnly={size.odd}
          unit={size.label === "Angle" ? "deg" : "px"}
        />
      ))}
      {shape === "custom" ? (
        <>
          <label htmlFor={id} className="text-2xs text-text-muted">
            One row per line, 0 or 1 separated by spaces, odd sides up to 15.
          </label>
          <textarea
            id={id}
            value={customText}
            rows={Math.min(8, Math.max(3, customText.split("\n").length))}
            spellCheck={false}
            aria-invalid={!parsed.ok}
            onChange={(event) => {
              const next = event.target.value;
              setDraft({ text: next, for: value });
              const candidate = `custom ${next.split("\n").join("; ")}`;
              const check = parseStructuringElement(candidate);
              if (check.ok) {
                onChange(`custom ${check.element.rows.map((row) => row.join(" ")).join("; ")}`);
              }
            }}
            className="tabular rounded-control border border-border-control bg-raised px-2 py-1 font-mono text-xs text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-invalid:border-danger"
          />
        </>
      ) : null}
      {parsed.ok ? (
        <ElementGrid
          element={parsed.element.rows}
          anchor={{ x: parsed.element.anchorX, y: parsed.element.anchorY }}
        />
      ) : (
        <p className="text-2xs text-danger">{parsed.message}</p>
      )}
    </div>
  );
}
