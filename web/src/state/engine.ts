/**
 * Whether the local science engine answers. The studio checks at start, when its window gets the
 * focus again, and when the status light is clicked, so starting the engine shows up without a
 * reload. It does not poll in the background, since each failed check is logged by the browser.
 * Browser filters work either way.
 */
import { create } from "zustand";

import { isRunnable, type Filter } from "@/catalog";
import { scienceEngine } from "@/engine-client";
import type { InferenceInfo } from "@/engine-client/science";

export type EngineStatus = "checking" | "online" | "offline";

interface EngineState {
  readonly status: EngineStatus;
  readonly version: string | null;
  /** The model runtime and its device, or null while the engine still checks it. */
  readonly inference: InferenceInfo | null;
  check(): Promise<void>;
}

/** How often to ask again while the engine checks its device, a few seconds after it starts. */
const DEVICE_RETRY_MS = 2000;
const DEVICE_RETRIES = 15;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export const useEngine = create<EngineState>((set, get) => ({
  status: "checking",
  version: null,
  inference: null,
  check: async () => {
    const info = await scienceEngine.info();
    set(
      info
        ? { status: "online", version: info.version, inference: info.inference ?? null }
        : { status: "offline", version: null, inference: null },
    );
    clearTimeout(retryTimer);
    if (info && !info.inference && retries < DEVICE_RETRIES) {
      retries += 1;
      retryTimer = setTimeout(() => void get().check(), DEVICE_RETRY_MS);
    } else {
      retries = 0;
    }
  },
}));

/** Start checking the engine. Returns a function that stops it. */
export function watchEngine(): () => void {
  const check = () => void useEngine.getState().check();
  check();
  window.addEventListener("focus", check);
  return () => window.removeEventListener("focus", check);
}

/** True when the filter runs in the local engine and that engine does not answer. */
export function useNeedsEngine(entry: Filter): boolean {
  const status = useEngine((s) => s.status);
  return entry.engine === "science" && isRunnable(entry) && status !== "online";
}
