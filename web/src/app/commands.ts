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
import { maskFromLuminance, maskToImage } from "@/core/mask/mask";
import { activeDocument, canRedo, canUndo, useDocuments } from "@/state/documents";
import { announce } from "@/state/notifications";
import { useFilters } from "@/state/filters";
import { useSelection } from "@/state/selection";
import { useSettings } from "@/state/settings";
import { useUi, type CompareMode } from "@/state/ui";
import { usePipeline } from "@/state/pipeline";
import { applyTheme, THEMES } from "@/styles/themes";

import { chooseFiles, openSample, pasteFromClipboard } from "./importer";
import { catalog, isRunnable } from "@/catalog";

import { applySelected, filterById, selectFilter } from "./filterActions";
import {
  canReselect,
  deselect,
  exportMask,
  hasSelection,
  inverse,
  REFINE,
  reselect,
  selectAll,
  selectFromAlpha,
  selectFromLuminance,
  selectSubject,
  toggleSelectionEnabled,
  type RefineKind,
} from "./selectionActions";
import { aiImage } from "./aiImageActions";
import { chooseAndImportPresets, exportPresets } from "./presetActions";
import { addSelectedFilter, runPipelineOnActive } from "./pipelineActions";
import { aiSelect } from "./aiSelectActions";
import { selectObject } from "./seedActions";
import { TOOLS, type ToolInfo } from "./tools";
import {
  PANELS,
  PRESETS,
  applyPreset,
  currentPreset,
  isPanelOpen,
  showPanel,
  togglePanel,
} from "./layout";

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

