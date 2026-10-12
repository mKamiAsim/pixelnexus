/**
 * Every action in the studio is a command. Menus, keyboard shortcuts, the command palette and
 * the shortcut sheet all read this one list, so they never disagree.
 */
import {
  centeredView,
  fitView,
  nextZoomStep,
  zoomAt,
  type Size,
  type ViewState,
} from "@/canvas/viewport";
import { SYNTHETIC_IMAGES } from "@/core/image/synthetic";
import { flip, rotate } from "@/core/image/transform";
import type { RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useSettings } from "@/state/settings";
import { useUi, type CompareMode } from "@/state/ui";
import { applyTheme, THEMES } from "@/styles/themes";

import { chooseFiles, openSample, pasteFromClipboard } from "./importer";
import { TOOLS, type ToolInfo } from "./tools";
import { PANELS, PRESETS, applyPreset, currentPreset, isPanelOpen, togglePanel } from "./layout";

export type MenuId = "file" | "edit" | "image" | "select" | "filter" | "view" | "window" | "help";

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly menu: MenuId;
  /** Submenu title, when the command sits in a submenu. */
  readonly submenu?: string;
  /** Menus draw a separator where the section changes. */
  readonly section?: string;
  readonly shortcut?: string;
  /** The browser delivers this key as its own event (paste), so the key handler skips it. */
  readonly browserKey?: boolean;
  /** The phase that makes this command work, for commands that are not built yet. */
  readonly phase?: number;
  /** Extra words for the command palette search. */
  readonly keywords?: string;
  readonly enabled?: () => boolean;
  readonly checked?: () => boolean;
  readonly run: () => void;
}

export const MENUS: readonly { id: MenuId; label: string }[] = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "image", label: "Image" },
  { id: "select", label: "Select" },
  { id: "filter", label: "Filter" },
  { id: "view", label: "View" },
  { id: "window", label: "Window" },
  { id: "help", label: "Help" },
];

const hasDocument = () => activeDocument() !== null;

function editActive(label: string, change: (image: RgbaImage) => RgbaImage) {
  const doc = activeDocument();
  if (doc) useDocuments.getState().edit(doc.id, change(doc.current), label);
}

function changeView(change: (view: ViewState, size: Size) => ViewState) {
  const doc = activeDocument();
  const size = useUi.getState().viewportSize;
  if (doc?.view && size) useDocuments.getState().setView(doc.id, change(doc.view, size));
}

const zoomStep = (direction: 1 | -1) =>
  changeView((view, size) =>
    zoomAt(view, nextZoomStep(view.zoom, direction), size.width / 2, size.height / 2),
  );

const tool = ({ id, label, shortcut }: ToolInfo): Command => ({
  id: `tool.${id}`,
  label,
  menu: "view",
  submenu: "Tools",
  section: "modes",
  shortcut,
  keywords: "tool",
  checked: () => useUi.getState().tool === id,
  run: () => useUi.getState().setTool(id),
});

const compare = (mode: CompareMode, label: string): Command => ({
  id: `view.compare.${mode}`,
  label,
  menu: "view",
  submenu: "Compare",
  section: "modes",
  keywords: "compare before after original",
  enabled: hasDocument,
  checked: () => useUi.getState().compare === mode,
  run: () => useUi.getState().setCompare(mode),
});

