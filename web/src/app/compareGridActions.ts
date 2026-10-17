/**
 * The compare grid (PLAN.md Phase 8): several filters or settings side by side on the same part
 * of the image. Each cell runs at full resolution on one crop, so what you see is exact, not a
 * scaled preview. The crop is 256 x 256 pixels around the pixel pinned with the Probe tool, or
 * the center of the image. The size is our choice: large enough to judge detail, small enough
 * to run a dozen cells quickly.
 */
import { create } from "zustand";

import { cropImage } from "@/core/ai/crop";
import { fullRect } from "@/core/filters/run";
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import { MAX_CELLS } from "@/core/compare/sweep";
import { runJob } from "@/engine-client";
import { activeDocument, type ImageDocument } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { announce, notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { filterById, filterValues, selectFilter, stepLabel } from "./filterActions";
import { pipelineProblem } from "./pipelineActions";

export const CROP = 256;

export interface GridCell {
  readonly id: number;
  readonly filterId: string;
  readonly values: Readonly<Record<string, ParamValue>>;
}

export type CellResult =
  | { readonly state: "running" }
  | { readonly state: "done"; readonly image: RgbaImage; readonly ms: number }
  | { readonly state: "failed"; readonly error: string };

interface GridState {
  cells: readonly GridCell[];
  results: Readonly<Record<number, CellResult>>;
  /** The crop all cells ran on, and where it sits in the image. */
  crop: { readonly image: RgbaImage; readonly x: number; readonly y: number } | null;
  running: boolean;
}

export const useCompareGrid = create<GridState>()(() => ({
  cells: [],
  results: {},
  crop: null,
  running: false,
}));

let nextId = 0;

/** The crop around the probe point, or the image center, inside the image. */
export function cropArea(
  image: { width: number; height: number },
  point: { x: number; y: number } | null,
) {
  const width = Math.min(CROP, image.width);
  const height = Math.min(CROP, image.height);
  const cx = point?.x ?? image.width / 2;
  const cy = point?.y ?? image.height / 2;
  const x = Math.max(0, Math.min(image.width - width, Math.round(cx - width / 2)));
  const y = Math.max(0, Math.min(image.height - height, Math.round(cy - height / 2)));
  return { x, y, width, height };
}

export const cellLabel = (cell: GridCell) => {
  const entry = filterById(cell.filterId);
  return entry ? stepLabel(entry, cell.values) : cell.filterId;
};

/** Add cells. Cells past MAX_CELLS are left out, with a message. */
export function addCells(cells: readonly Omit<GridCell, "id">[]): void {
  const { cells: current } = useCompareGrid.getState();
  const room = MAX_CELLS - current.length;
  const added = cells.slice(0, Math.max(0, room)).map((c) => ({ ...c, id: ++nextId }));
  useCompareGrid.setState({ cells: [...current, ...added] });
  if (added.length < cells.length) {
    notify(
      "info",
      `The grid holds ${MAX_CELLS} cells`,
      `${cells.length - added.length} were left out.`,
    );
  }
}

/** Add the selected filter with its current values. */
export function addCurrentSettings(): void {
  const entry = filterById(useFilters.getState().selectedId);
  if (!entry) {
    notify("info", "Choose a filter first", "Pick one in the Library.");
    return;
  }
  const problem = pipelineProblem(entry);
  if (problem) {
    notify("info", "This filter cannot be compared here", problem);
    return;
  }
  addCells([{ filterId: entry.id, values: filterValues(entry).values }]);
}

/** Add one cell per value of a parameter of the selected filter, with the other values kept. */
export function addSweep(key: string, values: readonly ParamValue[]): void {
  const entry = filterById(useFilters.getState().selectedId);
  if (!entry) return;
  const base = filterValues(entry).values;
  addCells(values.map((value) => ({ filterId: entry.id, values: { ...base, [key]: value } })));
}

export function removeCell(id: number): void {
  const { cells, results } = useCompareGrid.getState();
  useCompareGrid.setState({
    cells: cells.filter((c) => c.id !== id),
    results: Object.fromEntries(Object.entries(results).filter(([key]) => Number(key) !== id)),
  });
}

export function clearGrid(): void {
  useCompareGrid.setState({ cells: [], results: {}, crop: null });
}

/** Copy a cell's filter and values into Properties. */
export function applyCellSettings(cell: GridCell): void {
  selectFilter(cell.filterId);
  useFilters.getState().setValues(cell.filterId, cell.values);
  announce(`Using ${cellLabel(cell)}.`);
}

/** Run every cell on the crop of the active image, one after another. */
export async function runGrid(doc: ImageDocument | null = activeDocument()): Promise<void> {
  const { cells, running } = useCompareGrid.getState();
  if (!doc || running || cells.length === 0) return;
  const probe = useUi.getState().probe;
  const point = probe?.documentId === doc.id ? probe : null;
  const area = cropArea(doc.current, point);
  const crop = { image: cropImage(doc.current, area), x: area.x, y: area.y };
  useCompareGrid.setState({ crop, results: {}, running: true });
  const { beginWork, endWork } = useUi.getState();
  beginWork(`Comparing ${cells.length} settings`);
  try {
    for (const cell of cells) {
      const set = (result: CellResult) =>
        useCompareGrid.setState((s) => ({ results: { ...s.results, [cell.id]: result } }));
      set({ state: "running" });
      const started = performance.now();
      try {
        const result = await runJob({
          filterId: cell.filterId,
          values: cell.values,
          image: crop.image,
          region: fullRect(crop.image),
        });
        set({ state: "done", image: result.image, ms: Math.round(performance.now() - started) });
      } catch (error) {
        set({ state: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    announce(`Compared ${cells.length} settings.`);
  } finally {
    useCompareGrid.setState({ running: false });
    endWork();
  }
}
