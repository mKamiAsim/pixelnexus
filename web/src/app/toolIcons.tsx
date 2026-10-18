import {
  CircleDashed,
  Crosshair,
  Eraser,
  Hand,
  Lasso,
  LassoSelect,
  Magnet,
  MousePointerClick,
  Paintbrush,
  Sparkles,
  SquareDashed,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ToolId } from "@/state/ui";

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  hand: <Hand size={16} />,
  zoom: <ZoomIn size={16} />,
  probe: <Crosshair size={16} />,
  "marquee-rect": <SquareDashed size={16} />,
  "marquee-ellipse": <CircleDashed size={16} />,
  lasso: <Lasso size={16} />,
  "lasso-polygon": <LassoSelect size={16} />,
  "lasso-magnetic": <Magnet size={16} />,
  "brush-select": <Paintbrush size={16} />,
  "eraser-select": <Eraser size={16} />,
  "magic-wand": <WandSparkles size={16} />,
  "quick-selection": <Sparkles size={16} />,
  "click-select-classical": <MousePointerClick size={16} />,
  "ai-click-select": <Sparkles size={16} />,
};
