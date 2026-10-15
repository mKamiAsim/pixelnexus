/**
 * Whether the local science engine answers. The studio checks at start, when its window gets the
 * focus again, and when the status light is clicked, so starting the engine shows up without a
 * reload. It does not poll in the background, since each failed check is logged by the browser.
 * Browser filters work either way.
 */
import { create } from "zustand";

import { isRunnable, type Filter } from "@/catalog";
import { scienceEngine } from "@/engine-client";

export type EngineStatus = "checking" | "online" | "offline";

interface EngineState {
  readonly status: EngineStatus;
  readonly version: string | null;
  check(): Promise<void>;
}

export const useEngine = create<EngineState>((set) => ({
  status: "checking",
  version: null,
  check: async () => {
    const info = await scienceEngine.info();
    set(info ? { status: "online", version: info.version } : { status: "offline", version: null });
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
