/** The input and output tensors of a model, read by the local engine from the downloaded files. */
import { useEffect, useState } from "react";

import { scienceEngine } from "@/engine-client";
import type { ModelTensors } from "@/engine-client/science";
import { useEngine } from "@/state/engine";

export type TensorState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: ModelTensors }
  | { readonly kind: "unavailable"; readonly message: string };

/** A shape as "1 x 3 x height x width". */
export const formatShape = (shape: readonly (number | string)[]) =>
  shape.length ? shape.join(" x ") : "a single value";

export function useModelTensors(modelId: string): TensorState {
  const online = useEngine((s) => s.status === "online");
  // The answer is kept with the model it belongs to, so a new model shows "loading" at once.
  const [answer, setAnswer] = useState<{
    readonly id: string;
    readonly tensors: TensorState;
  } | null>(null);

  useEffect(() => {
    if (!online) return;
    let current = true;
    scienceEngine
      .modelTensors(modelId)
      .then((value) => current && setAnswer({ id: modelId, tensors: { kind: "ready", value } }))
      .catch(
        (error: unknown) =>
          current &&
          setAnswer({
            id: modelId,
            tensors: {
              kind: "unavailable",
              message: error instanceof Error ? error.message : "The tensors could not be read.",
            },
          }),
      );
    return () => {
      current = false;
    };
  }, [online, modelId]);

  if (!online) {
    return {
      kind: "unavailable",
      message: "Start the local engine to read the tensors from the model files.",
    };
  }
  return answer?.id === modelId ? answer.tensors : { kind: "loading" };
}
