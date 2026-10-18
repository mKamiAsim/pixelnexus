import { useId } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ScrubSlider } from "@/components/ui/ScrubSlider";
import { Switch } from "@/components/ui/Switch";
import { useSelection } from "@/state/selection";
import { useUi } from "@/state/ui";

import { REFINE, refineSelection } from "./selectionActions";

/** Select > Modify: grow, shrink, feather, smooth or border the selection by a distance. */
export function RefineDialog() {
  const open = useUi((s) => s.dialog === "select-modify");
  const setDialog = useUi((s) => s.setDialog);
  const kind = useSelection((s) => s.refineKind);
  const stored = useSelection((s) => s.refineAmounts[kind]);
  const setAmount = useSelection((s) => s.setRefineAmount);
  const edges = useSelection((s) => s.shrinkEdges);
  const setEdges = useSelection((s) => s.setShrinkEdges);
  const formId = useId();
  const spec = REFINE[kind];
  const amount = stored ?? spec.fallback;

  const apply = () => {
    refineSelection(kind, amount, edges);
    setDialog(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "select-modify" : null)}
      title={spec.title}
      description={spec.help}
      className="max-w-sm"
      focusField
      footer={
        <>
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
        className="flex flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        onKeyDown={(event) => {
          // Enter in the number field applies a typed value and stops the submit. This dialog
          // has one value, so Enter should also press OK, once the new value is in.
          if (event.key !== "Enter" || !event.defaultPrevented) return;
          const form = event.currentTarget;
          window.setTimeout(() => form.requestSubmit());
        }}
      >
        <ScrubSlider
          label={spec.label}
          value={amount}
          onChange={(value) => setAmount(kind, value)}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          integer={spec.step === 1}
          unit="px"
        />
        {kind === "shrink" ? (
          <div className="flex flex-col gap-1">
            <Switch label="Shrink from the image edge too" checked={edges} onChange={setEdges} />
            <p className="text-xs text-text-muted">
              When this is on, the area outside the image counts as unselected. A selection that
              touches the edge then pulls away from it too.
            </p>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
