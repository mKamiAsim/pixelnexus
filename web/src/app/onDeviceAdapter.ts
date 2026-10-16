/**
 * The adapter of the on-device provider kind (PLAN.md Phase 7d): AI tasks run in the browser
 * with ONNX Runtime Web and the approved models you downloaded to this browser. Images stay on
 * the device, so the router never asks for consent. A model that is not downloaded is never
 * fetched here: the adapter says which model to download, in Edit > AI providers.
 */
import { catalog } from "@/catalog";
import { cachedFiles, CACHE_NAME, runsOnDevice, type ModelCache } from "@/core/ai/ondevice/store";
import { createSession, runtime, type Session } from "@/core/ai/ondevice/runtime";
import { promptedSelect, subjectSelect, superResolve, type Run } from "@/core/ai/ondevice/tasks";
import type { AiOutput, AiRequest, ProviderAdapter, ProviderConfig } from "@/core/ai/types";
import type { Model } from "@/generated/catalog-types";

/** The on-device model for a task: the provider's choice, or the first one that runs here. */
export function onDeviceModel(taskId: string, provider: ProviderConfig): Model | undefined {
  const task = catalog.aiTasks.find((t) => t.id === taskId);
  const usable = (task?.models ?? [])
    .map((id) => catalog.models.find((m) => m.id === id))
    .filter((m): m is Model => m !== undefined && runsOnDevice(m));
  return usable.find((m) => m.id === provider.model) ?? usable[0];
}

export const openModelCache = (): Promise<ModelCache> => caches.open(CACHE_NAME);

const sessions = new Map<string, Promise<Session[]>>();

/** One session per network file of a model, made once. */
function modelSessions(model: Model, cache: ModelCache): Promise<Session[]> {
  let pending = sessions.get(model.id);
  if (!pending) {
    pending = cachedFiles(model, cache).then((files) => {
      if (!files) throw new Error(`Download ${model.name} first, in Edit > AI providers.`);
      return Promise.all(files.map((file) => createSession(file)));
    });
    pending.catch(() => sessions.delete(model.id));
    sessions.set(model.id, pending);
  }
  return pending;
}

/** A Run callback over one session. orig_im_size is the one int64 input of these models. */
function runner(session: Session): Run {
  return async (inputs) => {
    const ort = await runtime();
    const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
    for (const [name, value] of Object.entries(inputs)) {
      feeds[name] =
        name === "orig_im_size"
          ? new ort.Tensor(
              "int64",
              BigInt64Array.from(Array.from(value.data, (v) => BigInt(v))),
              value.dims,
            )
          : new ort.Tensor("float32", value.data, value.dims);
    }
    const results = await session.run(feeds);
    return Object.fromEntries(
      Object.entries(results).map(([name, tensor]) => [
        name,
        { data: tensor.data as Float32Array, dims: tensor.dims },
      ]),
    );
  };
}

export function onDeviceAdapter(
  provider: ProviderConfig,
  cache: () => Promise<ModelCache> = openModelCache,
): ProviderAdapter {
  return {
    async run(request: AiRequest): Promise<AiOutput> {
      const model = onDeviceModel(request.task.id, provider);
      if (!model)
        throw new Error(`No on-device model does ${request.task.name}. Use the local engine.`);
      const [first, second] = await modelSessions(model, await cache());
      if (!first) throw new Error(`${model.name} has no network file.`);
      switch (request.task.id) {
        case "subject-select":
          return { kind: "mask", mask: await subjectSelect(request.image, runner(first)) };
        case "super-resolution":
          return { kind: "image", image: await superResolve(request.image, runner(first)) };
        case "click-select":
        case "object-select":
          if (!second) throw new Error(`${model.name} needs its decoder file.`);
          return {
            kind: "mask",
            mask: await promptedSelect(
              request.image,
              request.points ?? [],
              request.box,
              runner(first),
              runner(second),
            ),
          };
        default:
          throw new Error(`${request.task.name} does not run on the device yet.`);
      }
    },
  };
}
