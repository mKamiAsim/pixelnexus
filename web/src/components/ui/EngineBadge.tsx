import { Server } from "lucide-react";

import type { Filter } from "@/catalog";
import { useNeedsEngine } from "@/state/engine";

import { Badge } from "./Badge";

/**
 * Marks filters that run in the local science engine. A runnable one shows a warning while the
 * engine does not answer, so it is clear why it cannot run.
 */
export function EngineBadge({ entry }: { entry: Filter }) {
  const needs = useNeedsEngine(entry);
  if (entry.engine !== "science") return null;
  return needs ? (
    <Badge
      tone="warning"
      icon={<Server size={11} />}
      title="This filter runs in the PixelNexus engine, which is not running. Start it with: uv run pixelnexus-engine"
    >
      Needs local engine
    </Badge>
  ) : (
    <Badge
      tone="neutral"
      icon={<Server size={11} />}
      title="This filter runs in the PixelNexus engine on this computer."
    >
      Engine
    </Badge>
  );
}
