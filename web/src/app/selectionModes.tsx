import { Square, SquaresIntersect, SquaresSubtract, SquaresUnite } from "lucide-react";
import type { ReactNode } from "react";

import type { CombineMode } from "@/core/mask/mask";

/** The combine modes, for segmented controls. */
export const MODES: readonly {
  value: CombineMode;
  label: string;
  icon: ReactNode;
  shortcut?: string;
}[] = [
  { value: "new", label: "New selection", icon: <Square size={14} /> },
  {
    value: "add",
    label: "Add to selection",
    icon: <SquaresUnite size={14} />,
    shortcut: "Shift",
  },
  {
    value: "subtract",
    label: "Subtract from selection",
    icon: <SquaresSubtract size={14} />,
    shortcut: "Alt",
  },
  {
    value: "intersect",
    label: "Intersect with selection",
    icon: <SquaresIntersect size={14} />,
    shortcut: "Shift+Alt",
  },
];
