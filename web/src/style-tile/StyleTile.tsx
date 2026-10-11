import { Bold, Info, Plus, Settings, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { catalog, type Status } from "@/catalog";
import { fillFormula } from "@/catalog/formula";
import { Formula } from "@/components/math/Formula";
import { KernelGrid } from "@/components/math/KernelGrid";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Kbd } from "@/components/ui/Kbd";
import { NumberField } from "@/components/ui/NumberField";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { gaussianKernel1d, gaussianKernel2d } from "@/core/filters/linear/gaussian";
import { THEMES, applyTheme, isThemeId, storedTheme, type ThemeId } from "@/styles/themes";

import { PhoneMock } from "./PhoneMock";
import { WorkspaceMock } from "./WorkspaceMock";

const TOKEN_GROUPS: Record<string, string[]> = {
  Surfaces: ["app", "panel", "panel-header", "raised", "hover", "pressed", "canvas", "overlay"],
  Lines: ["border-subtle", "border", "border-control"],
  Text: ["text", "text-secondary", "text-muted", "text-disabled"],
  Accent: ["accent", "accent-hover", "accent-fg", "focus"],
  Meaning: ["success", "warning", "danger", "optional"],
  "Image area": ["checker-a", "checker-b"],
};

const TYPE_SCALE = [
  {
    cls: "text-2xl font-semibold",
    spec: "28 / 36, semibold",
    use: "Style tile and empty-state headings",
  },
  { cls: "text-xl font-semibold", spec: "20 / 28, semibold", use: "Dialog headings" },
  { cls: "text-lg font-semibold", spec: "15 / 20, semibold", use: "Panel headings" },
  { cls: "text-base font-semibold", spec: "13 / 18, semibold", use: "Filter name in Properties" },
  { cls: "text-sm", spec: "12 / 16, regular", use: "Default interface text" },
  { cls: "text-xs", spec: "11 / 16, regular", use: "Labels, captions, status bar" },
  { cls: "text-2xs font-medium", spec: "10 / 14, medium", use: "Badges and shortcut keys" },
  {
    cls: "font-mono text-sm tabular",
    spec: "Mono 12 / 16, tabular",
    use: "Numbers and pixel values",
  },
];

const STATUSES: Status[] = [
  "implemented-tested",
  "implemented-untested",
  "partial",
  "optional-dependency",
  "optional-model",
  "planned",
  "unsupported",
];