/** Apply an edit to the active image and tell screen readers what happened. */
/** Change the whole image. The selection turns, flips or scales with it. */
function editActive(label: string, change: (image: RgbaImage) => RgbaImage) {
  const doc = activeDocument();
  if (!doc) return;
  const image = change(doc.current);
  const selection = doc.selection
    ? maskFromLuminance(change(maskToImage(doc.selection)))
    : undefined;
  useDocuments.getState().edit(doc.id, image, label, undefined, selection);
  announce(`${label} applied. The image is ${image.width} by ${image.height} pixels.`);
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

/** One command per filter that can run, in submenus by family. */
function filterCommands(): Command[] {
  const families = [...catalog.families].sort((a, b) => a.order - b.order);
  return families.flatMap((family) =>
    catalog.filters
      .filter((f) => f.family === family.id && isRunnable(f))
      .map<Command>((f) => ({
        id: `filter.select.${f.id}`,
        label: f.name,
        menu: "filter",
        submenu: family.name,
        section: "filters",
        keywords: `filter ${(f.aliases ?? []).join(" ")} ${f.summary ?? ""}`,
        run: () => selectFilter(f.id),
      })),
  );
}

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
      id: "file.import-presets",
      label: "Import presets...",
      menu: "file",
      section: "presets",
      keywords: "presets settings import load json",
      run: chooseAndImportPresets,
    },
    {
      id: "file.export-presets",
      label: "Export all presets",
      menu: "file",
      section: "presets",
      keywords: "presets settings export save json",
      enabled: () => Object.values(useFilters.getState().presets).some((list) => list.length > 0),
      run: () => exportPresets(),
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
      enabled: () => canUndo(activeDocument()),
      run: () => {
        const doc = activeDocument();
        const step = doc?.steps[doc.index];
        if (!doc || !step || !canUndo(doc)) return;
        useDocuments.getState().undo(doc.id);
        announce(`Undid ${step.label}.`);
      },
    },
    {
      id: "edit.redo",
      label: "Redo",
      menu: "edit",
      shortcut: "Mod+Shift+Z",
      enabled: () => canRedo(activeDocument()),
      run: () => {
        const doc = activeDocument();
        const step = doc?.steps[doc.index + 1];
        if (!doc || !step) return;
        useDocuments.getState().redo(doc.id);
        announce(`Redid ${step.label}.`);
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
        if (!doc) return;
        useDocuments.getState().revert(doc.id);
        announce("Reverted to the original image.");
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
    {
      id: "edit.ai-providers",
      label: "AI providers...",
      menu: "edit",
      section: "preferences",
      keywords: "ai model provider api key consent remote engine",
      run: () => useUi.getState().setDialog("ai-providers"),
    },
    {
      id: "edit.ai-log",
      label: "AI request log...",
      menu: "edit",
      section: "preferences",
      keywords: "ai privacy sent requests log",
      run: () => useUi.getState().setDialog("ai-log"),
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
      id: "image.rotate-free",
      label: "Rotate by angle...",
      menu: "image",
      section: "rotate",
      keywords: "turn angle degrees straighten",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("image-rotate"),
    },
    ...(
      [
        ["denoise", "AI denoising", "noise grain clean ai model dncnn ffdnet learned"],
        ["jpeg-cleanup", "AI JPEG cleanup", "jpeg blocks artifacts compression ai model learned"],
        ["super-resolution", "AI super-resolution", "enlarge upscale ai model esrgan swin2sr"],
      ] as const
    ).map(([taskId, label, keywords]): Command => ({
      id: `image.ai-${taskId}`,
      label,
      menu: "image",
      section: "ai",
      keywords,
      enabled: hasDocument,
      run: () => void aiImage(taskId),
    })),
    {
      id: "image.resize",
      label: "Resize...",
      menu: "image",
      section: "size",
      keywords: "scale size resample bicubic lanczos smaller larger",
      shortcut: "Mod+Alt+I",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("image-resize"),
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
    // Select
    {
      id: "select.all",
      label: "Select all",
      menu: "select",
      section: "all",
      shortcut: "Mod+A",
      enabled: hasDocument,
      run: selectAll,
    },
    {
      id: "select.deselect",
      label: "Deselect",
      menu: "select",
      section: "all",
      shortcut: "Mod+D",
      keywords: "clear selection none",
      enabled: hasSelection,
      run: deselect,
    },
    {
      id: "select.reselect",
      label: "Reselect",
      menu: "select",
      section: "all",
      shortcut: "Mod+Shift+D",
      enabled: canReselect,
      run: reselect,
    },
    {
      id: "select.inverse",
      label: "Inverse",
      menu: "select",
      section: "all",
      shortcut: "Shift+F7",
      keywords: "invert selection",
      enabled: hasSelection,
      run: inverse,
    },
    {
      id: "select.enabled",
      label: "Use the selection",
      menu: "select",
      section: "use",
      keywords: "disable turn off selection for a while",
      enabled: hasSelection,
      checked: () => Boolean(activeDocument()?.selection && activeDocument()?.selectionEnabled),
      run: toggleSelectionEnabled,
    },
    {
      id: "select.color-range",
      label: "Color Range...",
      menu: "select",
      section: "global",
      keywords: "select color sample fuzziness highlights shadows midtones",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("select-color-range"),
    },
    {
      id: "select.brightness",
      label: "Select by brightness...",
      menu: "select",
      section: "global",
      keywords: "luminance luma tone range",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("select-brightness"),
    },
    {
      id: "select.hsv",
      label: "Select by hue and saturation...",
      menu: "select",
      section: "global",
      keywords: "hsv color hue saturation value",
      enabled: hasDocument,
      run: () => useUi.getState().setDialog("select-hsv"),
    },
    ...(Object.keys(REFINE) as RefineKind[]).map<Command>((kind) => ({
      id: `select.modify.${kind}`,
      label: `${REFINE[kind].title.replace(" selection", "")}...`,
      menu: "select",
      submenu: "Modify",
      section: "modify",
      keywords: `${kind} selection modify expand contract`,
      ...(kind === "feather" ? { shortcut: "Shift+F6" } : {}),
      enabled: hasSelection,
      run: () => {
        useSelection.getState().setRefineKind(kind);
        useUi.getState().setDialog("select-modify");
      },
    })),
    {
      id: "select.subject",
      label: "Subject",
      menu: "select",
      section: "auto",
      keywords: "subject object main thing saliency automatic",
      enabled: hasDocument,
      run: () => void selectSubject(false),
    },
    {
      id: "select.object",
      label: "Object",
      menu: "select",
      section: "auto",
      keywords: "object grabcut box classical cut out",
      enabled: hasSelection,
      run: () => void selectObject(),
    },
    {
      id: "select.background",
      label: "Background",
      menu: "select",
      section: "auto",
      keywords: "background sky backdrop automatic",
      enabled: hasDocument,
      run: () => void selectSubject(true),
    },
    {
      id: "select.ai-subject",
      label: "AI subject",
      menu: "select",
      section: "ai",
      keywords: "subject ai model learned u2net isnet cut out",
      enabled: hasDocument,
      run: () => void aiSelect("subject-select"),
    },
    {
      id: "select.ai-background",
      label: "AI background",
      menu: "select",
      section: "ai",
      keywords: "background ai model learned",
      enabled: hasDocument,
      run: () => void aiSelect("subject-select", true),
    },
    {
      id: "select.ai-object",
      label: "AI object",
      menu: "select",
      section: "ai",
      keywords: "object ai model sam box prompt",
      enabled: hasSelection,
      run: () => void aiSelect("object-select"),
    },
    {
      id: "select.ai-matting",
      label: "AI soft edges",
      menu: "select",
      section: "ai",
      keywords: "matting hair fur soft edge portrait alpha ai model modnet",
      enabled: hasDocument,
      run: () => void aiSelect("matting"),
    },
    {
      id: "select.modify.snap",
      label: "Snap to edges...",
      menu: "select",
      submenu: "Modify",
      section: "modify",
      keywords: "edge assisted snap refine boundary",
      enabled: hasSelection,
      run: () => useUi.getState().setDialog("select-snap"),
    },
    {
      id: "select.from-alpha",
      label: "Selection from alpha",
      menu: "select",
      section: "from",
      keywords: "transparency opacity mask",
      enabled: hasDocument,
      run: selectFromAlpha,
    },
    {
      id: "select.from-luminance",
      label: "Selection from luminance",
      menu: "select",
      section: "from",
      keywords: "brightness luma mask",
      enabled: hasDocument,
      run: selectFromLuminance,
    },
    {
      id: "select.save",
      label: "Save selection...",
      menu: "select",
      section: "masks",
      keywords: "named mask store channel",
      enabled: hasSelection,
      run: () => useUi.getState().setDialog("select-save"),
    },
    {
      id: "select.export-mask",
      label: "Export mask as PNG",
      menu: "select",
      section: "masks",
      keywords: "save mask file download",
      enabled: hasSelection,
      run: () => void exportMask(),
    },
    {
      id: "select.quick-mask",
      label: "Quick Mask",
      menu: "select",
      section: "view",
      shortcut: "Q",
      keywords: "tint overlay red mask view",
      checked: () => useSelection.getState().maskView === "quick-mask",
      run: () => {
        const { maskView, setMaskView } = useSelection.getState();
        setMaskView(maskView === "quick-mask" ? "ants" : "quick-mask");
      },
    },
    {
      id: "select.show-mask",
      label: "Show mask in gray",
      menu: "select",
      section: "view",
      keywords: "mask view grayscale",
      checked: () => useSelection.getState().maskView === "mask",
      run: () => {
        const { maskView, setMaskView } = useSelection.getState();
        setMaskView(maskView === "mask" ? "ants" : "mask");
      },
    },
    {
      id: "filter.apply",
      label: "Apply selected filter",
      menu: "filter",
      section: "apply",
      shortcut: "Mod+Enter",
      keywords: "run filter",
      enabled: () => {
        const entry = filterById(useFilters.getState().selectedId);
        return Boolean(
          entry && isRunnable(entry) && activeDocument() && !useFilters.getState().applying,
        );
      },
      run: () => void applySelected(),
    },
    {
      id: "filter.preview",
      label: "Preview",
      menu: "filter",
      section: "apply",
      keywords: "live preview filter",
      checked: () => useFilters.getState().previewOn,
      run: () => useFilters.getState().setPreviewOn(!useFilters.getState().previewOn),
    },
    {
      id: "filter.add-to-pipeline",
      label: "Add to pipeline",
      menu: "filter",
      section: "pipeline",
      keywords: "pipeline chain recipe step",
      enabled: () => filterById(useFilters.getState().selectedId) !== null,
      run: () => {
        addSelectedFilter();
        showPanel("pipeline");
      },
    },
    {
      id: "filter.run-pipeline",
      label: "Run pipeline",
      menu: "filter",
      section: "pipeline",
      keywords: "pipeline chain recipe run",
      enabled: () => hasDocument() && usePipeline.getState().steps.length > 0,
      run: () => void runPipelineOnActive(),
    },
    {
      id: "filter.metrics",
      label: "Quality metrics",
      menu: "filter",
      section: "apply",
      keywords: "psnr ssim mse mae compare reference noise",
      run: () => showPanel("metrics"),
    },
    {
      id: "filter.library",
      label: "Browse all filters",
      menu: "filter",
      section: "apply",
      keywords: "library catalog search",
      run: () => showPanel("library"),
    },
    ...filterCommands(),
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

/** Run a command by id, if it exists and is enabled. Buttons use this to share the menu's behavior. */
export function runCommand(id: string): void {
  const command = buildCommands().find((c) => c.id === id);
  if (command && isEnabled(command)) command.run();
}

export function isEnabled(command: Command): boolean {
  return command.enabled ? command.enabled() : true;
}
