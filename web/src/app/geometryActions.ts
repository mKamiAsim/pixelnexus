/**
 * Resize and free rotation of the active image. They change the image size, so they run as
 * Image menu commands with a dialog, not through the tiled filter engine. Their catalog entries
 * (catalog/filters/utility/resize.yaml and rotate-free.yaml) name the command that runs them.
 */
import type { ParamValue } from "@/core/filters/types";
import {
  resizeImageTo,
  rotateImage,
  type Interpolation,
  type ResizeMethod,
} from "@/core/image/resample";
import type { RgbaImage } from "@/core/image/types";
import { createMask, maskToImage, type Mask } from "@/core/mask/mask";
import { activeDocument, useDocuments } from "@/state/documents";
import { announce } from "@/state/notifications";
import { useUi, type DialogId } from "@/state/ui";

import { showPanel } from "./layout";

/** The dialog behind each command that a catalog entry can name. */
const COMMAND_DIALOGS: Readonly<Record<string, DialogId>> = {
  "image.resize": "image-resize",
  "image.rotate-free": "image-rotate",
};

/** Run the studio command a catalog entry names. Returns false for an unknown command. */
export function runEntryCommand(command: string): boolean {
  if (command === "filter.metrics") {
    showPanel("metrics");
    return true;
  }
  const dialog = COMMAND_DIALOGS[command];
  if (!dialog) return false;
  useUi.getState().setDialog(dialog);
  return true;
}

const METHOD_NAMES: Record<ResizeMethod, string> = {
  nearest: "nearest",
  bilinear: "bilinear",
  bicubic: "bicubic",
  lanczos: "Lanczos",
};

/**
 * A mask from a gray picture of a mask that was resized or turned: the gray value times alpha.
 * Pixels that came from outside the old mask are transparent, so they are unselected.
 */
function maskFromGray(image: RgbaImage): Mask {
  const out = createMask(image.width, image.height);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.round(((image.data[i * 4] ?? 0) * (image.data[i * 4 + 3] ?? 0)) / 255);
  }
  return out;
}

/** Resize the active image. The selection is scaled with it, with bilinear weights. */
export function resizeActive(width: number, height: number, method: ResizeMethod): void {
  const doc = activeDocument();
  if (!doc) return;
  const image = resizeImageTo(doc.current, width, height, method);
  const selection = doc.selection
    ? maskFromGray(resizeImageTo(maskToImage(doc.selection), width, height, "bilinear"))
    : undefined;
  const label = `Resize to ${width} x ${height} (${METHOD_NAMES[method]})`;
  const params: Record<string, ParamValue> = { width, height, method };
  useDocuments.getState().edit(doc.id, image, label, { id: "resize", params }, selection);
  announce(`${label} applied. The image is ${width} by ${height} pixels.`);
}

export type RotateFill = "transparent" | "white" | "black";
const FILLS: Record<RotateFill, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 255],
  black: [0, 0, 0, 255],
};

/** Rotate the active image counterclockwise. The selection turns with it. */
export function rotateActive(
  degrees: number,
  interpolation: Interpolation,
  expand: boolean,
  fill: RotateFill,
): void {
  const doc = activeDocument();
  if (!doc) return;
  const image = rotateImage(doc.current, degrees, { interpolation, expand, fill: FILLS[fill] });
  // The new corners of the selection are always unselected, whatever the fill.
  let selection: Mask | undefined;
  if (doc.selection) {
    const turned = rotateImage(maskToImage(doc.selection), degrees, {
      interpolation: "bilinear",
      expand,
      fill: [0, 0, 0, 0],
    });
    selection = maskFromGray(turned);
  }
  const label = `Rotate ${Number(degrees.toFixed(2))} degrees (${interpolation})`;
  const params: Record<string, ParamValue> = {
    angle: degrees,
    interpolation,
    canvas: expand ? "expand" : "keep",
    fill,
  };
  useDocuments.getState().edit(doc.id, image, label, { id: "rotate-free", params }, selection);
  announce(`${label} applied. The image is ${image.width} by ${image.height} pixels.`);
}
