import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useDocuments, activeDocument } from "@/state/documents";
import { useUi } from "@/state/ui";

import { saveSelection } from "./selectionActions";

/** Select > Save selection: keep the selection as a named mask of the image. */
export function SaveSelectionDialog() {
  const open = useUi((s) => s.dialog === "select-save");
  const setDialog = useUi((s) => s.setDialog);
  const count = useDocuments((s) => activeDocument(s)?.masks.length ?? 0);
  const [name, setName] = useState("");
  const formId = useId();
  const inputId = useId();
  const fallback = `Mask ${count + 1}`;

  const close = () => {
    setName("");
    setDialog(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setDialog("select-save") : close())}
      title="Save selection"
      description="Saved masks stay with this image until you close it. Find them in the Masks panel."
      className="max-w-sm"
      focusField
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-1.5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveSelection(name || fallback);
          close();
        }}
      >
        <label htmlFor={inputId} className="text-xs text-text-secondary">
          Name
        </label>
        <input
          id={inputId}
          value={name}
          placeholder={fallback}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="h-7 rounded-control border border-border-control bg-raised px-2 text-sm text-text outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        />
      </form>
    </Dialog>
  );
}
