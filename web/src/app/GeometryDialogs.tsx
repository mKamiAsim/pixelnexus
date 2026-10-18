/**
 * Image > Resize, Rotate by angle, Rotate and flip, and Crop. The controls come from the catalog
 * entries in catalog/filters/utility/: resize, rotate-free, rotate-flip and crop. Width and height
 * start at the current image size each time the dialog opens. The crop starts at the bounds of the
 * selection, or at the whole image.
 */
import { useId, useState } from "react";

import { runCommand } from "./commands";

import type { Filter } from "@/catalog";

import { entryParams } from "@/catalog/params";
import { ParamControl } from "@/components/params/ParamControl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { rotatedSize, type Interpolation, type ResizeMethod } from "@/core/image/resample";
import { maskBounds } from "@/core/mask/mask";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { filterById } from "./filterActions";
import {
  cropActive,
  resizeActive,
  ROTATE_FLIP_COMMANDS,
  rotateActive,
  type RotateFill,
} from "./geometryActions";
import { useFilterValues } from "./useFilterValues";

function entryOf(id: string): Filter {
  const entry = filterById(id);
  if (!entry) throw new Error(`The catalog has no "${id}" entry.`);
  return entry;
}

const RESIZE = entryOf("resize");
const ROTATE = entryOf("rotate-free");
const ROTATE_FLIP = entryOf("rotate-flip");
const CROP = entryOf("crop");

export function GeometryDialogs() {
  return (
    <>
      <ResizeDialog />
      <RotateDialog />
      <RotateFlipDialog />
      <CropDialog />
    </>
  );
}

function RotateFlipDialog() {
  const open = useUi((s) => s.dialog === "image-rotate-flip");
  const setDialog = useUi((s) => s.setDialog);
  const doc = useDocuments((s) => activeDocument(s));
  const entry = ROTATE_FLIP;
  const { values } = useFilterValues(entry);
  const setValue = useFilters((s) => s.setValue);
  const formId = useId();
  if (!doc) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "image-rotate-flip" : null)}
      title="Rotate and flip"
      description="Quarter turns and mirrors move whole pixels, so no value changes."
      className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Apply
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setDialog(null);
          runCommand(ROTATE_FLIP_COMMANDS[String(values.operation)] ?? "image.rotate-cw");
        }}
      >
        {entryParams(entry).map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={values[param.key] ?? param.default}
            onChange={(value) => setValue(entry.id, param.key, value)}
          />
        ))}
      </form>
    </Dialog>
  );
}

function CropDialog() {
  const open = useUi((s) => s.dialog === "image-crop");
  const setDialog = useUi((s) => s.setDialog);
  const doc = useDocuments((s) => activeDocument(s));
  if (!doc) return null;
  const bounds = doc.selection ? maskBounds(doc.selection) : null;
  const start = bounds ?? { x: 0, y: 0, width: doc.current.width, height: doc.current.height };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "image-crop" : null)}
      title="Crop"
      description={
        bounds
          ? "The rectangle starts at the bounds of the selection."
          : `The image is ${doc.current.width} x ${doc.current.height} pixels now.`
      }
      className="max-w-sm"
      focusField
    >
      <CropForm
        key={`${doc.id}-${start.x}-${start.y}-${start.width}-${start.height}`}
        start={start}
        imageWidth={doc.current.width}
        imageHeight={doc.current.height}
        onDone={() => setDialog(null)}
      />
    </Dialog>
  );
}

function CropForm({
  start,
  imageWidth,
  imageHeight,
  onDone,
}: {
  start: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
  onDone: () => void;
}) {
  const [rect, setRect] = useState(start);
  const formId = useId();
  const right = Math.min(imageWidth, rect.x + rect.width);
  const bottom = Math.min(imageHeight, rect.y + rect.height);
  const valid = rect.x < imageWidth && rect.y < imageHeight && right > rect.x && bottom > rect.y;
  return (
    <>
      <form
        id={formId}
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          cropActive(rect);
          onDone();
        }}
      >
        {entryParams(CROP).map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={rect[param.key as keyof typeof rect] ?? param.default}
            onChange={(value) => setRect((r) => ({ ...r, [param.key]: Number(value) }))}
          />
        ))}
        <p className="text-xs text-text-muted">
          {valid
            ? `The result is ${right - rect.x} x ${bottom - rect.y} pixels.`
            : "The rectangle lies outside the image."}
        </p>
      </form>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form={formId} disabled={!valid}>
          Crop
        </Button>
      </div>
    </>
  );
}

