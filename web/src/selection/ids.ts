/** The selection tools in the tool strip, by catalog id (catalog/tools/<id>.yaml). */
export const SELECTION_TOOL_IDS = [
  "marquee-rect",
  "marquee-ellipse",
  "lasso",
  "lasso-polygon",
  "lasso-magnetic",
  "brush-select",
  "eraser-select",
  "magic-wand",
  "quick-selection",
  "click-select-classical",
  "ai-click-select",
] as const;

export type SelectionToolId = (typeof SELECTION_TOOL_IDS)[number];

export function isSelectionTool(id: string): id is SelectionToolId {
  return (SELECTION_TOOL_IDS as readonly string[]).includes(id);
}

/** Tools that paint with a round brush, and show its outline at the pointer. */
export const BRUSH_TOOLS: readonly SelectionToolId[] = [
  "brush-select",
  "eraser-select",
  "quick-selection",
];
