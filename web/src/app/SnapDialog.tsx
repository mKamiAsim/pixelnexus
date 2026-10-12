import { useId } from "react";

import { entryParams } from "@/catalog/params";
import { ParamControl } from "@/components/params/ParamControl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { toolEntry, useToolValues } from "@/selection/values";
import { useSelection } from "@/state/selection";
import { useUi } from "@/state/ui";

import { snapSelection } from "./selectionActions";

const TOOL = "edge-assisted";
const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);

/** Select > Modify > Snap to edges. Its settings come from catalog/tools/edge-assisted.yaml. */
export function SnapDialog() {
  const open = useUi((s) => s.dialog === "select-snap");
  const setDialog = useUi((s) => s.setDialog);
  const values = useToolValues(TOOL);
  const setValue = useSelection((s) => s.setValue);
  const resetValues = useSelection((s) => s.resetValues);
  const formId = useId();
  const entry = toolEntry(TOOL);
  if (!entry) return null;

  const apply = () => {
    snapSelection({
      radius: num(values.radius, 8),
      contrast: num(values.contrast, 10),
      smoothing: num(values.smoothing, 1),
    });
    setDialog(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "select-snap" : null)}
      title="Snap to edges"
      description="Moves the edge of the selection onto the nearest clear edge in the image. The result has a hard edge, softened by one pixel."
      className="max-w-sm"
      focusField
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => resetValues(TOOL)}>
            Reset
          </Button>
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            OK
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
            onChange={(value) => setValue(TOOL, param.key, value)}
          />
        ))}
      </form>
    </Dialog>
  );
}
