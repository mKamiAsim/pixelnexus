/** The tools in the tool strip. Selection tools join in Phase 4, the line profile in Phase 3. */
import type { ToolId } from "@/state/ui";

export interface ToolInfo {
  readonly id: ToolId;
  readonly label: string;
  readonly shortcut: string;
  /** One line for the options bar and the shortcut sheet. */
  readonly hint: string;
}

export const TOOLS: readonly ToolInfo[] = [
  {
    id: "hand",
    label: "Hand",
    shortcut: "H",
    hint: "Drag to move the view. Double-click to fit the image.",
  },
  {
    id: "zoom",
    label: "Zoom",
    shortcut: "Z",
    hint: "Click to zoom in. Alt-click to zoom out. Double-click for 100%.",
  },
  {
    id: "probe",
    label: "Pixel probe",
    shortcut: "I",
    hint: "Click a pixel to pin it. The Info panel shows its exact values.",
  },
];
