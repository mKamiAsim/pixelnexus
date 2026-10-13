/**
 * Image > Resize and Image > Rotate by angle. The controls come from the catalog entries
 * catalog/filters/utility/resize.yaml and rotate-free.yaml. Width and height start at the
 * current image size each time the dialog opens.
 */
import { useId, useState } from "react";

import type { Filter } from "@/catalog";

import { entryParams } from "@/catalog/params";
import { ParamControl } from "@/components/params/ParamControl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { rotatedSize, type Interpolation, type ResizeMethod } from "@/core/image/resample";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { filterById } from "./filterActions";
import { resizeActive, rotateActive, type RotateFill } from "./geometryActions";
import { useFilterValues } from "./useFilterValues";

function entryOf(id: string): Filter {
  const entry = filterById(id);
  if (!entry) throw new Error(`The catalog has no "${id}" entry.`);
  return entry;
}

const RESIZE = entryOf("resize");
const ROTATE = entryOf("rotate-free");

export function GeometryDialogs() {
  return (
    <>
      <ResizeDialog />
      <RotateDialog />
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
