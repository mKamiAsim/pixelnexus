import { clsx } from "clsx";
import { AlertTriangle, FolderOpen, X } from "lucide-react";

import { formatBytes, formatSize } from "@/app/format";
import { chooseFiles } from "@/app/importer";
import { Button } from "@/components/ui/Button";
import { PanelSection } from "@/components/ui/Panel";
import type { ImageHeader } from "@/core/image/format";
import { activeDocument, useDocuments, type ImageDocument } from "@/state/documents";

import { Thumbnail } from "./Thumbnail";

const FORMAT_NAMES: Record<ImageHeader["format"], string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  gif: "GIF",
  bmp: "BMP",
  tiff: "TIFF",
  avif: "AVIF",
};

const COLOR_MODELS: Record<NonNullable<ImageHeader["colorModel"]>, string> = {
  gray: "Grayscale",
  rgb: "RGB",
  palette: "Indexed (palette)",
  cmyk: "CMYK",
  ycbcr: "YCbCr",
};

function formatLabel(doc: ImageDocument): string {
  if (doc.source === "sample") return "Test image";
  return doc.header ? FORMAT_NAMES[doc.header.format] : "Image";
}

/** Open images with thumbnails, and the facts about the active one. */
export function ImagesPanel() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const activate = useDocuments((s) => s.activate);
  const close = useDocuments((s) => s.close);
  const active = useDocuments((s) => activeDocument(s));

  if (documents.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-3 p-3 text-sm text-text-secondary">
        <p>No images are open.</p>
        <Button size="sm" onClick={chooseFiles}>
          <FolderOpen size={14} /> Open file
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <ul aria-label="Open images" className="flex flex-col gap-0.5 p-1">
        {documents.map((doc) => {
          const isActive = doc.id === activeId;
          return (
            <li key={doc.id} className="group relative">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => activate(doc.id)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-control p-1.5 pr-7 text-left",
                  isActive ? "bg-accent-subtle" : "hover:bg-hover",
                )}
              >
                <Thumbnail image={doc.current} max={40} label="" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-text">{doc.name}</span>
                  <span className="tabular truncate text-xs text-text-muted">
                    {formatSize(doc.current)} · {formatLabel(doc)}
                    {doc.fileBytes > 0 ? ` · ${formatBytes(doc.fileBytes)}` : ""}
                  </span>
                </span>
                {doc.warnings.length > 0 ? (
                  <AlertTriangle
                    size={13}
                    className="ml-auto shrink-0 text-warning"
                    aria-label="Opened with notes"
                  />
                ) : null}
              </button>
              <button
                type="button"
                aria-label={`Close ${doc.name}`}
                onClick={() => close(doc.id)}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-[3px] p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-text focus-visible:opacity-100"
              >
                <X size={12} />
              </button>
            </li>
          );
        })}
      </ul>
      {active ? <Metadata doc={active} /> : null}
    </div>
  );
}

function Metadata({ doc }: { doc: ImageDocument }) {
  const { header } = doc;
  const rows: [string, string][] = [
    ["Name", doc.name],
    [
      "Source",
      doc.source === "sample" ? "Built-in test image" : doc.source === "paste" ? "Pasted" : "File",
    ],
  ];
  if (header) {
    rows.push(["Format", FORMAT_NAMES[header.format]]);
    rows.push(["File size", formatBytes(doc.fileBytes)]);
    rows.push(["Stored size", formatSize(header)]);
    if (header.colorModel) rows.push(["Color mode", COLOR_MODELS[header.colorModel]]);
    if (header.channels !== undefined) rows.push(["Channels in file", String(header.channels)]);
    if (header.bitDepth !== undefined)
      rows.push(["Bit depth in file", `${header.bitDepth} bits per channel`]);
    rows.push([
      "Alpha in file",
      header.hasAlpha ? "Yes" : header.hasAlpha === false ? "No" : "Not stated",
    ]);
    rows.push([
      "Color profile",
      header.hasColorProfile ? (header.colorProfileName ?? "Embedded, no name") : "None",
    ]);
    if ((header.frames ?? 1) > 1)
      rows.push([header.format === "tiff" ? "Pages" : "Frames", String(header.frames)]);
    if (header.orientation !== undefined && header.orientation !== 1) {
      rows.push(["EXIF orientation", String(header.orientation)]);
    }
  }
  rows.push(["Working size", formatSize(doc.current)]);
  rows.push(["Working format", "8-bit RGBA, sRGB"]);
  if (doc.decodePath) {
    rows.push([
      "Pixels read by",
      doc.decodePath === "webgl2"
        ? "WebGL2 (exact)"
        : doc.decodePath === "utif"
          ? "TIFF decoder (exact)"
          : "2D canvas (semi-transparent colors may round)",
    ]);
  }

  return (
    <div className="border-t border-border-subtle">
      <PanelSection title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-text-muted">{term}</dt>
              <dd className="tabular min-w-0 break-words text-text">{value}</dd>
            </div>
          ))}
        </dl>
        {doc.warnings.length > 0 ? (
          <ul aria-label="Notes about this file" className="flex flex-col gap-1.5">
            {doc.warnings.map((warning) => (
              <li key={warning.code} className="flex gap-1.5 text-xs text-text-secondary">
                <AlertTriangle size={13} className="mt-px shrink-0 text-warning" aria-hidden />
                {warning.message}
              </li>
            ))}
          </ul>
        ) : null}
      </PanelSection>
    </div>
  );
}