function ResizeDialog() {
  const open = useUi((s) => s.dialog === "image-resize");
  const setDialog = useUi((s) => s.setDialog);
  const doc = useDocuments((s) => activeDocument(s));
  if (!doc) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "image-resize" : null)}
      title="Resize image"
      description={`The image is ${doc.current.width} x ${doc.current.height} pixels now.`}
      className="max-w-sm"
      focusField
    >
      <ResizeForm
        key={`${doc.id}-${doc.current.width}x${doc.current.height}`}
        width={doc.current.width}
        height={doc.current.height}
        onDone={() => setDialog(null)}
      />
    </Dialog>
  );
}

function ResizeForm({
  width: startWidth,
  height: startHeight,
  onDone,
}: {
  width: number;
  height: number;
  onDone: () => void;
}) {
  const entry = RESIZE;
  const { values } = useFilterValues(entry);
  const setValue = useFilters((s) => s.setValue);
  const [size, setSize] = useState({ width: startWidth, height: startHeight });
  const formId = useId();
  const keep = values.keepRatio !== false;
  const params = entryParams(entry);
  const apply = () => {
    resizeActive(size.width, size.height, String(values.method) as ResizeMethod);
    onDone();
  };
  return (
    <>
      <form
        id={formId}
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        {params.map((param) => {
          if (param.key === "width" || param.key === "height") {
            const other = param.key === "width" ? "height" : "width";
            return (
              <ParamControl
                key={param.key}
                param={param}
                value={size[param.key]}
                onChange={(value) => {
                  const v = Number(value);
                  setSize((s) => {
                    const next = { ...s, [param.key]: v };
                    if (keep) {
                      // Keep the shape of the original image.
                      const ratio =
                        other === "height" ? startHeight / startWidth : startWidth / startHeight;
                      next[other] = Math.max(1, Math.round(v * ratio));
                    }
                    return next;
                  });
                }}
              />
            );
          }
          return (
            <ParamControl
              key={param.key}
              param={param}
              value={values[param.key] ?? param.default}
              onChange={(value) => setValue(entry.id, param.key, value)}
            />
          );
        })}
        <p className="text-xs text-text-muted">
          {Math.round((size.width / startWidth) * 1000) / 10}% wide and{" "}
          {Math.round((size.height / startHeight) * 1000) / 10}% high.
        </p>
      </form>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form={formId}>
          Resize
        </Button>
      </div>
    </>
  );
}

function RotateDialog() {
  const open = useUi((s) => s.dialog === "image-rotate");
  const setDialog = useUi((s) => s.setDialog);
  const doc = useDocuments((s) => activeDocument(s));
  const entry = ROTATE;
  const { values } = useFilterValues(entry);
  const setValue = useFilters((s) => s.setValue);
  const formId = useId();
  if (!doc) return null;
  const degrees = Number(values.angle ?? 0);
  const expand = values.canvas !== "keep";
  const [w, h] = expand
    ? rotatedSize(doc.current.width, doc.current.height, degrees)
    : [doc.current.width, doc.current.height];
  const apply = () => {
    rotateActive(
      degrees,
      String(values.interpolation) as Interpolation,
      expand,
      String(values.fill) as RotateFill,
    );
    setDialog(null);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "image-rotate" : null)}
      title="Rotate by angle"
      description="Positive angles turn the image counterclockwise."
      className="max-w-sm"
      focusField
      footer={
        <>
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Rotate
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        {entryParams(entry).map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={values[param.key] ?? param.default}
            onChange={(value) => setValue(entry.id, param.key, value)}
          />
        ))}
        <p className="text-xs text-text-muted">
          The result is {w} x {h} pixels.
        </p>
      </form>
    </Dialog>
  );
}
