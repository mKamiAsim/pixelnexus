// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { encodePng } from "@/core/image/png";
import { createImage } from "@/core/image/types";
import { toPipelineFile } from "@/core/pipeline/pipeline";
import { writeProject } from "@/core/project/project";
import { activeDocument } from "@/state/documents";
import { usePipeline } from "@/state/pipeline";

import { openProject } from "./projectActions";

describe("opening a project", () => {
  it("restores the images with their history and the pipeline", async () => {
    const original = createImage(3, 2);
    const edited = createImage(3, 2);
    edited.data.fill(200);
    const bytes = await writeProject(
      {
        documents: [
          {
            name: "a.png",
            source: "file",
            steps: [
              { label: "Open", at: 1, image: original, selection: null },
              {
                label: "Invert",
                at: 2,
                image: edited,
                selection: null,
                filter: { id: "invert", params: {} },
              },
            ],
            index: 1,
            dropped: 0,
            masks: [],
          },
        ],
        active: 0,
        pipeline: toPipelineFile([
          { id: "x", filterId: "gaussian", params: { sigma: 3 }, enabled: true, scope: "whole" },
        ]),
      },
      encodePng,
    );
    await openProject(new File([bytes.slice()], "work.pnx"));
    const doc = activeDocument();
    expect(doc?.name).toBe("a.png");
    expect(doc?.steps.map((s) => s.label)).toEqual(["Open", "Invert"]);
    expect(doc?.current.data[0]).toBe(200);
    expect(doc?.original.data[0]).toBe(0);
    expect(usePipeline.getState().steps.map((s) => [s.filterId, s.params.sigma])).toEqual([
      ["gaussian", 3],
    ]);
  });
});
