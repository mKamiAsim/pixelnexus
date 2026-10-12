import { ClipboardPaste, FolderOpen, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { chooseFiles, openSample, pasteFromClipboard } from "@/app/importer";
import { displayShortcut } from "@/app/shortcuts";
import { Button } from "@/components/ui/Button";
import { SYNTHETIC_IMAGES } from "@/core/image/synthetic";

import { Thumbnail } from "./Thumbnail";

/** Shown in the canvas when no image is open. */
export function EmptyState() {
  const previews = useMemo(
    () => SYNTHETIC_IMAGES.map((s) => ({ ...s, image: s.make(96, 96) })),
    [],
  );
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-canvas p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 rounded-panel border border-border bg-panel p-6 shadow-popover">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Open an image to start</h2>
          <p className="text-sm text-text-secondary">
            Drop image files anywhere in this window, or use the buttons below. PNG, JPEG, WebP,
            AVIF, GIF, BMP and TIFF are supported.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={chooseFiles}>
            <FolderOpen size={15} /> Open file
            <span className="text-xs opacity-80">{displayShortcut("Mod+O")}</span>
          </Button>
          <Button onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste size={15} /> Paste
            <span className="text-xs text-text-muted">{displayShortcut("Mod+V")}</span>
          </Button>
        </div>
        <section aria-labelledby="samples-heading" className="flex flex-col gap-2">
          <h3 id="samples-heading" className="text-sm font-semibold">
            Or try a test image
          </h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {previews.map((sample) => (
              <li key={sample.id}>
                <button
                  type="button"
                  onClick={() => openSample(sample.id)}
                  className="flex w-full items-center gap-2.5 rounded-control border border-border-subtle p-2 text-left hover:border-border hover:bg-hover"
                >
                  <Thumbnail image={sample.image} max={40} label="" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{sample.name}</span>
                    <span className="truncate text-xs text-text-muted">{sample.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <ShieldCheck size={14} className="text-success" />
          Images are processed locally in your browser.
        </p>
      </div>
    </div>
  );
}
