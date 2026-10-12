import { Fragment } from "react";

import { ToolButton } from "@/components/ui/ToolButton";
import { useUi } from "@/state/ui";

import { TOOL_ICONS } from "./toolIcons";
import { TOOLS } from "./tools";

/** The vertical tool strip on the left edge. */
export function ToolStrip() {
  const active = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  return (
    <nav
      aria-label="Tools"
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-border-subtle bg-panel py-1.5"
    >
      {TOOLS.map((tool, index) => (
        <Fragment key={tool.id}>
          {index > 0 && TOOLS[index - 1]?.group !== tool.group ? (
            <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />
          ) : null}
          <ToolButton
            label={tool.label}
            icon={TOOL_ICONS[tool.id]}
            shortcut={tool.shortcut}
            active={active === tool.id}
            onSelect={() => setTool(tool.id)}
          />
        </Fragment>
      ))}
    </nav>
  );
}
