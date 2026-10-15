/**
 * Learn widgets run science filters in the local engine. They send their small images a moment
 * after the last change, and say why there is no picture while they wait or when the engine is
 * off.
 */
import { useEffect, useState } from "react";

import type { Params } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import { runJob } from "@/engine-client";
import { useEngine } from "@/state/engine";

export interface EngineInput {
  readonly image: RgbaImage;
  readonly values: Params;
}

export interface EngineResults {
  /** One result per input, or null while there are none. */
  readonly images: readonly RgbaImage[] | null;
  /** Why there are no results, or an error from the engine. Empty when all is well. */
  readonly note: string;
}

const DELAY_MS = 200;

export const ENGINE_OFF_NOTE =
  "This filter runs in the PixelNexus engine, which is not running. Start it with: uv run pixelnexus-engine";

interface Answer {
  readonly inputs: readonly EngineInput[];
  readonly images?: readonly RgbaImage[];
  readonly message?: string;
}

/**
 * Run a science filter on each input. Pass a memoized list: a new list starts new jobs. With
 * active false, nothing runs and no note is given.
 */
export function useEngineResults(
  filterId: string,
  inputs: readonly EngineInput[],
  active: boolean,
): EngineResults {
  const engine = useEngine((s) => s.status);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!active || engine !== "online") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Promise.all(
        inputs.map((input) =>
          runJob(
            { filterId, values: input.values, image: input.image },
            { signal: controller.signal },
          ),
        ),
      )
        .then((results) => setAnswer({ inputs, images: results.map((r) => r.image) }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "The engine did not answer.";
          setAnswer({ inputs, message });
        });
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, engine, filterId, inputs]);
  if (!active) return { images: null, note: "" };
  if (engine === "offline") return { images: null, note: ENGINE_OFF_NOTE };
  if (answer?.inputs !== inputs) {
    return { images: null, note: "Running the filter in the PixelNexus engine." };
  }
  return { images: answer.images ?? null, note: answer.message ?? "" };
}
