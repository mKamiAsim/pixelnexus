import {
  BookOpen,
  Download,
  Menu,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Undo2,
  Wand,
  Columns2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { catalog } from "@/catalog";
import { defaultValues, resolveParams, type ParamValue } from "@/catalog/params";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { noisePatches } from "@/core/image/synthetic";

import { ImageCanvas } from "./ImageCanvas";

const BOTTOM_TOOLS = [
  { label: "Select", icon: <SquareDashed size={20} /> },
  { label: "Filters", icon: <Wand size={20} />, active: true },
  { label: "Adjust", icon: <SlidersHorizontal size={20} /> },
  { label: "AI", icon: <Sparkles size={20} /> },
  { label: "Learn", icon: <BookOpen size={20} /> },
];

/** Phone layout sketch at 375 px wide: canvas on top, tools at the bottom, panels in a sheet. */
export function PhoneMock() {
  const image = useMemo(() => noisePatches(343, 300), []);
  const median = catalog.filters.find((filter) => filter.id === "median");
  const params = useMemo(() => resolveParams(median?.params), [median]);
  const [values, setValues] = useState<Record<string, ParamValue>>(() => defaultValues(params));
  const size = params.find((param) => param.key === "size");

  return (
    <div className="mx-auto flex h-[760px] w-[375px] flex-col overflow-hidden rounded-[28px] border-[6px] border-border bg-app text-text">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        <IconButton label="Menu" icon={<Menu size={20} />} size="touch" />
        <span className="flex-1 truncate text-center text-sm font-medium">noise-patches.png</span>
        <IconButton label="Undo" icon={<Undo2 size={20} />} size="touch" />
        <IconButton label="Redo" icon={<Redo2 size={20} />} size="touch" />
        <IconButton label="Export" icon={<Download size={20} />} size="touch" />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-canvas">
        <ImageCanvas image={image} zoom={1} label="Noise patches test image" />
        <div className="absolute top-2 right-2 rounded-panel bg-overlay p-0.5 shadow-popover">
          <IconButton label="Compare" icon={<Columns2 size={18} />} size="touch" />
        </div>
      </div>

      {/* Bottom sheet with the active panel */}
      <section
        aria-label="Properties"
        className="shrink-0 rounded-t-[14px] border-t border-border bg-panel shadow-popover"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-control" aria-hidden />
        <div role="tablist" aria-label="Panels" className="flex gap-1 px-3 pt-2">
          {["Properties", "Learn", "Inspector"].map((tab, index) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={index === 0}
              className={
                "h-9 rounded-control px-3 text-sm " +
                (index === 0
                  ? "bg-accent-subtle font-medium text-accent-fg"
                  : "text-text-secondary")
              }
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">{median?.name}</h3>
            {median ? <StatusBadge status={median.status} /> : null}
          </div>
          {size ? (
            <ScrubSlider
              label={size.label}
              value={Number(values.size ?? size.default)}
              onChange={(value) => setValues((current) => ({ ...current, size: value }))}
              min={size.min ?? 3}
              max={size.max ?? 25}
              integer
              oddOnly={size.oddOnly}
              unit={size.unit}
            />
          ) : null}
          <Button variant="primary" size="touch" className="w-full">
            Apply
          </Button>
        </div>
      </section>

      <nav
        aria-label="Tools"
        className="flex h-16 shrink-0 items-stretch border-t border-border-subtle bg-app"
      >
        {BOTTOM_TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            aria-pressed={tool.active ?? false}
            className={
              "flex flex-1 flex-col items-center justify-center gap-1 text-2xs " +
              (tool.active ? "text-accent-fg" : "text-text-secondary")
            }
          >
            {tool.icon}
            {tool.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
