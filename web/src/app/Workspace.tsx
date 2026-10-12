import { clsx } from "clsx";
import {
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Image,
  Map,
  X,
  ChartColumn,
  type LucideIcon,
} from "lucide-react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { CanvasPanel } from "@/panels/CanvasPanel";
import { HistogramPanel } from "@/panels/HistogramPanel";
import { ImagesPanel } from "@/panels/ImagesPanel";
import { InfoPanel } from "@/panels/InfoPanel";
import { NavigatorPanel } from "@/panels/NavigatorPanel";
import { useUi } from "@/state/ui";
import "@/styles/dockview-theme.css";
import { THEMES } from "@/styles/themes";

import {
  applyPreset,
  CANVAS_PANEL,
  currentPreset,
  forgetLayout,
  notifyPanelsChange,
  restoreLayout,
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
  images: Image,
  navigator: Map,
  info: Crosshair,
  histogram: ChartColumn,
};

function PanelBody({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-auto bg-panel text-text">{children}</div>;
}

const COMPONENTS = {
  [CANVAS_PANEL]: () => <CanvasPanel />,
  images: () => (
    <PanelBody>
      <ImagesPanel />
    </PanelBody>
  ),
  navigator: () => (
    <PanelBody>
      <NavigatorPanel />
    </PanelBody>
  ),
  info: () => (
    <PanelBody>
      <InfoPanel />
    </PanelBody>
  ),
  histogram: () => (
    <PanelBody>
      <HistogramPanel />
    </PanelBody>
  ),
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

  const onReady = ({ api }: DockviewReadyEvent) => {
    setWorkspaceApi(api);
    if (!restoreLayout(api)) {
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
