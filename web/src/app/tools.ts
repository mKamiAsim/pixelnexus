/** The tools in the tool strip. Selection tools take their names from the catalog. */
import { catalog } from "@/catalog";
import type { ToolId } from "@/state/ui";

export type ToolGroup = "view" | "marquee" | "lasso" | "brush" | "color";

export interface ToolInfo {
  readonly id: ToolId;
  readonly label: string;
  readonly shortcut?: string;
  /** One line for the options bar and the shortcut sheet. */
  readonly hint: string;
  /** The tool strip draws a line between groups. */
  readonly group: ToolGroup;
}

const toolName = (id: string) => catalog.tools.find((t) => t.id === id)?.name ?? id;

export const TOOLS: readonly ToolInfo[] = [
  {
    id: "hand",
    label: "Hand",
    shortcut: "H",
    group: "view",
    hint: "Drag to move the view. Double-click to fit the image.",
  },
  {
    id: "zoom",
    label: "Zoom",
    shortcut: "Z",
    group: "view",
    hint: "Click to zoom in. Alt-click to zoom out. Double-click for 100%.",
  },
  {
    id: "probe",
    label: "Pixel probe",
    shortcut: "I",
    group: "view",
    hint: "Click a pixel to pin it. The Info panel shows its exact values.",
  },
  {
    id: "marquee-rect",
    label: toolName("marquee-rect"),
    shortcut: "M",
    group: "marquee",
    hint: "Drag to select a rectangle. Shift makes a square. Alt draws from the center.",
  },
  {
    id: "marquee-ellipse",
    label: toolName("marquee-ellipse"),
    shortcut: "Shift+M",
    group: "marquee",
    hint: "Drag to select an ellipse. Shift makes a circle. Alt draws from the center.",
  },
  {
    id: "lasso",
    label: toolName("lasso"),
    shortcut: "L",
    group: "lasso",
    hint: "Drag around an area. Release to close the outline.",
  },
  {
    id: "lasso-polygon",
    label: toolName("lasso-polygon"),
    shortcut: "Shift+L",
    group: "lasso",
    hint: "Click to add corners. Close on the first corner, with a double-click or with Enter. Backspace removes a corner.",
  },
  {
    id: "lasso-magnetic",
    label: toolName("lasso-magnetic"),
    group: "lasso",
    hint: "Click on an edge, then move along it. Click to fix a point. Close on the first point, with a double-click or with Enter.",
  },
  {
    id: "brush-select",
    label: toolName("brush-select"),
    shortcut: "B",
    group: "brush",
    hint: "Paint to add to the selection. Hold Alt to remove.",
  },
  {
    id: "eraser-select",
    label: toolName("eraser-select"),
    shortcut: "E",
    group: "brush",
    hint: "Paint to remove from the selection.",
  },
  {
    id: "magic-wand",
    label: toolName("magic-wand"),
    shortcut: "W",
    group: "color",
    hint: "Click a color to select it. Shift adds, Alt subtracts, both intersect.",
  },
  {
    id: "quick-selection",
    label: toolName("quick-selection"),
    shortcut: "Shift+W",
    group: "color",
    hint: "Paint over a part of the image. The selection grows to similar areas. Alt subtracts.",
  },
  {
    id: "click-select-classical",
    label: toolName("click-select-classical"),
    group: "color",
    hint: "Click inside the object and Alt-click outside it. Needs the local engine.",
  },
];
