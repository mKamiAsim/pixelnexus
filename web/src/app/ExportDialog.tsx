import { Info } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { NumberField } from "@/components/ui/NumberField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_QUALITY, encodeImage, hasTransparency } from "@/core/image/encode";
import {
  EXPORT_FORMATS,
  exportFileName,
  formatInfo,
  resizeTo,
  sanitizeFilePart,
  stripExtension,
  type ExportFormat,
} from "@/core/image/export-names";
import { resizeImage } from "@/core/image/resize";
import { activeDocument, useDocuments, type ImageDocument } from "@/state/documents";
import { notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

import { formatBytes } from "./format";

/** Export choices are kept for the session, so a second export starts where the first ended. */
let lastFormat: ExportFormat = "png";
let lastQuality = Math.round(DEFAULT_QUALITY * 100);

/** Save a file through the browser's download. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog() {
  const open = useUi((s) => s.dialog === "export");
  const setDialog = useUi((s) => s.setDialog);
  const doc = useDocuments((s) => activeDocument(s));
  return (
    <Dialog
      open={open && doc !== null}
      onOpenChange={(next) => setDialog(next ? "export" : null)}
      title="Export image"
      description={doc ? `${doc.name}, ${doc.current.width} x ${doc.current.height} px` : undefined}
    >
      {open && doc ? <ExportForm doc={doc} onDone={() => setDialog(null)} /> : null}
    </Dialog>
  );
}

function ExportForm({ doc, onDone }: { doc: ImageDocument; onDone: () => void }) {
  const image = doc.current;
  const [format, setFormat] = useState<ExportFormat>(lastFormat);
  const [quality, setQuality] = useState(lastQuality);
  const [resize, setResize] = useState(false);
  const [keepAspect, setKeepAspect] = useState(true);
  const [size, setSize] = useState({ width: image.width, height: image.height });
  const [baseName, setBaseName] = useState(() => stripExtension(exportFileName(doc.name, "png")));
  const [busy, setBusy] = useState(false);
  const info = formatInfo(format);
  const transparent = useMemo(() => hasTransparency(image), [image]);
  const fileName = `${sanitizeFilePart(baseName) || "image"}.${info.extension}`;

  const run = async () => {
    setBusy(true);
    lastFormat = format;
    lastQuality = quality;
    try {
      const output = resize ? await resizeImage(image, size.width, size.height) : image;
      const blob = await encodeImage(output, { format, quality: quality / 100 });
      download(blob, fileName);
      notify(
        "success",
        `Exported ${fileName}`,
        `${output.width} x ${output.height} px, ${formatBytes(blob.size)}.`,
      );
      onDone();
    } catch (error) {
      notify(
        "error",
        "Export failed",
        error instanceof Error ? error.message : "The file could not be written.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <span id="export-format" className="text-xs font-medium text-text-secondary">
            Format
          </span>
          <SegmentedControl
            label="Format"
            value={format}
            onChange={(value) => setFormat(value as ExportFormat)}
            segments={EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
            fullWidth
          />
        </div>

        {info.lossy ? (
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="w-14 shrink-0 font-medium">Quality</span>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              aria-label="Quality"
              className="min-w-0 flex-1 accent-[var(--px-accent)]"
            />
            <NumberField
              label="Quality value"
              value={quality}
              onChange={setQuality}
              min={1}
              max={100}
              integer
              size="sm"
              className="w-16"
            />
          </label>
        ) : null}

        <div className="flex flex-col gap-2">
          <Switch label="Resize" checked={resize} onChange={setResize} />
          {resize ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
              <span className="flex items-center gap-1.5">
                Width
                <NumberField
                  label="Width in pixels"
                  value={size.width}
                  onChange={(width) => setSize(resizeTo(image, { width }, keepAspect))}
                  min={1}
                  max={16384}
                  integer
                  unit="px"
                  size="sm"
                  className="w-24"
                />
              </span>
              <span className="flex items-center gap-1.5">
                Height
                <NumberField
                  label="Height in pixels"
                  value={size.height}
                  onChange={(height) =>
                    setSize(keepAspect ? resizeTo(image, { height }, true) : { ...size, height })
                  }
                  min={1}
                  max={16384}
                  integer
                  unit="px"
                  size="sm"
                  className="w-24"
                />
              </span>
              <div className="w-40">
                <Switch label="Keep proportions" checked={keepAspect} onChange={setKeepAspect} />
              </div>
            </div>
          ) : null}
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-secondary">
          File name
          <span className="flex h-7 items-center rounded-control border border-border-control bg-raised focus-within:outline-2 focus-within:outline-focus">
            <input
              value={baseName}
              onChange={(event) => setBaseName(event.target.value)}
              aria-label="File name without extension"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-normal text-text outline-none"
            />
            <span className="pr-2 text-sm font-normal text-text-muted">.{info.extension}</span>
          </span>
        </label>

        <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
          {format === "jpeg" && transparent ? (
            <Note>JPEG has no transparency. Transparent areas become white.</Note>
          ) : null}
          {format === "png" ? (
            <Note>PNG keeps every pixel value exactly, including transparency.</Note>
          ) : null}
          {format === "tiff" ? (
            <Note>TIFF is written uncompressed, so files are large.</Note>
          ) : null}
          {resize ? <Note>Resizing uses the browser's high-quality resampling.</Note> : null}
          <Note>Metadata is removed. The file has no EXIF, GPS, camera or color profile data.</Note>
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Exporting" : `Export ${info.label}`}
        </Button>
      </div>
    </form>
  );
}

function Note({ children }: { children: string }) {
  return (
    <li className="flex gap-1.5">
      <Info size={13} className="mt-px shrink-0 text-text-muted" aria-hidden />
      {children}
    </li>
  );
}
