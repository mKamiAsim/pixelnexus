/**
 * Panel layout. The workspace is one dockview with a fixed canvas panel in the middle. Tool
 * panels dock, tab and float around it. Layouts are saved per browser. Documents are not part
 * of the saved layout, so a layout never refers to an image that is gone.
 */
import type { DockviewApi } from "dockview-react";

import { resetRails } from "./rails";

export const CANVAS_PANEL = "canvas";

export const PANELS = [
  { id: "library", title: "Library", side: "left" },
  { id: "images", title: "Images", side: "left" },
  { id: "properties", title: "Properties", side: "right" },
  { id: "inspector", title: "Inspector", side: "right" },
  { id: "learn", title: "Learn", side: "right" },
  { id: "developer", title: "Developer", side: "right" },
  { id: "history", title: "History", side: "right" },
  { id: "navigator", title: "Navigator", side: "right" },
  { id: "info", title: "Info", side: "right" },
  { id: "histogram", title: "Histogram", side: "right" },
  { id: "masks", title: "Masks", side: "right" },
] as const;

export type PanelId = (typeof PANELS)[number]["id"];

export const PRESETS = [
  {
    id: "essentials",
    name: "Essentials",
    description: "Library on the left, Properties, History and Info on the right",
  },
  {
    id: "study",
    name: "Study",
    description: "Learn and Inspector large, with Info and Histogram, for teaching and learning",
  },
  {
    id: "developer",
    name: "Developer",
    description: "Developer and Inspector panels, with History and Info",
  },
  {
    id: "compact",
    name: "Compact",
    description: "All panels in one narrow tab group, for small screens",
  },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

// Version 3 adds the Masks panel. Older saved layouts are replaced once by the preset.
const STORAGE_KEY = "pixelnexus.layout.v3";
const PRESET_KEY = "pixelnexus.preset.v1";

let api: DockviewApi | null = null;
const listeners = new Set<() => void>();

export function setWorkspaceApi(next: DockviewApi | null): void {
  api = next;
}

export function workspaceApi(): DockviewApi | null {
  return api;
}

/** Tell menus that the set of open panels changed, so check marks stay right. */
export function onPanelsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyPanelsChange(): void {
  for (const listener of listeners) listener();
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

export function currentPreset(): PresetId {
  try {
    const saved = localStorage.getItem(PRESET_KEY);
    return PRESETS.some((preset) => preset.id === saved) ? (saved as PresetId) : "essentials";
  } catch {
    return "essentials";
  }
}

export function applyPreset(id: PresetId, dock: DockviewApi | null = api): void {
  if (!dock) return;
  resetRails();
  dock.clear();
  addCanvas(dock);
  const add = (
    panel: PanelId,
    reference: string,
    direction: "left" | "right" | "below" | "within",
  ) =>
    dock.addPanel({
      id: panel,
      component: panel,
      title: titleOf(panel),
      position: { referencePanel: reference, direction },
      inactive: direction === "within",
    });
  // Group sizes are set after all panels exist, because each split shares out the space.
  const widths: [PanelId, number][] = [];
  const heights: [PanelId, number][] = [];
  const stack = (first: PanelId, others: PanelId[]) =>
    others.forEach((p) => add(p, first, "within"));
  if (id === "compact") {
    add("properties", CANVAS_PANEL, "right");
    stack("properties", [
      "library",
      "learn",
      "inspector",
      "images",
      "history",
      "navigator",
      "info",
      "histogram",
      "masks",
      "developer",
    ]);
    widths.push(["properties", 300]);
  } else if (id === "study") {
    add("library", CANVAS_PANEL, "left");
    stack("library", ["images"]);
    add("learn", CANVAS_PANEL, "right");
    stack("learn", ["inspector", "properties"]);
    add("info", "learn", "below");
    stack("info", ["histogram", "navigator", "history", "masks"]);
    widths.push(["library", 240], ["learn", 400]);
    heights.push(["info", 280]);
  } else if (id === "developer") {
    add("library", CANVAS_PANEL, "left");
    stack("library", ["images"]);
    add("developer", CANVAS_PANEL, "right");
    stack("developer", ["inspector", "properties"]);
    add("history", "developer", "below");
    stack("history", ["masks", "info", "histogram", "navigator"]);
    widths.push(["library", 240], ["developer", 400]);
    heights.push(["history", 260]);
  } else {
    add("library", CANVAS_PANEL, "left");
    stack("library", ["images"]);
    add("properties", CANVAS_PANEL, "right");
    stack("properties", ["inspector", "learn", "developer"]);
    add("history", "properties", "below");
    stack("history", ["masks", "navigator", "info", "histogram"]);
    widths.push(["library", 260], ["properties", 330]);
    heights.push(["history", 260]);
  }
  for (const [panel, height] of heights) dock.getPanel(panel)?.group.api.setSize({ height });
  for (const [panel, width] of widths) dock.getPanel(panel)?.group.api.setSize({ width });
  try {
    localStorage.setItem(PRESET_KEY, id);
  } catch {
    // Storage is blocked. The preset still applies for this visit.
  }
  dock.getPanel(CANVAS_PANEL)?.api.setActive();
  notifyPanelsChange();
}

export function isPanelOpen(id: PanelId): boolean {
  return Boolean(api?.getPanel(id));
}

/**
 * As in Photoshop's Window menu: a panel in front closes, an open panel behind another tab comes
 * to the front, and a closed panel opens next to its usual neighbors.
 */
export function togglePanel(id: PanelId): void {
  const dock = api;
  if (!dock) return;
  const existing = dock.getPanel(id);
  if (existing) {
    if (existing.api.isVisible) existing.api.close();
    else existing.api.setActive();
    notifyPanelsChange();
    return;
  }
  const side = PANELS.find((panel) => panel.id === id)?.side ?? "right";
  const neighbor =
    PANELS.find((panel) => panel.side === side && panel.id !== id && dock.getPanel(panel.id)) ??
    PANELS.find((panel) => panel.id !== id && dock.getPanel(panel.id));
  dock.addPanel({
    id,
    component: id,
    title: titleOf(id),
    position: neighbor
      ? { referencePanel: neighbor.id, direction: "within" }
      : { referencePanel: CANVAS_PANEL, direction: side === "left" ? "left" : "right" },
  });
  notifyPanelsChange();
}

/** Bring a panel to the front of its group, opening it first when it is closed. */
export function showPanel(id: PanelId): void {
  if (!api?.getPanel(id)) togglePanel(id);
  api?.getPanel(id)?.api.setActive();
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

/** Forget the saved layout. Used when a saved layout cannot be restored. */
export function forgetLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}
