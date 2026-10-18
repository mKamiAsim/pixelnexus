/** File names and sizes for export. Pure helpers, tested in export-names.test.ts. */

export type ExportFormat = "png" | "jpeg" | "webp" | "tiff";

export interface ExportFormatInfo {
  readonly id: ExportFormat;
  readonly label: string;
  readonly mime: string;
  readonly extension: string;
  readonly lossy: boolean;
  readonly keepsAlpha: boolean;
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { id: "png", label: "PNG", mime: "image/png", extension: "png", lossy: false, keepsAlpha: true },
  {
    id: "jpeg",
    label: "JPEG",
    mime: "image/jpeg",
    extension: "jpg",
    lossy: true,
    keepsAlpha: false,
  },
  {
    id: "webp",
    label: "WebP",
    mime: "image/webp",
    extension: "webp",
    lossy: true,
    keepsAlpha: true,
  },
  {
    id: "tiff",
    label: "TIFF",
    mime: "image/tiff",
    extension: "tif",
    lossy: false,
    keepsAlpha: true,
  },
];

export function formatInfo(id: ExportFormat): ExportFormatInfo {
  const info = EXPORT_FORMATS.find((format) => format.id === id);
  if (!info) throw new RangeError(`Unknown export format ${id}`);
  return info;
}

/** The name without its last extension. */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Keep letters, digits, dot, hyphen and underscore. Everything else becomes a hyphen. */
export function sanitizeFilePart(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
}

/**
 * A meaningful export name, for example "photo_gaussian-blur_sigma-2.png".
 * The suffix describes the last operation. It is empty until filters exist (Phase 3).
 */
export function exportFileName(sourceName: string, format: ExportFormat, suffix = ""): string {
  const leaf = sourceName.split(/[\\/]/).pop() ?? "";
  const base = sanitizeFilePart(stripExtension(leaf)) || "image";
  const tail = sanitizeFilePart(suffix);
  return `${base}${tail ? `_${tail}` : ""}.${formatInfo(format).extension}`;
}

/** Scale a size to a new width or height. With keepAspect, the other side follows. */
export function resizeTo(
  size: { width: number; height: number },
  target: { width?: number; height?: number },
  keepAspect = true,
): { width: number; height: number } {
  const clamp = (v: number) => Math.max(1, Math.round(v));
  if (!keepAspect) {
    return {
      width: clamp(target.width ?? size.width),
      height: clamp(target.height ?? size.height),
    };
  }
  if (target.width !== undefined) {
    return { width: clamp(target.width), height: clamp((target.width * size.height) / size.width) };
  }
  if (target.height !== undefined) {
    return {
      width: clamp((target.height * size.width) / size.height),
      height: clamp(target.height),
    };
  }
  return { ...size };
}
