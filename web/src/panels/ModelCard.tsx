/**
 * The optional model a filter needs (catalog field model): its name, size and license, whether
 * the local engine has it, and a Download model button. Nothing downloads until that button is
 * clicked, and the license shows before it (decision D22).
 */
import { Download, ExternalLink, LoaderCircle, PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { catalog, type Filter } from "@/catalog";
import { Button } from "@/components/ui/Button";
import { scienceEngine } from "@/engine-client";
import { useEngine } from "@/state/engine";
import { announce } from "@/state/notifications";

type State =
  | { readonly kind: "unknown" }
  | { readonly kind: "missing" }
  | { readonly kind: "downloading" }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly message: string };

export function ModelCard({ entry }: { entry: Filter }) {
  const model = catalog.models.find((m) => m.id === entry.model);
  const online = useEngine((s) => s.status === "online");
  const [state, setState] = useState<State>({ kind: "unknown" });

  useEffect(() => {
    if (!online || !model) return;
    let current = true;
    scienceEngine
      .models()
      .then((list) => {
        if (!current) return;
        const found = list.find((m) => m.id === model.id);
        setState({ kind: found?.downloaded ? "ready" : "missing" });
      })
      .catch(() => current && setState({ kind: "unknown" }));
    return () => {
      current = false;
    };
  }, [online, model]);

  if (!model) return null;
  const download = () => {
    setState({ kind: "downloading" });
    announce(`Downloading ${model.name}.`);
    scienceEngine
      .downloadModel(model.id)
      .then(() => {
        setState({ kind: "ready" });
        announce(`${model.name} is downloaded and checked.`);
      })
      .catch((error: unknown) =>
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "The download failed.",
        }),
      );
  };

  return (
    <section
      aria-label="Model"
      className="flex flex-col gap-2 border-b border-border-subtle px-3 py-2.5 text-xs"
    >
      <p>
        This filter needs the model <span className="font-medium">{model.name}</span>,{" "}
        {model.sizeMB} MB. It downloads to the engine's models folder on this computer, only when
        you click Download model.
      </p>
      <p className="text-text-secondary">
        License: {model.license}{" "}
        {model.licenseUrl ? (
          <a
            href={model.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline"
          >
            Read the license
            <ExternalLink size={11} aria-hidden />
          </a>
        ) : null}
      </p>
      {state.kind === "ready" ? (
        <p className="flex items-center gap-1.5 text-success">
          <PackageCheck size={14} aria-hidden />
          The model is downloaded and checked.
        </p>
      ) : !online ? (
        <p className="text-text-muted">Start the engine to download the model.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            onClick={download}
            disabled={state.kind === "downloading" || state.kind === "unknown"}
          >
            {state.kind === "downloading" ? (
              <LoaderCircle
                size={13}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <Download size={13} aria-hidden />
            )}
            Download model
          </Button>
          {state.kind === "failed" ? (
            <p role="alert" className="text-danger">
              {state.message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
