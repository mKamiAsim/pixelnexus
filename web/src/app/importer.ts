/** Open images from files, the clipboard or the built-in samples. */
import { SYNTHETIC_IMAGES } from "@/core/image/synthetic";
import { decodeInWorker } from "@/core/workers/decode-client";
import { useDocuments } from "@/state/documents";
import { notify } from "@/state/notifications";
import { useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";

let pickerOpener: (() => void) | null = null;

/** The shell registers its hidden file input here, so commands can open the picker. */
export function registerFilePicker(open: (() => void) | null): void {
  pickerOpener = open;
}

export function chooseFiles(): void {
  pickerOpener?.();
}

let pastedCount = 0;

/**
 * Open each file in turn. Files that are not images, or that break the limits, get a clear
 * error message and do not stop the others.
 */
export async function openFiles(
  files: Iterable<File>,
  source: "file" | "paste" = "file",
): Promise<void> {
  const list = [...files];
  if (list.length === 0) return;
  const { beginWork, endWork } = useUi.getState();
  beginWork(list.length === 1 ? "Opening 1 image" : `Opening ${list.length} images`);
  try {
    for (const file of list) {
      const name = file.name || `Pasted image ${++pastedCount}.png`;
      try {
        const decoded = await decodeInWorker(
          await file.arrayBuffer(),
          useSettings.getState().limits,
        );
        useDocuments.getState().open({
          name,
          source,
          fileBytes: file.size,
          header: decoded.header,
          warnings: decoded.warnings,
          decodePath: decoded.path,
          original: decoded.image,
        });
        const { width, height } = decoded.image;
        if (decoded.warnings.length > 0) {
          notify(
            "warning",
            `Opened ${name} with notes`,
            decoded.warnings.map((w) => w.message).join(" "),
          );
        } else {
          notify("success", `Opened ${name}`, `${width} x ${height} pixels.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "The file could not be opened.";
        notify("error", `Could not open ${name}`, message);
      }
    }
  } finally {
    endWork();
  }
}

export function openSample(id: string): void {
  const sample = SYNTHETIC_IMAGES.find((s) => s.id === id);
  if (!sample) return;
  const image = sample.make();
  useDocuments.getState().open({
    name: `${sample.name}.png`,
    source: "sample",
    fileBytes: 0,
    header: null,
    warnings: [],
    original: image,
  });
  notify(
    "success",
    `Opened test image: ${sample.name}`,
    `${image.width} x ${image.height} pixels.`,
  );
}

/** Read an image from the clipboard. Browsers ask for permission the first time. */
export async function pasteFromClipboard(): Promise<void> {
  if (!navigator.clipboard?.read) {
    notify("info", "Press Ctrl+V to paste", "This browser only allows pasting with the keyboard.");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        const blob = await item.getType(type);
        files.push(
          new File([blob], `Pasted image ${++pastedCount}.${type.split("/")[1] ?? "png"}`, {
            type,
          }),
        );
      }
    }
    if (files.length === 0) notify("info", "The clipboard has no image.");
    else await openFiles(files, "paste");
  } catch {
    notify("info", "Press Ctrl+V to paste", "The browser did not allow reading the clipboard.");
  }
}

/** The image files in a paste event. Text and other content are ignored. */
export function pastedImageFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** File picker filter. The decoder checks the real format from the bytes, not the name. */
export const ACCEPTED_FILES = "image/*,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.tif,.tiff";
