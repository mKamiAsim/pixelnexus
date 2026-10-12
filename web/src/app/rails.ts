/**
 * Collapse a side of the workspace to an icon rail, as Photoshop does with a panel dock.
 *
 * All docked groups on one side of the canvas collapse together, because they share one column
 * width. A collapsed group shows its tabs as a vertical strip of icons. Clicking an icon expands
 * the side again. The state is saved per browser next to the layout.
 */
import type { DockviewApi, DockviewGroupPanel } from "dockview-react";

import { CANVAS_PANEL } from "./layout";

export type Side = "left" | "right";

/** Width of a collapsed rail in CSS pixels. */
export const RAIL_WIDTH = 34;
const MIN_PANEL_WIDTH = 180;
const DEFAULT_WIDTH = 280;
const RAIL_CLASS = "px-rail";
const STORAGE_KEY = "pixelnexus.rails.v1";

/** Expanded widths of collapsed sides, so expanding restores the earlier size. */
type RailState = Partial<Record<Side, number>>;

function load(): RailState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as RailState) : {};
  } catch {
    return {};
  }
}

function save(state: RailState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is blocked. The rail still works for this visit.
  }
}

let state: RailState = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();

/** Subscribe to rail changes. Returns the unsubscribe function. */
export function onRailsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A value that changes whenever a side collapses or expands. */
export function railsVersion(): string {
  return `${state.left ?? ""}:${state.right ?? ""}`;
}

function setState(next: RailState): void {
  state = next;
  save(state);
  for (const listener of listeners) listener();
}

/** Which side of the canvas a docked group sits on, or null for the canvas and floating groups. */
export function sideOf(dock: DockviewApi, group: DockviewGroupPanel): Side | null {
  const canvas = dock.getPanel(CANVAS_PANEL)?.group;
  if (!canvas || group === canvas || group.api.location.type !== "grid") return null;
  const a = group.element.getBoundingClientRect();
  const b = canvas.element.getBoundingClientRect();
  return a.left + a.width / 2 < b.left + b.width / 2 ? "left" : "right";
}

function groupsOn(dock: DockviewApi, side: Side): DockviewGroupPanel[] {
  return dock.groups.filter((group) => sideOf(dock, group) === side);
}

export function isCollapsed(side: Side | null): boolean {
  return side !== null && state[side] !== undefined;
}

function applyCollapsed(group: DockviewGroupPanel, side: Side): void {
  group.element.classList.add(RAIL_CLASS);
  group.api.setHeaderPosition(side);
  group.api.setConstraints({ minimumWidth: RAIL_WIDTH, maximumWidth: RAIL_WIDTH });
  group.api.setSize({ width: RAIL_WIDTH });
}

function applyExpanded(group: DockviewGroupPanel, width: number): void {
  group.element.classList.remove(RAIL_CLASS);
  group.api.setHeaderPosition("top");
  group.api.setConstraints({
    minimumWidth: MIN_PANEL_WIDTH,
    maximumWidth: Number.MAX_SAFE_INTEGER,
  });
  group.api.setSize({ width });
}

/**
 * Run a change to one side while the other side keeps its width, so the canvas takes or gives
 * the difference. Dockview would otherwise share it out between all columns.
 */
function keepingOtherSide(dock: DockviewApi, side: Side, change: () => void): void {
  const other = groupsOn(dock, side === "left" ? "right" : "left").map(
    (group) => [group, group.api.width] as const,
  );
  change();
  for (const [group, width] of other) group.api.setSize({ width });
}

export function collapseSide(dock: DockviewApi, side: Side): void {
  const groups = groupsOn(dock, side);
  if (groups.length === 0 || isCollapsed(side)) return;
  setState({ ...state, [side]: Math.max(MIN_PANEL_WIDTH, groups[0]?.api.width ?? DEFAULT_WIDTH) });
  keepingOtherSide(dock, side, () => {
    for (const group of groups) applyCollapsed(group, side);
  });
}

export function expandSide(dock: DockviewApi, side: Side): void {
  const width = state[side] ?? DEFAULT_WIDTH;
  setState(side === "left" ? { right: state.right } : { left: state.left });
  keepingOtherSide(dock, side, () => {
    for (const group of groupsOn(dock, side)) applyExpanded(group, width);
  });
}

/**
 * Re-apply saved rails after a layout loads, and keep new groups on a collapsed side in step.
 * Groups that moved away from a collapsed side are expanded.
 */
export function syncRails(dock: DockviewApi): void {
  for (const group of dock.groups) {
    const side = sideOf(dock, group);
    const railed = group.element.classList.contains(RAIL_CLASS);
    if (side && isCollapsed(side) && !railed) applyCollapsed(group, side);
    else if ((!side || !isCollapsed(side)) && railed) {
      applyExpanded(group, side ? (state[side] ?? DEFAULT_WIDTH) : DEFAULT_WIDTH);
    }
  }
}

/** Forget all rails, for example when a workspace preset replaces the layout. */
export function resetRails(): void {
  setState({});
}
