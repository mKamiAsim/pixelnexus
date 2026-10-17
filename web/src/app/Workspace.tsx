import { clsx } from "clsx";
import {
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  Code,
  Crosshair,
  Gauge,
  GraduationCap,
  History,
  Image,
  Layers,
  Library,
  Map,
  Radar,
  Sigma,
  SlidersHorizontal,
  Target,
  type LucideIcon,
  Workflow,
  X,
} from "lucide-react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconButton } from "@/components/ui/IconButton";
import { LearnPanel } from "@/learn/LearnPanel";
import { CanvasPanel } from "@/panels/CanvasPanel";
import { DeveloperPanel } from "@/panels/DeveloperPanel";
import { HistoryPanel } from "@/panels/HistoryPanel";
import { PipelinePanel } from "@/panels/PipelinePanel";
import { InspectorPanel } from "@/panels/InspectorPanel";
import { LibraryPanel } from "@/panels/LibraryPanel";
import { MasksPanel } from "@/panels/MasksPanel";
import { PropertiesPanel } from "@/panels/PropertiesPanel";
import { HistogramPanel } from "@/panels/HistogramPanel";
import { FeaturesPanel } from "@/panels/FeaturesPanel";
import { MetricsPanel } from "@/panels/MetricsPanel";
import { ImagesPanel } from "@/panels/ImagesPanel";
import { InfoPanel } from "@/panels/InfoPanel";
import { NavigatorPanel } from "@/panels/NavigatorPanel";
import { SpectrumPanel } from "@/panels/SpectrumPanel";
import { useUi } from "@/state/ui";
import "@/styles/dockview-theme.css";

import { PanelVisibleContext } from "./panelVisibility";
import { THEMES } from "@/styles/themes";

import {
  applyPreset,
  CANVAS_PANEL,
  currentPreset,
  forgetLayout,
  notifyPanelsChange,
  presetForScreen,
  restoreLayout,
  startupPreset,
  saveLayout,
  setWorkspaceApi,
  type PanelId,
} from "./layout";
import {
  collapseSide,
  expandSide,
  isCollapsed,
  onRailsChange,
  railsVersion,
  sideOf,
  syncRails,
} from "./rails";

const PANEL_ICONS: Record<PanelId, LucideIcon> = {
  library: Library,
  properties: SlidersHorizontal,
  inspector: Sigma,
  learn: GraduationCap,
  developer: Code,
  history: History,
  pipeline: Workflow,
  images: Image,
  navigator: Map,
  info: Crosshair,
  histogram: ChartColumn,
  masks: Layers,
  metrics: Gauge,
  spectrum: Radar,
  features: Target,
};

/** Each panel gets its own error boundary, so one failing panel cannot blank the studio. */
const panel = (name: string, body: ReactNode, scroll = true) => {
  const PanelComponent = ({ api }: IDockviewPanelProps) => {
    // Panels behind another tab stay mounted. Heavy panels read this and wait until they show.
    const subscribe = useMemo(
      () => (onChange: () => void) => {
        const listener = api.onDidVisibilityChange(onChange);
        return () => listener.dispose();
      },
      [api],
    );
    const visible = useSyncExternalStore(subscribe, () => api.isVisible);
    return (
      <div
        className={clsx("h-full bg-panel text-text", scroll ? "overflow-auto" : "overflow-hidden")}
      >
        <PanelVisibleContext value={visible}>
          <ErrorBoundary name={`the ${name} panel`}>{body}</ErrorBoundary>
        </PanelVisibleContext>
      </div>
    );
  };
  return PanelComponent;
};

const COMPONENTS = {
  [CANVAS_PANEL]: () => (
    <ErrorBoundary name="the canvas">
      <CanvasPanel />
    </ErrorBoundary>
  ),
  library: panel("Library", <LibraryPanel />, false),
  properties: panel("Properties", <PropertiesPanel />),
  inspector: panel("Inspector", <InspectorPanel />, false),
  learn: panel("Learn", <LearnPanel />),
  developer: panel("Developer", <DeveloperPanel />),
  history: panel("History", <HistoryPanel />, false),
  pipeline: panel("Pipeline", <PipelinePanel />, false),
  images: panel("Images", <ImagesPanel />),
  navigator: panel("Navigator", <NavigatorPanel />),
  info: panel("Info", <InfoPanel />),
  histogram: panel("Histogram", <HistogramPanel />),
  spectrum: panel("Spectrum", <SpectrumPanel />),
  masks: panel("Masks", <MasksPanel />),
  metrics: panel("Metrics", <MetricsPanel />),
  features: panel("Features", <FeaturesPanel />),
};

