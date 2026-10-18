/**
 * The compare grid dialog: settings side by side on one crop of the image,
 * built by hand or as a sweep of one parameter.
 */
import { useState } from "react";

import { entryParams } from "@/catalog/params";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { sweepable, sweepValues } from "@/core/compare/sweep";
import { Thumbnail } from "@/panels/Thumbnail";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import {
  addCurrentSettings,
  addSweep,
  applyCellSettings,
  cellLabel,
  clearGrid,
  CROP,
  removeCell,
  runGrid,
  useCompareGrid,
} from "./compareGridActions";
import { filterById, filterValues } from "./filterActions";

function SweepForm() {
  const entry = filterById(useFilters((s) => s.selectedId));
  const params = entry ? entryParams(entry).filter(sweepable) : [];
  const [key, setKey] = useState("");
  const param = params.find((p) => p.key === key) ?? params[0];
  const numeric = param && ["number", "integer", "angle"].includes(param.type);
  const current = entry && param ? Number(filterValues(entry).values[param.key] ?? 0) : 0;
  const [range, setRange] = useState<{ key: string; from: number; to: number; count: number }>({
    key: "",
    from: 0,
    to: 0,
    count: 5,
  });
  // A new parameter starts at its current value and goes up four steps of at least 1, as in
  // sigma 1 to 5. Our choice of a useful first range; both ends can be changed.
  const increase = Math.max(param?.step ?? 1, 1) * (param?.oddOnly ? 2 : 1);
  const values =
    param && range.key === param.key
      ? range
      : {
          key: param?.key ?? "",
          from: current,
          to: Math.min(param?.max ?? Infinity, current + 4 * increase),
          count: 5,
        };
  if (!entry || !param) {
    return (
      <p className="text-xs text-text-muted">
        Choose a filter in the Library to sweep one of its values.
      </p>
    );
  }
  const rules = {
    ...(param.min !== undefined ? { min: param.min } : {}),
    ...(param.max !== undefined ? { max: param.max } : {}),
    ...(param.step !== undefined ? { step: param.step } : {}),
    integer: param.type === "integer",
  };
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <Select
        label="Value to sweep"
        value={param.key}
        onChange={setKey}
        options={params.map((p) => ({ value: p.key, label: p.label }))}
        size="sm"
        className="w-40"
      />
      {numeric ? (
        <>
          <NumberField
            label={`${param.label} from`}
            value={values.from}
            onChange={(from) => setRange({ ...values, from })}
            size="sm"
            className="w-24"
            {...rules}
          />
          <NumberField
            label={`${param.label} to`}
            value={values.to}
            onChange={(to) => setRange({ ...values, to })}
            size="sm"
            className="w-24"
            {...rules}
          />
          <NumberField
            label="Number of cells"
            value={values.count}
            onChange={(count) => setRange({ ...values, count })}
            min={2}
            max={12}
            integer
            size="sm"
            className="w-20"
          />
        </>
      ) : null}
      <Button
        size="sm"
        onClick={() =>
          addSweep(param.key, sweepValues(param, values.from, values.to, values.count))
        }
      >
        Add sweep of {entry.name}
      </Button>
    </div>
  );
}

export function CompareGridDialog() {
  const open = useUi((s) => s.dialog === "compare-grid");
  const setDialog = useUi((s) => s.setDialog);
  const cells = useCompareGrid((s) => s.cells);
  const results = useCompareGrid((s) => s.results);
  const crop = useCompareGrid((s) => s.crop);
  const running = useCompareGrid((s) => s.running);
  const hasDoc = useDocuments((s) => activeDocument(s) !== null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "compare-grid" : null)}
      title="Compare grid"
      description={`Each cell runs at full resolution on the same ${CROP} x ${CROP} pixels: around the pixel pinned with the Probe tool, or the center of the image.`}
      className="w-[min(60rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" disabled={cells.length === 0 || running} onClick={clearGrid}>
            Clear
          </Button>
          <Button
            variant="primary"
            disabled={!hasDoc || cells.length === 0 || running}
            onClick={() => void runGrid()}
          >
            {running ? "Running" : "Run"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={addCurrentSettings}>
            Add the current settings
          </Button>
        </div>
        <SweepForm />
        {cells.length === 0 ? (
          <p className="text-xs text-text-muted">
            No cells yet. Add the current settings of a filter, or a sweep of one of its values.
          </p>
        ) : (
          <ul
            aria-label="Compare cells"
            className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3"
          >
            {crop ? (
              <li className="flex flex-col gap-1 text-xs">
                <Thumbnail
                  image={crop.image}
                  max={160}
                  label={`Original at x ${crop.x}, y ${crop.y}`}
                />
                <span className="font-medium">Original</span>
                <span className="text-text-muted">
                  x {crop.x}, y {crop.y}
                </span>
              </li>
            ) : null}
            {cells.map((cell) => {
              const result = results[cell.id];
              const label = cellLabel(cell);
              return (
                <li key={cell.id} className="flex flex-col gap-1 text-xs">
                  {result?.state === "done" ? (
                    <Thumbnail image={result.image} max={160} label={label} />
                  ) : (
                    <div className="checkerboard flex aspect-square w-40 items-center justify-center rounded-[3px] border border-border text-text-muted">
                      {result?.state === "running"
                        ? "Running"
                        : result?.state === "failed"
                          ? "Failed"
                          : "Not run"}
                    </div>
                  )}
                  <span className="break-words">{label}</span>
                  <span className={result?.state === "failed" ? "text-danger" : "text-text-muted"}>
                    {result?.state === "done"
                      ? `${result.ms} ms`
                      : result?.state === "failed"
                        ? result.error
                        : ""}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => applyCellSettings(cell)}>
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={running}
                      onClick={() => removeCell(cell.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
