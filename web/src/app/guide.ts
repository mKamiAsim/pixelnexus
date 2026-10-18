/**
 * Image parameters: a filter such as the joint bilateral filter can take another open image as
 * its guide. The parameter holds the id of that image. This module turns it into pixels.
 */
import type { Filter } from "@/catalog";
import { entryParams } from "@/catalog/params";
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import { useDocuments, type ImageDocument } from "@/state/documents";

/**
 * The guide image for a run, or undefined when the entry has no image parameter, the parameter
 * names the active image, or the named image is closed or has another size. Then the filter
 * uses the active image itself.
 */
export function guideImageFor(
  entry: Filter,
  values: Readonly<Record<string, ParamValue>>,
  doc: ImageDocument,
): RgbaImage | undefined {
  const param = entryParams(entry).find((p) => p.type === "image");
  const id = param ? values[param.key] : undefined;
  if (typeof id !== "string" || id === "" || id === doc.id) return undefined;
  const other = useDocuments.getState().documents.find((d) => d.id === id);
  if (!other) return undefined;
  const { width, height } = other.current;
  return width === doc.current.width && height === doc.current.height ? other.current : undefined;
}
