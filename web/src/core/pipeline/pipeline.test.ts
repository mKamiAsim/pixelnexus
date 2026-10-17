import { describe, expect, it, vi } from "vitest";

import { createImage, type RgbaImage } from "@/core/image/types";

import {
  moveStep,
  parsePipeline,
  pipelineJson,
  runPipeline,
  stepKey,
  type PipelineStep,
  type StepState,
} from "./pipeline";

const step = (id: string, add: number, extra: Partial<PipelineStep> = {}): PipelineStep => ({
  id,
  filterId: "add",
  params: { amount: add },
  enabled: true,
  scope: "whole",
  ...extra,
});

/** A test step: adds its amount to the red channel. */
const addRed = vi.fn(async (s: PipelineStep, image: RgbaImage) => {
  const out = createImage(image.width, image.height);
  out.data.set(image.data);
  out.data[0] = (out.data[0] ?? 0) + Number(s.params.amount);
  return out;
});

const red = (image: RgbaImage) => image.data[0];

describe("pipeline runs", () => {
  it("chains the steps, skips the ones that are off, and reports each state", async () => {
    const states: [string, StepState][] = [];
    const out = await runPipeline(
      createImage(1, 1),
      [step("a", 1), step("b", 10, { enabled: false }), step("c", 100)],
      {
        inputKey: "doc",
        cache: new Map(),
        runStep: addRed,
        onState: (id, s) => states.push([id, s]),
        now: () => 0,
      },
    );
    expect(red(out)).toBe(101);
    expect(states.filter(([, s]) => s.state === "done").map(([id]) => id)).toEqual(["a", "c"]);
    expect(states).toContainEqual(["b", { state: "off" }]);
  });

  it("reuses cached results and recomputes only after a changed step", async () => {
    const cache = new Map<string, RgbaImage>();
    const options = { inputKey: "doc", cache, runStep: addRed };
    const steps = [step("a", 1), step("b", 2), step("c", 3)];
    await runPipeline(createImage(1, 1), steps, options);
    addRed.mockClear();
    await runPipeline(createImage(1, 1), steps, options);
    expect(addRed).not.toHaveBeenCalled();
    const changed = [steps[0], step("b", 5), steps[2]] as PipelineStep[];
    const out = await runPipeline(createImage(1, 1), changed, options);
    expect(addRed.mock.calls.map(([s]) => s.id)).toEqual(["b", "c"]);
    expect(red(out)).toBe(9);
    // The old results of b and c are gone.
    expect(cache.size).toBe(3);
  });

  it("names the step that failed and stops there", async () => {
    const runStep = async (s: PipelineStep, image: RgbaImage) => {
      if (s.id === "b") throw new Error("The engine is not running.");
      return image;
    };
    await expect(
      runPipeline(createImage(1, 1), [step("a", 1), step("b", 1), step("c", 1)], {
        inputKey: "doc",
        cache: new Map(),
        runStep,
      }),
    ).rejects.toThrow("Step 2 failed: The engine is not running.");
  });

  it("gives equal keys for equal settings, whatever the key order", () => {
    const a = step("a", 1, { params: { x: 1, y: 2 } });
    const b = step("b", 1, { params: { y: 2, x: 1 } });
    expect(stepKey("doc", a)).toBe(stepKey("doc", b));
    expect(stepKey("doc", { ...a, enabled: false })).toBe("doc");
    expect(stepKey("doc", { ...a, scope: "selection" })).not.toBe(stepKey("doc", a));
  });
});

describe("pipeline files", () => {
  const validate = (filterId: string, params: Readonly<Record<string, unknown>>) =>
    filterId === "add"
      ? { values: { amount: Number(params.amount ?? 0) }, warnings: [] }
      : `${filterId} is not a filter in this studio.`;

  it("saves and loads the same steps", () => {
    const steps = [step("a", 1), step("b", 2, { enabled: false, scope: "inverse" })];
    const { steps: loaded, warnings } = parsePipeline(pipelineJson(steps), validate);
    expect(warnings).toEqual([]);
    expect(loaded.map(({ id: _, ...rest }) => rest)).toEqual(
      steps.map(({ id: _, ...rest }) => rest),
    );
  });

  it("leaves out unknown filters with a warning, and refuses other files", () => {
    const text = JSON.stringify({
      format: "pixelnexus-pipeline",
      version: 1,
      steps: [{ filter: "nope", params: {} }, { filter: "add", params: { amount: 3 } }, {}],
    });
    const { steps, warnings } = parsePipeline(text, validate);
    expect(steps.map((s) => s.params.amount)).toEqual([3]);
    expect(warnings).toEqual([
      "Step 1 was left out: nope is not a filter in this studio.",
      "Step 3 names no filter, so it was left out.",
    ]);
    expect(() => parsePipeline("{", validate)).toThrow("not valid JSON");
    expect(() => parsePipeline("{}", validate)).toThrow("not a PixelNexus pipeline");
    expect(() =>
      parsePipeline(JSON.stringify({ format: "pixelnexus-pipeline", version: 2 }), validate),
    ).toThrow("version 2");
  });

  it("moves a step", () => {
    expect(moveStep(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveStep(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});
