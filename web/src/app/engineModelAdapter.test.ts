import { describe, expect, it, vi } from "vitest";

import { catalog } from "@/catalog";
import { createImage, type RgbaImage } from "@/core/image/types";
import type { ScienceEngine } from "@/engine-client/science";

import { engineModelAdapter, maskFromImage } from "./engineModelAdapter";

const task = (id: string) => {
  const found = catalog.aiTasks.find((t) => t.id === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
};

function gray(width: number, height: number, values: number[]): RgbaImage {
  const image = createImage(width, height);
  values.forEach((v, i) => {
    image.data.set([v, v, v, 255], i * 4);
  });
  return image;
}

describe("engine model adapter", () => {
  it("reads the mask from the red channel", () => {
    expect(Array.from(maskFromImage(gray(2, 2, [0, 255, 128, 7])).data)).toEqual([0, 255, 128, 7]);
  });

  it("sends the task, the model and the prompts, and returns a mask or an image", async () => {
    const result = gray(2, 1, [255, 0]);
    const aiTask = vi.fn(async () => result);
    const engine = { aiTask } as unknown as ScienceEngine;
    const adapter = engineModelAdapter(engine, {
      id: "local-engine",
      kind: "engine-model",
      name: "Local engine models",
      model: "efficientsam-ti",
    });
    const image = createImage(2, 1);
    const points = [{ x: 1, y: 0, positive: true }];
    const mask = await adapter.run({ task: task("click-select"), image, points });
    expect(aiTask).toHaveBeenCalledWith(
      "click-select",
      { image, model: "efficientsam-ti", points },
      undefined,
    );
    expect(mask.kind === "mask" && Array.from(mask.mask.data)).toEqual([255, 0]);
    const output = await adapter.run({ task: task("denoise"), image });
    expect(output).toEqual({ kind: "image", image: result });
  });
});
