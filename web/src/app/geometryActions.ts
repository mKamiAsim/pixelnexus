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
import { clampCrop, crop, type CropRect } from "@/core/image/transform";
import { createMask, cropMask, maskToImage, type Mask } from "@/core/mask/mask";
import { activeDocument, useDocuments } from "@/state/documents";
import { announce } from "@/state/notifications";
import { useUi, type DialogId } from "@/state/ui";

import { showPanel } from "./layout";

/** The dialog behind each command that a catalog entry can name. */
const COMMAND_DIALOGS: Readonly<Record<string, DialogId>> = {
  "image.resize": "image-resize",
  "image.rotate-free": "image-rotate",
  "image.rotate-flip": "image-rotate-flip",
  "image.crop": "image-crop",
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

/** A selection scaled to a new image size, with bilinear weights. */
export function scaleSelection(selection: Mask, width: number, height: number): Mask {
  return maskFromGray(resizeImageTo(maskToImage(selection), width, height, "bilinear"));
}

/** Resize the active image. The selection is scaled with it, with bilinear weights. */
export function resizeActive(width: number, height: number, method: ResizeMethod): void {
  const doc = activeDocument();
  if (!doc) return;
  const image = resizeImageTo(doc.current, width, height, method);
  const selection = doc.selection ? scaleSelection(doc.selection, width, height) : undefined;
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

/** Crop the active image to the rectangle, cut to the image. The selection is cropped with it. */
export function cropActive(rect: CropRect): void {
  const doc = activeDocument();
  if (!doc) return;
  const inside = clampCrop(rect, doc.current.width, doc.current.height);
  if (!inside) return;
  const image = crop(doc.current, inside);
  const selection = doc.selection ? cropMask(doc.selection, inside) : undefined;
  const label = `Crop to ${inside.width} x ${inside.height} at x ${inside.x}, y ${inside.y}`;
  const params: Record<string, ParamValue> = { ...inside };
  useDocuments.getState().edit(doc.id, image, label, { id: "crop", params }, selection);
  announce(`${label} applied. The image is ${inside.width} by ${inside.height} pixels.`);
}

/** The quarter turns and mirrors of Rotate and flip, by the commands of the Image menu. */
export const ROTATE_FLIP_COMMANDS: Readonly<Record<string, string>> = {
  cw: "image.rotate-cw",
  ccw: "image.rotate-ccw",
  half: "image.rotate-180",
  horizontal: "image.flip-h",
  vertical: "image.flip-v",
};