/** Current token values. The theme argument is part of the memo key, so values refresh on switch. */
function readTokens(_theme: ThemeId): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const names = Object.values(TOKEN_GROUPS).flat();
  return Object.fromEntries(names.map((n) => [n, styles.getPropertyValue(`--px-${n}`).trim()]));
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {intro ? <p className="max-w-3xl text-sm text-text-secondary">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StyleTile() {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  const tokens = useMemo(() => readTokens(theme), [theme]);
  const changeTheme = (next: string) => {
    if (!isThemeId(next)) return;
    applyTheme(next);
    setTheme(next);
  };
  const [sigma, setSigma] = useState(1);
  const [size, setSize] = useState(5);
  const [border, setBorder] = useState("reflect101");
  const [linearLight, setLinearLight] = useState(false);
  const [mode, setMode] = useState("add");
  const gaussian = catalog.filters.find((filter) => filter.id === "gaussian");
  const kernel = useMemo(() => gaussianKernel2d(sigma, 3), [sigma]);
  const kernel1d = useMemo(() => gaussianKernel1d(sigma, 3), [sigma]);

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 className="text-2xl font-semibold">PixelNexus style tile</h1>
          <p className="text-sm text-text-secondary">
            This page shows the look of the studio before the full workspace is built: colors, type,
            controls, panels and a phone layout. Light is the default theme. Controls respond to
            input. No filter runs yet.
          </p>
        </div>
        <SegmentedControl
          label="Theme"
          value={theme}
          onChange={changeTheme}
          segments={THEMES.map((t) => ({ value: t.id, label: t.name }))}
        />
      </header>

      <Section
        title="Workspace"
        intro="The desktop layout at real size. Tools on the far left, the filter library next to them, the canvas in the middle, and Properties, Inspector and Learn on the right. Every panel will dock, tab, float and collapse."
      >
        <WorkspaceMock />
      </Section>

      <Section
        title="Color"
        intro="Neutral grays with almost no tint, so the interface does not change how you see the image. One blue accent marks focus, the active tool and the main action. Text passes WCAG AA contrast in every theme."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(TOKEN_GROUPS).map(([group, names]) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{group}</h3>
              <ul className="flex flex-col gap-1.5">
                {names.map((name) => (
                  <li key={name} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-7 w-10 rounded-control border border-border"
                      style={{ background: `var(--px-${name})` }}
                    />
                    <span className="text-xs">{name}</span>
                    <span className="ml-auto font-mono text-xs text-text-muted">
                      {tokens[name]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Type"
        intro="Inter for the interface and JetBrains Mono for numbers. Both are bundled with the app, so no font is loaded from the internet. Numbers use fixed-width digits, so columns line up."
      >
        <table className="w-full max-w-4xl text-left">
          <tbody>
            {TYPE_SCALE.map((row) => (
              <tr key={row.spec} className="border-b border-border-subtle">
                <td className={`py-2 pr-6 ${row.cls}`}>Gaussian 0.0625</td>
                <td className="py-2 pr-6 font-mono text-xs text-text-muted">{row.spec}</td>
                <td className="py-2 text-xs text-text-secondary">{row.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Controls"
        intro="Controls are 28 px high on desktop and 40 px on touch screens. Drag a slider label left or right to change its value, or type an exact number. Hover or focus any icon to see its name and shortcut."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Buttons</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Apply</Button>
              <Button>Reset</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">
                <Trash2 size={14} /> Delete mask
              </Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary">
                Small
              </Button>
              <Button size="touch" variant="primary">
                Touch size
              </Button>
              <IconButton label="Add preset" icon={<Plus size={15} />} />
              <IconButton label="Bold toggle" icon={<Bold size={15} />} pressed />
              <IconButton label="Settings" icon={<Settings size={15} />} shortcut="Ctrl+," />
              <Tooltip content="Explains a term in plain words">
                <button type="button" aria-label="Help" className="text-text-muted hover:text-text">
                  <Info size={14} />
                </button>
              </Tooltip>
            </div>
            <h3 className="pt-2 text-sm font-semibold">Choices</h3>
            <SegmentedControl
              label="Selection mode"
              value={mode}
              onChange={setMode}
              segments={[
                { value: "new", label: "New" },
                { value: "add", label: "Add" },
                { value: "subtract", label: "Subtract" },
                { value: "intersect", label: "Intersect" },
              ]}
            />
            <div className="w-72">
              <Select
                label="Border mode"
                value={border}
                onChange={setBorder}
                options={[
                  { value: "reflect101", label: "Reflect 101 (default)" },
                  { value: "replicate", label: "Replicate" },
                  { value: "constant", label: "Constant (zero)" },
                ]}
              />
            </div>
            <div className="w-56">
              <Switch label="Linear light" checked={linearLight} onChange={setLinearLight} />
            </div>
            <h3 className="pt-2 text-sm font-semibold">Badges and keys</h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">Browser</Badge>
              <Badge tone="optional">Science engine</Badge>
              <Badge>Linear</Badge>
              <span className="ml-2 flex items-center gap-2 text-xs text-text-secondary">
                Undo <Kbd keys="Ctrl+Z" /> Fit <Kbd keys="Ctrl+0" />
              </span>
            </div>
          </div>
          <div className="flex max-w-80 flex-col gap-4">
            <h3 className="text-sm font-semibold">Parameters</h3>
            <ScrubSlider
              label="Sigma"
              description="Standard deviation of the Gaussian curve."
              value={sigma}
              onChange={setSigma}
              min={0.3}
              max={1.5}
              step={0.05}
              unit="px"
            />
            <ScrubSlider
              label="Window size"
              description="Odd sizes only."
              value={size}
              onChange={setSize}
              min={3}
              max={25}
              integer
              oddOnly
              unit="px"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Exact value</span>
              <NumberField
                label="Exact value"
                value={sigma}
                onChange={setSigma}
                min={0.3}
                max={1.5}
                step={0.05}
                unit="px"
                className="w-24"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Inspector preview"
        intro="Formulas render with KaTeX. The kernel below comes from the real Gaussian kernel generator. Move the Sigma slider above and it updates. Blue cells would be negative weights. Amber cells are positive."
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3 rounded-panel border border-border bg-panel p-4">
            <h3 className="text-sm font-semibold">Gaussian filter</h3>
            <Formula tex={fillFormula(gaussian?.formula ?? "", { sigma, truncate: 3 })} />
            <p className="text-xs text-text-secondary">{gaussian?.formulaExplanation}</p>
            <p className="font-mono text-xs text-text-muted">
              g = [{Array.from(kernel1d, (v) => v.toFixed(4)).join(", ")}]
            </p>
          </div>
          <div className="rounded-panel border border-border bg-panel p-4">
            <KernelGrid
              rows={kernel}
              digits={4}
              caption={`Gaussian, sigma ${sigma.toFixed(2)}, truncate 3`}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Phone layout"
        intro="The same app on a 375 px wide phone. The canvas takes the top, tools sit at the bottom within thumb reach, and panels open as a sheet. Touch controls are 40 px high."
      >
        <PhoneMock />
      </Section>
    </div>
  );
}