export function buildCommands(): Command[] {
  return [
    // File
    {
      id: "file.open",
      label: "Open...",
      menu: "file",
      section: "open",
      shortcut: "Mod+O",
      keywords: "import load file upload",
      run: chooseFiles,
    },
    {
      id: "file.paste",
      label: "Paste image",
      menu: "file",
      section: "open",
      shortcut: "Mod+V",
      browserKey: true,
      keywords: "clipboard",
      run: () => void pasteFromClipboard(),
    },
    ...SYNTHETIC_IMAGES.map<Command>((sample) => ({
      id: `file.sample.${sample.id}`,
      label: sample.name,
      menu: "file",
      section: "open",
      submenu: "Open test image",
      keywords: `sample test image synthetic ${sample.description}`,
      run: () => openSample(sample.id),
    })),
    {
      id: "file.export",
      label: "Export...",
      menu: "file",
      section: "save",
      shortcut: "Mod+S",
      keywords: "save download png jpeg webp tiff",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("export"),
    },
    {
      id: "file.close",
      label: "Close image",
      menu: "file",
      section: "save",
      enabled: hasDocument,
      run: () => {
        const doc = activeDocument();
        if (doc) useDocuments.getState().close(doc.id);
      },
    },
    // Edit
    {
      id: "edit.undo",
      label: "Undo",
      menu: "edit",
      shortcut: "Mod+Z",
      enabled: () => (activeDocument()?.undoStack.length ?? 0) > 0,
      run: () => {
        const doc = activeDocument();
        if (doc) useDocuments.getState().undo(doc.id);
      },
    },
    {
      id: "edit.redo",
      label: "Redo",
      menu: "edit",
      shortcut: "Mod+Shift+Z",
      enabled: () => (activeDocument()?.redoStack.length ?? 0) > 0,
      run: () => {
        const doc = activeDocument();
        if (doc) useDocuments.getState().redo(doc.id);
      },
    },
    {
      id: "edit.revert",
      label: "Revert to original",
      menu: "edit",
      section: "revert",
      keywords: "reset restore",
      enabled: () => {
        const doc = activeDocument();
        return doc !== null && doc.current !== doc.original;
      },
      run: () => {
        const doc = activeDocument();
        if (doc) useDocuments.getState().revert(doc.id);
      },
    },
    {
      id: "edit.preferences",
      label: "Preferences...",
      menu: "edit",
      section: "preferences",
      keywords: "settings limits size pixels",
      run: () => useUi.getState().setDialog("preferences"),
    },
    // Image
    {
      id: "image.rotate-cw",
      label: "Rotate 90 degrees clockwise",
      menu: "image",
      section: "rotate",
      keywords: "turn",
      enabled: hasDocument,
      run: () => editActive("Rotate 90 clockwise", (i) => rotate(i, "cw")),
    },
    {
      id: "image.rotate-ccw",
      label: "Rotate 90 degrees counterclockwise",
      menu: "image",
      section: "rotate",
      keywords: "turn",
      enabled: hasDocument,
      run: () => editActive("Rotate 90 counterclockwise", (i) => rotate(i, "ccw")),
    },
    {
      id: "image.rotate-180",
      label: "Rotate 180 degrees",
      menu: "image",
      section: "rotate",
      keywords: "turn",
      enabled: hasDocument,
      run: () => editActive("Rotate 180", (i) => rotate(i, "half")),
    },
    {
      id: "image.flip-h",
      label: "Flip horizontal",
      menu: "image",
      section: "flip",
      keywords: "mirror",
      enabled: hasDocument,
      run: () => editActive("Flip horizontal", (i) => flip(i, "horizontal")),
    },
    {
      id: "image.flip-v",
      label: "Flip vertical",
      menu: "image",
      section: "flip",
      keywords: "mirror",
      enabled: hasDocument,
      run: () => editActive("Flip vertical", (i) => flip(i, "vertical")),
    },
    // Select and Filter arrive in Phases 4 and 3. Their menus say so instead of showing fake items.
    {
      id: "select.deselect",
      label: "Deselect",
      menu: "select",
      shortcut: "Mod+D",
      phase: 4,
      enabled: () => false,
      run: () => undefined,
    },
    {
      id: "select.later",
      label: "Selection tools arrive in Phase 4",
      menu: "select",
      section: "note",
      enabled: () => false,
      run: () => undefined,
    },
    {
      id: "filter.later",
      label: "Filters arrive in Phase 3",
      menu: "filter",
      enabled: () => false,
      run: () => undefined,
    },
    // View
    {
      id: "view.zoom-in",
      label: "Zoom in",
      menu: "view",
      section: "zoom",
      shortcut: "Mod+Plus",
      keywords: "magnify larger",
      enabled: hasDocument,
      run: () => zoomStep(1),
    },
    {
      id: "view.zoom-out",
      label: "Zoom out",
      menu: "view",
      section: "zoom",
      shortcut: "Mod+Minus",
      keywords: "smaller",
      enabled: hasDocument,
      run: () => zoomStep(-1),
    },
    {
      id: "view.fit",
      label: "Fit on screen",
      menu: "view",
      section: "zoom",
      keywords: "reset view whole",
      shortcut: "Mod+0",
      enabled: hasDocument,
      run: () => {
        const doc = activeDocument();
        changeView((_view, size) => fitView(doc?.current ?? { width: 1, height: 1 }, size));
      },
    },
    {
      id: "view.actual",
      label: "Actual size (100%)",
      menu: "view",
      section: "zoom",
      keywords: "one to one pixels",
      shortcut: "Mod+1",
      enabled: hasDocument,
      run: () => {
        const doc = activeDocument();
        changeView((_view, size) => centeredView(doc?.current ?? { width: 1, height: 1 }, size, 1));
      },
    },
    {
      id: "view.pixel-grid",
      label: "Pixel grid",
      menu: "view",
      section: "show",
      shortcut: "Mod+Quote",
      keywords: "grid lines",
      checked: () => useUi.getState().pixelGrid,
      run: () => useUi.getState().togglePixelGrid(),
    },
    {
      id: "view.rulers",
      label: "Rulers",
      menu: "view",
      section: "show",
      keywords: "ruler coordinates",
      checked: () => useSettings.getState().rulers,
      run: () => useSettings.getState().toggleRulers(),
    },
    compare("off", "No comparison"),
    compare("split", "Split view"),
    compare("side-by-side", "Side by side"),
    compare("overlay", "Overlay"),
    compare("difference", "Difference"),
    ...TOOLS.map(tool),
    ...THEMES.map<Command>((theme) => ({
      id: `view.theme.${theme.id}`,
      label: theme.name,
      menu: "view",
      submenu: "Theme",
      section: "modes",
      keywords: "theme color dark light",
      checked: () => useUi.getState().theme === theme.id,
      run: () => {
        applyTheme(theme.id);
        useUi.getState().setTheme(theme.id);
      },
    })),
    // Window
    ...PANELS.map<Command>((panel) => ({
      id: `window.panel.${panel.id}`,
      label: panel.title,
      menu: "window",
      section: "panels",
      keywords: "panel show hide",
      checked: () => isPanelOpen(panel.id),
      run: () => togglePanel(panel.id),
    })),
    ...PRESETS.map<Command>((preset) => ({
      id: `window.workspace.${preset.id}`,
      label: preset.name,
      menu: "window",
      submenu: "Workspace",
      section: "workspace",
      keywords: `layout preset ${preset.description}`,
      checked: () => currentPreset() === preset.id,
      run: () => applyPreset(preset.id),
    })),
    {
      id: "window.workspace.reset",
      label: "Reset workspace",
      menu: "window",
      section: "workspace",
      keywords: "layout restore panels default",
      run: () => applyPreset(currentPreset()),
    },
    // Help
    {
      id: "help.palette",
      label: "Command palette",
      menu: "help",
      shortcut: "Mod+K",
      keywords: "search find action",
      run: () => useUi.getState().setDialog("palette"),
    },
    {
      id: "help.shortcuts",
      label: "Keyboard shortcuts",
      menu: "help",
      shortcut: "Mod+Slash",
      keywords: "keys help",
      run: () => useUi.getState().setDialog("shortcuts"),
    },
  ];
}

export function isEnabled(command: Command): boolean {
  return command.enabled ? command.enabled() : true;
}
