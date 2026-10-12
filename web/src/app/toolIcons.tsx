import { Crosshair, Hand, ZoomIn } from "lucide-react";
import type { ReactNode } from "react";

import type { ToolId } from "@/state/ui";

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  hand: <Hand size={16} />,
  zoom: <ZoomIn size={16} />,
  probe: <Crosshair size={16} />,
};
