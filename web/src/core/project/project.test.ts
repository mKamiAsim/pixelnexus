import { describe, expect, it } from "vitest";

import { decodePng, encodePng } from "@/core/image/png";
import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import { toPipelineFile } from "@/core/pipeline/pipeline";

import { readProject, writeProject, type Project } from "./project";
import { unzipStore } from "./zip";

function image(seed: number) {
  const out = createImage(5, 4);
  for (let i = 0; i < out.data.length; i++) out.data[i] = (i * 37 + seed * 101) % 256;
  return out;
}

describe("project files", () => {
  const original = image(1);
  const blurred = image(2);
  const selection = createMask(5, 4);
  selection.data.set([0, 64, 128, 255]);
  const project: Project = {
    documents: [
      {
        name: "photo.png",
        source: "file",
        steps: [
          { label: "Open", at: 1, image: original, selection: null },
          { label: "Select", at: 2, image: original, selection },
          {
            label: "Gaussian filter (sigma 2 px) inside the selection",
            at: 3,
            image: blurred,
            selection,
            filter: { id: "gaussian", params: { sigma: 2 }, scope: "selection" },
          },
          {
            label: "AI subject selection (Local engine models)",
            at: 4,
            image: blurred,
            selection,
            ai: true,
          },
        ],
        index: 2,
        dropped: 1,
        masks: [{ name: "Sky", mask: selection }],
      },
    ],
    active: 0,
    pipeline: toPipelineFile([
      { id: "a", filterId: "median", params: { size: 3 }, enabled: false, scope: "whole" },
    ]),
  };

  it("open exactly as they were saved", async () => {
    const back = await readProject(await writeProject(project, encodePng), decodePng);
    const doc = back.documents[0];
    expect(doc?.steps.map((s) => s.label)).toEqual(project.documents[0]?.steps.map((s) => s.label));
    expect(Array.from(doc?.steps[2]?.image.data ?? [])).toEqual(Array.from(blurred.data));
    expect(Array.from(doc?.steps[1]?.selection?.data ?? [])).toEqual(Array.from(selection.data));
    expect(doc?.steps[2]?.filter).toEqual({
      id: "gaussian",
      params: { sigma: 2 },
      scope: "selection",
    });
    expect(doc?.steps[3]?.ai).toBe(true);
    expect([doc?.index, doc?.dropped, doc?.masks[0]?.name]).toEqual([2, 1, "Sky"]);
    expect(back.pipeline?.steps[0]).toEqual({
      filter: "median",
      params: { size: 3 },
      enabled: false,
      scope: "whole",
    });
  });

  it("store each distinct image and selection once", async () => {
    const entries = unzipStore(await writeProject(project, encodePng));
    expect([...entries.keys()].sort()).toEqual([
      "images/0.png",
      "images/2.png",
      "masks/1.png",
      "project.json",
    ]);
    const json = new TextDecoder().decode(entries.get("project.json"));
    expect(json).not.toMatch(/key|token|secret/i);
  });

  it("refuse files that are not projects", async () => {
    await expect(readProject(new Uint8Array([1, 2, 3]), decodePng)).rejects.toThrow("not a ZIP");
  });
});
