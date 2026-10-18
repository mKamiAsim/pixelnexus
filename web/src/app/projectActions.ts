/**
 * Save and open project files, .pnx. A project holds every open image with its
 * history and saved selections, and the pipeline. See web/src/core/project/project.ts.
 */
import { decodePng, encodePng } from "@/core/image/png";
import { toPipelineFile } from "@/core/pipeline/pipeline";
import { readProject, writeProject } from "@/core/project/project";
import { useDocuments } from "@/state/documents";
import { announce, notify } from "@/state/notifications";
import { usePipeline } from "@/state/pipeline";
import { useUi } from "@/state/ui";

import { download } from "./download";
import { parsePipelineFile } from "./pipelineActions";

const stem = (name: string) => name.replace(/\.[^.]+$/, "") || "project";

/** Save all open images, their history and the pipeline as one .pnx file. */
export async function saveProject(): Promise<void> {
  const { documents, activeId } = useDocuments.getState();
  if (documents.length === 0) {
    notify("info", "Nothing to save", "Open an image first.");
    return;
  }
  const { beginWork, endWork } = useUi.getState();
  beginWork("Saving the project");
  try {
    const steps = usePipeline.getState().steps;
    const bytes = await writeProject(
      {
        documents: documents.map((d) => ({
          name: d.name,
          source: d.source,
          steps: d.steps,
          index: d.index,
          dropped: d.dropped,
          masks: d.masks,
        })),
        active: Math.max(
          0,
          documents.findIndex((d) => d.id === activeId),
        ),
        pipeline: steps.length ? toPipelineFile(steps) : null,
      },
      encodePng,
    );
    const active = documents.find((d) => d.id === activeId) ?? documents[0];
    const name = `${stem(active?.name ?? "project")}.pnx`;
    download(new Blob([bytes.slice()], { type: "application/zip" }), name);
    const mb = (bytes.length / 1e6).toFixed(1);
    notify(
      "success",
      `Saved the project as ${name}`,
      `${documents.length} ${documents.length === 1 ? "image" : "images"}, ${mb} MB.`,
    );
  } catch (error) {
    notify("error", "The project was not saved", error instanceof Error ? error.message : "");
  } finally {
    endWork();
  }
}

/** Open a .pnx file. Its images open as new tabs, and its pipeline replaces the current one. */
export async function openProject(file: File): Promise<void> {
  const { beginWork, endWork } = useUi.getState();
  beginWork(`Opening ${file.name}`);
  try {
    const project = await readProject(new Uint8Array(await file.arrayBuffer()), decodePng);
    const ids = project.documents.map((doc) => useDocuments.getState().restore(doc));
    const active = ids[project.active];
    if (active) useDocuments.getState().activate(active);
    let note = "";
    if (project.pipeline) {
      const { steps, warnings } = parsePipelineFile(project.pipeline);
      usePipeline.getState().replace(steps);
      note = ` The pipeline has ${steps.length} ${steps.length === 1 ? "step" : "steps"}.${warnings.length ? ` ${warnings.join(" ")}` : ""}`;
    }
    const count = ids.length;
    announce(`Opened the project ${file.name}.`);
    notify(
      "success",
      `Opened ${file.name}`,
      `${count} ${count === 1 ? "image" : "images"} with their history.${note}`,
    );
  } catch (error) {
    notify("error", `Could not open ${file.name}`, error instanceof Error ? error.message : "");
  } finally {
    endWork();
  }
}

/** Ask for a project file and open it. Must run from a click or key press. */
export function chooseAndOpenProject(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pnx,application/zip";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void openProject(file);
  });
  input.click();
}
