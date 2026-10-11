/**
 * Panel layout. The workspace is one dockview with a fixed canvas panel in the middle. Tool
 * panels dock, tab and float around it. Layouts are saved per browser. Documents are not part
 * of the saved layout, so a layout never refers to an image that is gone.
 */
import type { DockviewApi } from "dockview-react";

export const CANVAS_PANEL = "canvas";

export const PANELS = [
  { id: "images", title: "Images", side: "left" },
  { id: "navigator", title: "Navigator", side: "right" },
  { id: "info", title: "Info", side: "right" },
  { id: "histogram", title: "Histogram", side: "right" },
] as const;

export type PanelId = (typeof PANELS)[number]["id"];

export const PRESETS = [
  { id: "essentials", name: "Essentials" },
  { id: "study", name: "Study" },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

const STORAGE_KEY = "pixelnexus.layout.v1";

let api: DockviewApi | null = null;

export function setWorkspaceApi(next: DockviewApi | null): void {
  api = next;
}

function addCanvas(dock: DockviewApi): void {
  const panel = dock.addPanel({ id: CANVAS_PANEL, component: CANVAS_PANEL, title: "Canvas" });
  prepareCanvasGroup(dock);
  panel.api.setActive();
}

/** The canvas group shows no tab strip and accepts no other panels. */
export function prepareCanvasGroup(dock: DockviewApi): void {
  const group = dock.getPanel(CANVAS_PANEL)?.group;
  if (!group) return;
  group.header.hidden = true;
  group.locked = "no-drop-target";
}

function titleOf(id: PanelId): string {
  return PANELS.find((panel) => panel.id === id)?.title ?? id;
}

export function applyPreset(id: PresetId, dock: DockviewApi | null = api): void {
  if (!dock) return;
  dock.clear();
  addCanvas(dock);
  const add = (panel: PanelId, reference: string, direction: "left" | "right" | "below" | "within", width?: number) =>
    dock.addPanel({
      id: panel,
      component: panel,
      title: titleOf(panel),
      position: { referencePanel: reference, direction },
      ...(width ? { initialWidth: width } : {}),
      inactive: direction === "within",
    });
  add("images", CANVAS_PANEL, "left", 248);
  if (id === "study") {
    add("info", CANVAS_PANEL, "right", 340);
    add("histogram", "info", "below");
    add("navigator", "histogram", "within");
  } else {
    add("navigator", CANVAS_PANEL, "right", 300);
    add("info", "navigator", "below");
    add("histogram", "info", "within");
  }
  dock.getPanel(CANVAS_PANEL)?.api.setActive();
}

export function isPanelOpen(id: PanelId): boolean {
  return Boolean(api?.getPanel(id));
}

/** Close an open panel, or open it next to its usual neighbors. */
export function togglePanel(id: PanelId): void {
  const dock = api;
  if (!dock) return;
  const existing = dock.getPanel(id);
  if (existing) {
    existing.api.close();
    return;
  }
  const side = PANELS.find((panel) => panel.id === id)?.side ?? "right";
  const neighbor = PANELS.find((panel) => panel.side === side && panel.id !== id && dock.getPanel(panel.id));
  dock.addPanel({
    id,
    component: id,
    title: titleOf(id),
    position: neighbor
      ? { referencePanel: neighbor.id, direction: "within" }
      : { referencePanel: CANVAS_PANEL, direction: side === "left" ? "left" : "right" },
  });
}

export function saveLayout(dock: DockviewApi): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dock.toJSON()));
  } catch {
    // Storage is blocked or full. The layout still works for this visit.
  }
}

/** Restore the saved layout. Returns false when there is none or it is not usable. */
export function restoreLayout(dock: DockviewApi): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    dock.fromJSON(JSON.parse(saved) as Parameters<DockviewApi["fromJSON"]>[0]);
    if (!dock.getPanel(CANVAS_PANEL)) return false;
    prepareCanvasGroup(dock);
    return true;
  } catch {
    return false;
  }
}
