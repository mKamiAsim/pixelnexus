import type { ParamValue } from "@/catalog/params";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { Param } from "@/generated/catalog-types";

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
    case "number":
    case "integer":
    case "angle":
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
          unit={param.unit ?? (param.type === "angle" ? "deg" : undefined)}
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
    default:
      return (
        <p className="text-xs text-text-muted">
          {param.label}: the {param.type} editor arrives with the filters that need it.
        </p>
      );
  }
}
