import { Download, Keyboard, Redo2, Search, Undo2, Upload } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { activeDocument, canRedo, canUndo, useDocuments } from "@/state/documents";
import { notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { CommandPalette } from "./CommandPalette";
import { runCommand } from "./commands";
import { ExportDialog } from "./ExportDialog";
import { ACCEPTED_FILES, openFiles, pastedImageFiles, registerFilePicker } from "./importer";
import { applyPreset, currentPreset, onPanelsChange, PRESETS, type PresetId } from "./layout";
import { MenuBar } from "./MenuBar";
import { startPreview } from "./preview";
import { Notices } from "./Notices";
import { OptionsBar } from "./OptionsBar";
import { PreferencesDialog } from "./PreferencesDialog";
import { ShortcutSheet } from "./ShortcutSheet";
import { displayShortcut } from "./shortcuts";
import { StatusBar } from "./StatusBar";
import { ToolStrip } from "./ToolStrip";
import { isTyping, useGlobalKeys } from "./useGlobalKeys";
import { Workspace } from "./Workspace";

function Logo() {
  return (
    <span className="mr-2 flex shrink-0 items-center gap-1.5 text-sm font-semibold">
      <span aria-hidden className="grid size-4 grid-cols-2 gap-px">
        <span className="rounded-[1px] bg-accent" />
        <span className="rounded-[1px] bg-text-muted" />
        <span className="rounded-[1px] bg-text-muted" />
        <span className="rounded-[1px] bg-text" />
      </span>
      <h1 className="text-sm font-semibold">Pixel Nexus</h1>
    </span>
  );
}

function HeaderActions() {
  const doc = useDocuments((s) => activeDocument(s));
  const setDialog = useUi((s) => s.setDialog);
  const preset = useSyncExternalStore(
    onPanelsChange,
    currentPreset,
    () => "essentials" as PresetId,
  );
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <IconButton
        label="Undo"
        shortcut={displayShortcut("Mod+Z")}
        icon={<Undo2 size={15} />}
        size="sm"
        disabled={!canUndo(doc)}
        onClick={() => runCommand("edit.undo")}
      />
      <IconButton
        label="Redo"
        shortcut={displayShortcut("Mod+Shift+Z")}
        icon={<Redo2 size={15} />}
        size="sm"
        disabled={!canRedo(doc)}
        onClick={() => runCommand("edit.redo")}
      />
      <IconButton
        label="Export"
        shortcut={displayShortcut("Mod+S")}
        icon={<Download size={15} />}
        size="sm"
        disabled={!doc}
        onClick={() => setDialog("export")}
      />
      <span className="mx-1 h-4 w-px bg-border" />
      <IconButton
        label="Command palette"
        shortcut={displayShortcut("Mod+K")}
        icon={<Search size={15} />}
        size="sm"
        onClick={() => setDialog("palette")}
      />
      <IconButton
        label="Keyboard shortcuts"
        shortcut={displayShortcut("Mod+Slash")}
        icon={<Keyboard size={15} />}
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => setDialog("shortcuts")}
      />
      <Select
        label="Workspace"
        size="sm"
        value={preset}
        onChange={(value) => applyPreset(value as PresetId)}
        options={PRESETS.map((p) => ({ value: p.id, label: `Workspace: ${p.name}` }))}
        className="hidden w-44 md:inline-flex"
      />
    </div>
  );
}

/** Drag files over the window to open them. Panel drags inside the workspace are ignored. */
function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void openFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}

/** Paste an image with Ctrl+V or Cmd+V anywhere outside a text field. */
function usePaste(): void {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const files = pastedImageFiles(event.clipboardData);
      event.preventDefault();
      if (files.length > 0) void openFiles(files, "paste");
      else notify("info", "The clipboard has no image.", "Copy an image first, then paste.");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
}

/** The studio shell: menus, tool options, tools, the docking workspace and the status bar. */
export function App() {
  useGlobalKeys();
  usePaste();
  const dragging = useFileDrop();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerFilePicker(() => fileInput.current?.click());
    return () => registerFilePicker(null);
  }, []);

  // Keep the filter preview in step with the selected filter, its values and the view.
  useEffect(() => startPreview(), []);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden bg-app text-text">
        <header className="flex h-8 shrink-0 items-center gap-1 border-b border-border-subtle bg-panel px-2">
          <Logo />
          <MenuBar />
          <HeaderActions />
        </header>
        <OptionsBar />
        <main className="flex min-h-0 flex-1">
          <ToolStrip />
          <Workspace />
        </main>
        <StatusBar />
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void openFiles(files);
        }}
      />
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 p-6">
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-accent bg-overlay px-10 py-8 text-center shadow-popover">
            <Upload size={28} className="text-accent-fg" aria-hidden />
            <span className="text-base font-semibold">Drop images to open them</span>
            <span className="text-xs text-text-secondary">
              Images are processed locally in your browser.
            </span>
          </div>
        </div>
      ) : null}
      <Notices />
      <CommandPalette />
      <ShortcutSheet />
      <ExportDialog />
      <PreferencesDialog />
    </TooltipProvider>
  );
}
