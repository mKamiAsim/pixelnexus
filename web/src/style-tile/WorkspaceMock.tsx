import {
  Activity,
  ChevronDown,
  Columns2,
  Crosshair,
  Diff,
  Eraser,
  Hand,
  Lasso,
  Layers,
  Move,
  Search,
  SplitSquareHorizontal,
  Square,
  SquareDashed,
  SquareMinus,
  SquarePlus,
  SquaresIntersect,
  Star,
  Brush,
  Wand,
  ZoomIn,
  Undo2,
  Redo2,
  Download,
  MoreHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import { catalog } from "@/catalog";
import { defaultValues, resolveParams, type ParamValue } from "@/catalog/params";
import { ParamControl } from "@/components/params/ParamControl";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { NumberField } from "@/components/ui/NumberField";
import { PanelFrame, PanelSection, PanelTabs } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { ToolButton } from "@/components/ui/ToolButton";
import { luma709, rgbToHsv, rgbToLab } from "@/core/color/convert";
import { computeHistogram } from "@/core/image/histogram";
import { siemensStar } from "@/core/image/synthetic";
import { getChannel } from "@/core/image/types";

import { ImageCanvas } from "./ImageCanvas";

const MENUS = ["File", "Edit", "Image", "Select", "Filter", "View", "Window", "Help"];

const TOOLS = [
  { id: "move", label: "Move", icon: <Move size={16} />, shortcut: "V" },
  {
    id: "marquee",
    label: "Rectangular marquee",
    icon: <SquareDashed size={16} />,
    shortcut: "M",
    more: true,
  },
  { id: "lasso", label: "Lasso", icon: <Lasso size={16} />, shortcut: "L", more: true },
  { id: "wand", label: "Magic Wand", icon: <Wand size={16} />, shortcut: "W", more: true },
  { id: "brush", label: "Selection brush", icon: <Brush size={16} />, shortcut: "B" },
  { id: "eraser", label: "Selection eraser", icon: <Eraser size={16} />, shortcut: "E" },
  null,
  { id: "probe", label: "Pixel probe", icon: <Crosshair size={16} />, shortcut: "I" },
  { id: "profile", label: "Line profile", icon: <Activity size={16} />, shortcut: "P" },
  null,
  { id: "hand", label: "Hand", icon: <Hand size={16} />, shortcut: "H" },
  { id: "zoom", label: "Zoom", icon: <ZoomIn size={16} />, shortcut: "Z" },
] as const;

const MODES = [
  { value: "new", label: "New selection", icon: <Square size={14} /> },
  { value: "add", label: "Add to selection", icon: <SquarePlus size={14} />, shortcut: "Shift" },
  {
    value: "subtract",
    label: "Subtract from selection",
    icon: <SquareMinus size={14} />,
    shortcut: "Alt",
  },
  { value: "intersect", label: "Intersect with selection", icon: <SquaresIntersect size={14} /> },
];

const PROBE = { x: 214, y: 98 };

export function WorkspaceMock() {
  const image = useMemo(() => siemensStar(512, 512), []);
  const histogram = useMemo(() => computeHistogram(image), [image]);
  const gaussian = catalog.filters.find((filter) => filter.id === "gaussian");
  const params = useMemo(() => resolveParams(gaussian?.params), [gaussian]);
  const [values, setValues] = useState<Record<string, ParamValue>>(() => defaultValues(params));
  const [tool, setTool] = useState("marquee");
  const [mode, setMode] = useState("new");
  const [feather, setFeather] = useState(0);
  const [antiAlias, setAntiAlias] = useState(true);
  const [rightTab, setRightTab] = useState("properties");
  const [leftTab, setLeftTab] = useState("library");
  const [lowerTab, setLowerTab] = useState("info");
  const [scope, setScope] = useState("selection");
  const [preview, setPreview] = useState(true);

  const linear = catalog.filters.filter((filter) => filter.family === "linear").slice(0, 9);
  const families = [...catalog.families].sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  for (const filter of catalog.filters)
    counts.set(filter.family, (counts.get(filter.family) ?? 0) + 1);

  const rgb = [0, 1, 2].map((c) => getChannel(image, PROBE.x, PROBE.y, c)) as [
    number,
    number,
    number,
  ];
  const hsv = rgbToHsv(...rgb);
  const lab = rgbToLab(...rgb);

  return (
    <div className="flex h-[760px] flex-col overflow-hidden rounded-panel border border-border bg-app text-text">
      {/* Menu bar */}
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        <span className="mr-2 flex items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden className="grid size-4 grid-cols-2 gap-px">
            <span className="rounded-[1px] bg-accent" />
            <span className="rounded-[1px] bg-text-muted" />
            <span className="rounded-[1px] bg-text-muted" />
            <span className="rounded-[1px] bg-text" />
          </span>
          PixelNexus
        </span>
        <nav aria-label="Main menu" className="flex">
          {MENUS.map((menu) => (
            <button
              key={menu}
              type="button"
              className="h-6 rounded-control px-2 text-sm text-text-secondary hover:bg-hover hover:text-text"
            >
              {menu}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Undo" shortcut="Ctrl+Z" icon={<Undo2 size={15} />} size="sm" />
          <IconButton label="Redo" shortcut="Ctrl+Shift+Z" icon={<Redo2 size={15} />} size="sm" />
          <IconButton label="Export" shortcut="Ctrl+S" icon={<Download size={15} />} size="sm" />
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded-control px-2 text-xs text-text-secondary hover:bg-hover"
          >
            <Layers size={13} /> Workspace: Study <ChevronDown size={12} />
          </button>
          <Badge tone="neutral" icon={<span className="size-1.5 rounded-full bg-text-muted" />}>
            Engine offline
          </Badge>
        </div>
      </header>

      {/* Options bar for the active tool */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border-subtle bg-panel-header px-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <SquareDashed size={14} className="text-accent-fg" /> Rectangular marquee
        </span>
        <span className="h-5 w-px bg-border" />
        <SegmentedControl
          label="Selection mode"
          value={mode}
          onChange={setMode}
          segments={MODES}
          iconOnly
        />
        <span className="flex items-center gap-2 text-xs text-text-secondary">
          Feather
          <NumberField
            label="Feather"
            value={feather}
            onChange={setFeather}
            min={0}
            max={250}
            integer
            unit="px"
            size="sm"
            className="w-16"
          />
        </span>
        <div className="w-28">
          <Switch label="Anti-alias" checked={antiAlias} onChange={setAntiAlias} />
        </div>
        <Button size="sm" variant="secondary" className="ml-auto">
          Select subject
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tool strip */}
        <nav
          aria-label="Tools"
          className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-border-subtle py-1.5"
        >
          {TOOLS.map((item, index) =>
            item ? (
              <ToolButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                shortcut={item.shortcut}
                hasMore={"more" in item}
                active={tool === item.id}
                onSelect={() => setTool(item.id)}
              />
            ) : (
              <span key={`sep-${index}`} className="my-1 h-px w-6 bg-border" />
            ),
          )}
        </nav>

        {/* Left dock */}
        <PanelFrame
          className="w-60 shrink-0 border-r border-border-subtle"
          header={
            <PanelTabs
              label="Left dock"
              value={leftTab}
              onChange={setLeftTab}
              tabs={[
                { value: "library", label: "Library" },
                { value: "images", label: "Images" },
                { value: "masks", label: "Masks" },
              ]}
            />
          }
          actions={<IconButton label="Panel menu" icon={<MoreHorizontal size={14} />} size="sm" />}
        >
          <div className="flex flex-col gap-2 p-2">
            <label className="flex h-7 items-center gap-1.5 rounded-control border border-border-control bg-raised px-2 text-text-muted focus-within:outline-2 focus-within:outline-focus">
              <Search size={13} />
              <input
                aria-label="Search filters"
                placeholder="Search filters, methods, aliases"
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              />
            </label>
            <ul className="flex flex-col">
              {families.slice(0, 1).map((family) => (
                <li key={family.id}>
                  <div className="flex h-7 items-center gap-1 text-xs font-medium text-text-secondary">
                    <ChevronDown size={12} /> {family.name}
                    <span className="tabular ml-auto text-text-muted">{counts.get(family.id)}</span>
                  </div>
                  <ul>
                    {linear.map((filter) => (
                      <li key={filter.id}>
                        <button
                          type="button"
                          className={
                            "flex h-7 w-full items-center gap-2 rounded-control pr-1 pl-5 text-left text-sm " +
                            (filter.id === "gaussian"
                              ? "bg-accent-subtle text-text"
                              : "text-text-secondary hover:bg-hover")
                          }
                        >
                          <span className="truncate">{filter.name}</span>
                          {filter.id === "box" ? (
                            <Star
                              size={12}
                              className="shrink-0 fill-warning text-warning"
                              aria-label="Favorite"
                            />
                          ) : null}
                          <span className="ml-auto">
                            <StatusBadge status={filter.status} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {families.slice(1, 8).map((family) => (
                <li
                  key={family.id}
                  title={family.name}
                  className="flex h-7 items-center gap-1 text-xs font-medium text-text-secondary"
                >
                  <ChevronDown size={12} className="shrink-0 -rotate-90" />
                  <span className="truncate">{family.name}</span>
                  <span className="tabular ml-auto pl-2 text-text-muted">
                    {counts.get(family.id)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </PanelFrame>

        {/* Center: documents and canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            role="tablist"
            aria-label="Open images"
            className="flex h-7 shrink-0 items-stretch border-b border-border-subtle bg-panel-header"
          >
            <span
              role="tab"
              aria-selected
              className="flex items-center gap-2 border-r border-border-subtle bg-canvas px-3 text-xs text-text"
            >
              siemens-star.png <span className="text-text-muted">75%</span>
            </span>
            <span
              role="tab"
              aria-selected={false}
              className="flex items-center gap-2 border-r border-border-subtle px-3 text-xs text-text-muted"
            >
              noise-patches.png
            </span>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-canvas">
            <div className="checkerboard relative shadow-popover">
              <ImageCanvas image={image} zoom={0.75} label="Siemens star test image" />
              <div
                className="marching-ants pointer-events-none absolute"
                style={{ left: 120, top: 60, width: 150, height: 110 }}
              />
              <div
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: PROBE.x * 0.75, top: PROBE.y * 0.75 }}
                aria-hidden
              />
            </div>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-panel bg-overlay p-1 shadow-popover">
              <IconButton
                label="Split view"
                icon={<SplitSquareHorizontal size={15} />}
                pressed
                size="sm"
              />
              <IconButton label="Side by side" icon={<Columns2 size={15} />} size="sm" />
              <IconButton label="Difference" icon={<Diff size={15} />} size="sm" />
              <span className="mx-1 h-4 w-px bg-border" />
              <span className="tabular px-1 font-mono text-xs text-text-secondary">75%</span>
            </div>
          </div>
        </main>

        {/* Right dock */}
        <div className="flex w-72 shrink-0 flex-col border-l border-border-subtle">
          <PanelFrame
            className="min-h-0 flex-1"
            header={
              <PanelTabs
                label="Filter panels"
                value={rightTab}
                onChange={setRightTab}
                tabs={[
                  { value: "properties", label: "Properties" },
                  { value: "inspector", label: "Inspector" },
                  { value: "learn", label: "Learn" },
                ]}
              />
            }
            actions={
              <IconButton label="Panel menu" icon={<MoreHorizontal size={14} />} size="sm" />
            }
          >
            <div className="flex flex-col gap-1 border-b border-border-subtle px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{gaussian?.name}</h3>
                {gaussian ? <StatusBadge status={gaussian.status} /> : null}
              </div>
              <p className="text-xs text-text-secondary">{gaussian?.summary}</p>
              <div className="flex gap-1 pt-1">
                <Badge>Linear</Badge>
                <Badge>Spatial</Badge>
                <Badge tone="accent">Browser</Badge>
              </div>
            </div>
            <PanelSection title="Apply to">
              <SegmentedControl
                label="Apply to"
                value={scope}
                onChange={setScope}
                fullWidth
                segments={[
                  { value: "image", label: "Image" },
                  { value: "selection", label: "Selection" },
                  { value: "inverse", label: "Inverse" },
                ]}
              />
            </PanelSection>
            <PanelSection title="Parameters">
              {params.map((param) => (
                <ParamControl
                  key={param.key}
                  param={param}
                  value={values[param.key] ?? param.default}
                  onChange={(value) => setValues((current) => ({ ...current, [param.key]: value }))}
                />
              ))}
            </PanelSection>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="w-24">
                <Switch label="Preview" checked={preview} onChange={setPreview} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setValues(defaultValues(params))}
              >
                Reset
              </Button>
              <Button size="sm" variant="primary">
                Apply
              </Button>
            </div>
          </PanelFrame>
          <PanelFrame
            className="h-[232px] shrink-0 border-t border-border-subtle"
            header={
              <PanelTabs
                label="Lower panels"
                value={lowerTab}
                onChange={setLowerTab}
                tabs={[
                  { value: "info", label: "Info" },
                  { value: "histogram", label: "Histogram" },
                  { value: "history", label: "History" },
                ]}
              />
            }
          >
            <div className="flex flex-col gap-2 p-3 text-xs">
              <HistogramPlot luma={histogram.luma} />
              <dl className="tabular grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 font-mono">
                <dt className="text-text-muted">X, Y</dt>
                <dd>
                  {PROBE.x}, {PROBE.y}
                </dd>
                <dt className="text-text-muted">Luma</dt>
                <dd>{fixed(luma709(...rgb), 1)}</dd>
                <dt className="text-text-muted">RGB</dt>
                <dd>{rgb.join(", ")}</dd>
                <dt className="text-text-muted">HSV</dt>
                <dd>
                  {fixed(hsv[0], 0)}°, {fixed(hsv[1] * 100, 0)}%, {fixed(hsv[2] * 100, 0)}%
                </dd>
                <dt className="text-text-muted">Lab</dt>
                <dd className="col-span-3">{lab.map((v) => fixed(v, 1)).join(", ")}</dd>
              </dl>
            </div>
          </PanelFrame>
        </div>
      </div>

      {/* Status bar */}
      <footer className="tabular flex h-6 shrink-0 items-center gap-4 border-t border-border-subtle px-3 text-xs text-text-muted">
        <span>512 x 512 px</span>
        <span>8-bit RGBA, sRGB</span>
        <span>Zoom 75%</span>
        <span className="font-mono">
          x {PROBE.x}, y {PROBE.y}
        </span>
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span aria-hidden className="marching-ants inline-block size-2.5" /> Selection: rectangle
          200 x 147 px
        </span>
        <span className="ml-auto">Images are processed locally in your browser.</span>
      </footer>
    </div>
  );
}

/** Fixed decimals without a minus sign on values that round to zero. */
function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

function HistogramPlot({ luma }: { luma: Uint32Array }) {
  const width = 256;
  const height = 64;
  // Square root scale, so tall spikes do not flatten everything else.
  const max = Math.sqrt(Math.max(1, ...luma));
  const points = Array.from(
    luma,
    (count, i) => `${i},${height - (Math.sqrt(count) / max) * height}`,
  );
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Luma histogram"
    >
      <rect width={width} height={height} fill="var(--px-raised)" />
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill="var(--px-text-secondary)"
        opacity={0.75}
      />
    </svg>
  );
}