/** A panel tab with an icon. In a collapsed rail only the icon shows. */
function PanelTab({ api, containerApi }: IDockviewPanelHeaderProps) {
  const Icon = PANEL_ICONS[api.id as PanelId];
  return (
    <div
      className="px-tab flex h-full items-center gap-1.5 px-2.5"
      title={api.title}
      onClick={() => {
        const side = sideOf(containerApi, api.group);
        if (side && isCollapsed(side)) expandSide(containerApi, side);
      }}
    >
      {Icon ? <Icon size={13} aria-hidden className="shrink-0" /> : null}
      <span className="px-tab-title truncate">{api.title}</span>
    </div>
  );
}

/** Buttons on the right of each panel group: collapse the side to icons, close the panel. */
function GroupActions({ api, containerApi, group, activePanel }: IDockviewHeaderActionsProps) {
  useSyncExternalStore(onRailsChange, railsVersion);
  const side = sideOf(containerApi, group);
  if (!activePanel || api.location.type !== "grid" || !side) return null;
  if (isCollapsed(side)) {
    return (
      <div className="flex items-center justify-center p-1">
        <IconButton
          label="Expand panels"
          icon={side === "left" ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
          size="sm"
          tooltipSide={side === "left" ? "right" : "left"}
          onClick={() => expandSide(containerApi, side)}
        />
      </div>
    );
  }
  return (
    <div className="flex h-full items-center gap-0.5 pr-1">
      <IconButton
        label="Collapse to icons"
        icon={side === "left" ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
        size="sm"
        onClick={() => collapseSide(containerApi, side)}
      />
      <IconButton
        label={`Close ${activePanel.title ?? "panel"}`}
        icon={<X size={13} />}
        size="sm"
        onClick={() => {
          activePanel.api.close();
          notifyPanelsChange();
        }}
      />
    </div>
  );
}

/** The docking workspace: the canvas in the middle and panels around it. */
export function Workspace() {
  const themeId = useUi((s) => s.theme);
  const theme = useMemo(
    () => ({
      name: "pixelnexus",
      className: "dockview-theme-pixelnexus",
      colorScheme: THEMES.find((t) => t.id === themeId)?.scheme ?? "light",
    }),
    [themeId],
  );

  useEffect(() => () => setWorkspaceApi(null), []);
  // A phone turned sideways, or a window made narrow, gets the layout for its new size.
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const preset = presetForScreen(window.innerWidth);
        if (preset) applyPreset(preset, undefined, false);
      }, 300);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const onReady = ({ api }: DockviewReadyEvent) => {
    setWorkspaceApi(api);
    const forScreen = startupPreset(window.innerWidth);
    if (forScreen) {
      forgetLayout();
      applyPreset(forScreen, api, false);
    } else if (!restoreLayout(api)) {
      forgetLayout();
      applyPreset(currentPreset(), api);
    }
    // Rails need the final group positions, which exist after the first layout pass.
    requestAnimationFrame(() => syncRails(api));
    api.onDidLayoutChange(() => saveLayout(api));
    api.onDidAddPanel(() => notifyPanelsChange());
    api.onDidRemovePanel(() => notifyPanelsChange());
    api.onDidAddGroup(() => requestAnimationFrame(() => syncRails(api)));
    api.onDidMovePanel(() => requestAnimationFrame(() => syncRails(api)));
  };

  return (
    <DockviewReact
      className={clsx("min-h-0 flex-1")}
      theme={theme}
      components={COMPONENTS}
      defaultTabComponent={PanelTab}
      rightHeaderActionsComponent={GroupActions}
      onReady={onReady}
      floatingGroupBounds="boundedWithinViewport"
    />
  );
}
