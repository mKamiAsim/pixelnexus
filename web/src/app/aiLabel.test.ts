import { describe, expect, it } from "vitest";

import { createImage } from "@/core/image/types";
import type { HistoryStep } from "@/state/documents";

import { hasAiResult, isAiStep } from "./aiLabel";

const step = (extra: Partial<HistoryStep> = {}): HistoryStep => ({
  id: 1,
  label: "Step",
  image: createImage(1, 1),
  selection: null,
  at: 0,
  ...extra,
});

describe("AI result labels", () => {
  it("marks AI task steps and learned-model filters, not classical filters", () => {
    expect(isAiStep(step({ ai: true }))).toBe(true);
    expect(isAiStep(step({ filter: { id: "dncnn", params: {} } }))).toBe(true);
    expect(isAiStep(step({ filter: { id: "fast-style", params: {} } }))).toBe(true);
    expect(isAiStep(step({ filter: { id: "gaussian", params: {} } }))).toBe(false);
    expect(isAiStep(step())).toBe(false);
  });

  it("keeps the label while an AI step is at or before the current step", () => {
    const doc = { steps: [step(), step({ ai: true }), step()], index: 2 };
    expect(hasAiResult(doc)).toBe(true);
    expect(hasAiResult({ ...doc, index: 0 })).toBe(false);
  });
});
