import { useEffect, useState } from "react";

import { isRunnable, type Filter } from "@/catalog";
import type { Params, Representation } from "@/core/filters/types";
import { scienceEngine } from "@/engine-client";
import { useEngine } from "@/state/engine";

export type EngineRepresentation =
  | { readonly status: "none" | "loading" | "offline" }
  | { readonly status: "ready"; readonly representation: Representation }
  | { readonly status: "error"; readonly message: string };

/** Wait this long after the last change before asking, so a dragged slider sends few requests. */
const DELAY_MS = 150;

interface Answer {
  readonly key: string;
  readonly representation?: Representation;
  readonly message?: string;
}

/**
 * The operator of a science filter for the Inspector. The engine builds it with the same code
 * that runs the filter, so the studio asks the engine each time the values change.
 */
export function useEngineRepresentation(entry: Filter, values: Params): EngineRepresentation {
  const engine = useEngine((s) => s.status);
  const wanted = entry.engine === "science" && isRunnable(entry);
  const key = `${entry.id} ${JSON.stringify(values)}`;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!wanted || engine !== "online") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      scienceEngine
        .representation(entry.id, values, controller.signal)
        .then((representation) => setAnswer({ key, representation }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setAnswer({
            key,
            message: error instanceof Error ? error.message : "The engine did not answer.",
          });
        });
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [wanted, engine, entry.id, values, key]);

  if (!wanted) return { status: "none" };
  if (engine === "offline") return { status: "offline" };
  if (answer?.key !== key) return { status: "loading" };
  if (answer.representation) return { status: "ready", representation: answer.representation };
  return { status: "error", message: answer.message ?? "The engine did not answer." };
}
