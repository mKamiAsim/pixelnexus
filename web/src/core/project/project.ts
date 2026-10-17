/**
 * Project files, .pnx (PLAN.md Phase 8): open images with their whole history, saved
 * selections and the pipeline, in one file. A .pnx file is a ZIP archive with project.json and
 * one PNG per distinct image and selection. Images are stored exactly, as 8-bit RGBA PNG, so a
 * project opens byte for byte as it was saved. API keys and other secrets are never part of it.
 */
import type { ParamValue } from "@/core/filters/types";
import type { RgbaImage } from "@/core/image/types";
import { createMask, maskToImage, type Mask } from "@/core/mask/mask";
import { PIPELINE_FORMAT, type PipelineFile } from "@/core/pipeline/pipeline";

import { unzipStore, zipStore, type ZipEntry } from "./zip";

export const PROJECT_FORMAT = "pixelnexus-project";
export const PROJECT_VERSION = 1;

export interface ProjectStep {
  readonly label: string;
  readonly at: number;
  readonly image: RgbaImage;
  readonly selection: Mask | null;
  readonly filter?: {
    readonly id: string;
    readonly params: Readonly<Record<string, ParamValue>>;
    readonly scope?: "selection" | "inverse";
  };
  readonly ai?: true;
}

export interface ProjectDocument {
  readonly name: string;
  readonly source: "file" | "paste" | "sample";
  readonly steps: readonly ProjectStep[];
  readonly index: number;
  readonly dropped: number;
  readonly masks: readonly { readonly name: string; readonly mask: Mask }[];
}

export interface Project {
  readonly documents: readonly ProjectDocument[];
  readonly active: number;
  readonly pipeline: PipelineFile | null;
}

interface StepJson {
  label: string;
  at: number;
  image: string;
  selection: string | null;
  filter?: ProjectStep["filter"];
  ai?: true;
}

interface ProjectJson {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  documents: {
    name: string;
    source: ProjectDocument["source"];
    index: number;
    dropped: number;
    steps: StepJson[];
    masks: { name: string; file: string }[];
  }[];
  active: number;
  pipeline: PipelineFile | null;
}

/** Write a project. Each distinct image or selection is stored once. */
export async function writeProject(
  project: Project,
  encodePng: (image: RgbaImage) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const files: ZipEntry[] = [];
  const names = new Map<RgbaImage | Mask, string>();
  const store = async (item: RgbaImage | Mask, folder: "images" | "masks") => {
    const known = names.get(item);
    if (known) return known;
    const name = `${folder}/${names.size}.png`;
    names.set(item, name);
    const image = folder === "masks" ? maskToImage(item as Mask) : (item as RgbaImage);
    files.push({ name, data: await encodePng(image) });
    return name;
  };
  const documents: ProjectJson["documents"] = [];
  for (const doc of project.documents) {
    const steps: StepJson[] = [];
    for (const step of doc.steps) {
      steps.push({
        label: step.label,
        at: step.at,
        image: await store(step.image, "images"),
        selection: step.selection ? await store(step.selection, "masks") : null,
        ...(step.filter ? { filter: step.filter } : {}),
        ...(step.ai ? { ai: true as const } : {}),
      });
    }
    const masks = [];
    for (const m of doc.masks) masks.push({ name: m.name, file: await store(m.mask, "masks") });
    documents.push({
      name: doc.name,
      source: doc.source,
      index: doc.index,
      dropped: doc.dropped,
      steps,
      masks,
    });
  }
  const json: ProjectJson = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    documents,
    active: project.active,
    pipeline: project.pipeline,
  };
  const text = new TextEncoder().encode(`${JSON.stringify(json, null, 2)}\n`);
  return zipStore([{ name: "project.json", data: text }, ...files]);
}

const maskFromImage = (image: RgbaImage): Mask => {
  const mask = createMask(image.width, image.height);
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = image.data[i * 4] ?? 0;
  return mask;
};

/** Read a project. Images and selections come back exactly as they were saved. */
export async function readProject(
  bytes: Uint8Array,
  decodePng: (bytes: Uint8Array) => Promise<RgbaImage>,
): Promise<Project> {
  const entries = unzipStore(bytes);
  const raw = entries.get("project.json");
  if (!raw) throw new Error("This file is not a PixelNexus project. It has no project.json.");
  let json: ProjectJson;
  try {
    json = JSON.parse(new TextDecoder().decode(raw)) as ProjectJson;
  } catch {
    throw new Error("The project.json in this file is not valid JSON.");
  }
  if (json.format !== PROJECT_FORMAT) throw new Error("This file is not a PixelNexus project.");
  if (json.version !== PROJECT_VERSION) {
    throw new Error(
      `This project has version ${String(json.version)}. This studio reads version 1.`,
    );
  }
  const images = new Map<string, RgbaImage>();
  const masks = new Map<string, Mask>();
  const image = async (name: string) => {
    let found = images.get(name);
    if (!found) {
      const data = entries.get(name);
      if (!data) throw new Error(`The project file has no ${name}.`);
      found = await decodePng(data);
      images.set(name, found);
    }
    return found;
  };
  const mask = async (name: string) => {
    let found = masks.get(name);
    if (!found) {
      found = maskFromImage(await image(name));
      masks.set(name, found);
    }
    return found;
  };
  const documents: ProjectDocument[] = [];
  for (const doc of json.documents ?? []) {
    const steps: ProjectStep[] = [];
    for (const step of doc.steps ?? []) {
      steps.push({
        label: String(step.label),
        at: Number(step.at) || 0,
        image: await image(step.image),
        selection: step.selection ? await mask(step.selection) : null,
        ...(step.filter ? { filter: step.filter } : {}),
        ...(step.ai ? { ai: true as const } : {}),
      });
    }
    if (steps.length === 0)
      throw new Error(`The image "${doc.name}" in this project has no steps.`);
    const named = [];
    for (const m of doc.masks ?? []) named.push({ name: String(m.name), mask: await mask(m.file) });
    documents.push({
      name: String(doc.name),
      source: doc.source === "paste" || doc.source === "sample" ? doc.source : "file",
      steps,
      index: Math.min(Math.max(0, Math.round(Number(doc.index) || 0)), steps.length - 1),
      dropped: Math.max(0, Math.round(Number(doc.dropped) || 0)),
      masks: named,
    });
  }
  const pipeline = json.pipeline?.format === PIPELINE_FORMAT ? json.pipeline : null;
  return {
    documents,
    active: Math.min(Math.max(0, Number(json.active) || 0), Math.max(0, documents.length - 1)),
    pipeline,
  };
}
