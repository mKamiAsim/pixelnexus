/**
 * The pipeline being built in the Pipeline panel (PLAN.md Phase 8). One pipeline is shared by
 * all images: it is a recipe, and it runs on the image that is active when you press Run.
 */
import { create } from "zustand";

import { moveStep, type PipelineStep, type StepState } from "@/core/pipeline/pipeline";

interface PipelineState {
  steps: readonly PipelineStep[];
  states: Readonly<Record<string, StepState>>;
  /** The step whose settings are open in the panel. */
  open: string | null;
  running: AbortController | null;
  add: (step: PipelineStep) => void;
  replace: (steps: readonly PipelineStep[]) => void;
  update: (id: string, change: Partial<Omit<PipelineStep, "id">>) => void;
  remove: (id: string) => void;
  move: (from: number, to: number) => void;
  setOpen: (id: string | null) => void;
  setState: (id: string, state: StepState) => void;
  setRunning: (controller: AbortController | null) => void;
}

export const usePipeline = create<PipelineState>()((set) => ({
  steps: [],
  states: {},
  open: null,
  running: null,
  add: (step) => set((s) => ({ steps: [...s.steps, step] })),
  replace: (steps) => set({ steps, states: {}, open: null }),
  update: (id, change) =>
    set((s) => ({
      steps: s.steps.map((step) => (step.id === id ? { ...step, ...change } : step)),
    })),
  remove: (id) =>
    set((s) => ({
      steps: s.steps.filter((step) => step.id !== id),
      open: s.open === id ? null : s.open,
    })),
  move: (from, to) => set((s) => ({ steps: moveStep(s.steps, from, to) })),
  setOpen: (open) => set({ open }),
  setState: (id, state) => set((s) => ({ states: { ...s.states, [id]: state } })),
  setRunning: (running) => set({ running }),
}));
