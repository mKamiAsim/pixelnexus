/**
 * Every action in the studio is a command. Menus, keyboard shortcuts, the command palette and
 * the shortcut sheet all read this one list, so they never disagree.
 */
import { centeredView, fitView, nextZoomStep, zoomAt, type Size, type ViewState } from "@/canvas/viewport";
import { SYNTHETIC_IMAGES } from "@/core/image/synthetic";
import { flip, rotate } from "@/core/image/transform";
import type { RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useUi, type CompareMode, type ToolId } from "@/state/ui";
import { applyTheme, THEMES } from "@/styles/themes";

import { chooseFiles, openSample, pasteFromClipboard } from "./importer";
import { PANELS, PRESETS, applyPreset, isPanelOpen, togglePanel } from "./layout";

export type MenuId = "file" | "edit" | "image" | "select" | "filter" | "view" | "window" | "help";

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly menu: MenuId;
  /** Submenu title, when the command sits in a submenu. */
  readonly submenu?: string;
  readonly shortcut?: string;
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
  changeView((view, size) => zoomAt(view, nextZoomStep(view.zoom, direction), size.width / 2, size.height / 2));

const tool = (id: ToolId, label: string, shortcut: string): Command => ({
  id: `tool.${id}`,
  label,
  menu: "view",
  submenu: "Tools",
  shortcut,
  checked: () => useUi.getState().tool === id,
  run: () => useUi.getState().setTool(id),
});

const compare = (mode: CompareMode, label: string): Command => ({
  id: `view.compare.${mode}`,
  label,
  menu: "view",
  submenu: "Compare",
  keywords: "compare before after",
  enabled: hasDocument,
  checked: () => useUi.getState().compare === mode,
  run: () => useUi.getState().setCompare(mode),
});

export function buildCommands(): Command[] {
  return [
    // File
    { id: "file.open", label: "Open...", menu: "file", shortcut: "Mod+O", keywords: "import load file", run: chooseFiles },
    { id: "file.paste", label: "Paste image", menu: "file", shortcut: "Mod+V", keywords: "clipboard", run: () => void pasteFromClipboard() },
    ...SYNTHETIC_IMAGES.map<Command>((sample) => ({
      id: `file.sample.${sample.id}`,
      label: sample.name,
      menu: "file",
      submenu: "Open sample",
      keywords: `sample test image ${sample.description}`,
      run: () => openSample(sample.id),
    })),
    {
      id: "file.export",
      label: "Export...",
      menu: "file",
      shortcut: "Mod+S",
      keywords: "save download png jpeg webp tiff",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("export"),
    },
    {
      id: "file.close",
      label: "Close image",
      menu: "file",
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
    // Image
    { id: "image.rotate-cw", label: "Rotate 90 degrees clockwise", menu: "image", enabled: hasDocument, run: () => editActive("Rotate 90 cw", (i) => rotate(i, "cw")) },
    { id: "image.rotate-ccw", label: "Rotate 90 degrees counterclockwise", menu: "image", enabled: hasDocument, run: () => editActive("Rotate 90 ccw", (i) => rotate(i, "ccw")) },
    { id: "image.rotate-180", label: "Rotate 180 degrees", menu: "image", enabled: hasDocument, run: () => editActive("Rotate 180", (i) => rotate(i, "half")) },
    { id: "image.flip-h", label: "Flip horizontal", menu: "image", keywords: "mirror", enabled: hasDocument, run: () => editActive("Flip horizontal", (i) => flip(i, "horizontal")) },
    { id: "image.flip-v", label: "Flip vertical", menu: "image", keywords: "mirror", enabled: hasDocument, run: () => editActive("Flip vertical", (i) => flip(i, "vertical")) },
    // Select and Filter arrive in Phases 4 and 3. Their menus say so instead of showing fake items.
    { id: "select.later", label: "Selection tools arrive in Phase 4", menu: "select", enabled: () => false, run: () => undefined },
    { id: "filter.later", label: "Filters arrive in Phase 3", menu: "filter", enabled: () => false, run: () => undefined },
    // View
    { id: "view.zoom-in", label: "Zoom in", menu: "view", shortcut: "Mod+Plus", enabled: hasDocument, run: () => zoomStep(1) },
    { id: "view.zoom-out", label: "Zoom out", menu: "view", shortcut: "Mod+Minus", enabled: hasDocument, run: () => zoomStep(-1) },
    {
      id: "view.fit",
      label: "Fit on screen",
      menu: "view",
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
      shortcut: "Mod+Quote",
      keywords: "grid lines",
      checked: () => useUi.getState().pixelGrid,
      run: () => useUi.getState().togglePixelGrid(),
    },
    compare("off", "No comparison"),
    compare("split", "Split view"),
    compare("side-by-side", "Side by side"),
    compare("overlay", "Overlay"),
    compare("difference", "Difference"),
    tool("hand", "Hand", "H"),
    tool("zoom", "Zoom", "Z"),
    tool("probe", "Pixel probe", "I"),
    ...THEMES.map<Command>((theme) => ({
      id: `view.theme.${theme.id}`,
      label: theme.name,
      menu: "view",
      submenu: "Theme",
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
      keywords: "panel show hide",
      checked: () => isPanelOpen(panel.id),
      run: () => togglePanel(panel.id),
    })),
    ...PRESETS.map<Command>((preset) => ({
      id: `window.workspace.${preset.id}`,
      label: preset.name,
      menu: "window",
      submenu: "Workspace",
      keywords: "layout preset reset",
      run: () => applyPreset(preset.id),
    })),
    // Help
    { id: "help.palette", label: "Command palette", menu: "help", shortcut: "Mod+K", keywords: "search find action", run: () => useUi.getState().setDialog("palette") },
    { id: "help.shortcuts", label: "Keyboard shortcuts", menu: "help", shortcut: "Mod+Slash", keywords: "keys help", run: () => useUi.getState().setDialog("shortcuts") },
  ];
}

export function isEnabled(command: Command): boolean {
  return command.enabled ? command.enabled() : true;
}
