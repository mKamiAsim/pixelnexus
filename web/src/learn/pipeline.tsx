/**
 * The model pipeline of a learned filter, for the Learn panel. It draws the
 * filter's steps from the catalog as a chain from your image to the result, with the model card
 * and, when the engine has the model, the real tensor shapes from its files. Nothing is invented:
 * the steps, the model facts and the shapes all come from the catalog or the files.
 */
import { ArrowDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { catalog, modelFor } from "@/catalog";
import { formatShape, useModelTensors } from "@/app/useModelTensors";
import { AI_RESULT_LABEL } from "@/core/ai/types";

import type { WidgetProps } from "./widgets";

function Box({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <li
      className={
        strong
          ? "rounded-control border border-accent bg-accent-subtle px-2.5 py-1.5"
          : "rounded-control border border-border bg-raised px-2.5 py-1.5"
      }
    >
      {children}
    </li>
  );
}

const Arrow = () => (
  <li aria-hidden className="flex justify-center text-text-muted">
    <ArrowDown size={14} />
  </li>
);

function Shapes({ modelId }: { modelId: string }) {
  const tensors = useModelTensors(modelId);
  if (tensors.kind !== "ready") {
    return (
      <p className="text-text-muted">
        {tensors.kind === "loading" ? "Reading the tensor shapes." : tensors.message}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5 font-mono">
      {tensors.value.files.flatMap((file) => [
        ...file.inputs.map((t) => (
          <li key={`${file.file}-in-${t.name}`}>
            in {t.name}: {formatShape(t.shape)}
          </li>
        )),
        ...file.outputs.map((t) => (
          <li key={`${file.file}-out-${t.name}`}>
            out {t.name}: {formatShape(t.shape)}
          </li>
        )),
      ])}
    </ul>
  );
}

export function ModelPipeline({ filterId, values }: WidgetProps) {
  const entry = catalog.filters.find((f) => f.id === filterId);
  const modelId = entry ? modelFor(entry, values) : undefined;
  const model = catalog.models.find((m) => m.id === modelId);
  if (!entry || !model) return <p className="text-text-muted">This filter uses no model.</p>;
  const steps = entry.steps ?? [];
  return (
    <div className="flex flex-col gap-2 text-xs">
      <ol aria-label={`Pipeline of ${entry.name}`} className="flex flex-col gap-1">
        <Box>Your image</Box>
        {steps.map((step) => (
          <Fragment key={step}>
            <Arrow />
            <Box>{step}</Box>
          </Fragment>
        ))}
        <Arrow />
        <Box strong>
          <span className="font-medium">Result.</span> {AI_RESULT_LABEL}
        </Box>
      </ol>
      <section aria-label={`Model ${model.name}`} className="flex flex-col gap-1">
        <p>
          <span className="font-medium">The network: </span>
          {model.name}, {model.sizeMB} MB.
        </p>
        {model.inputs ? <p className="text-text-secondary">Takes: {model.inputs}</p> : null}
        {model.outputs ? <p className="text-text-secondary">Gives: {model.outputs}</p> : null}
        <Shapes modelId={model.id} />
      </section>
    </div>
  );
}
