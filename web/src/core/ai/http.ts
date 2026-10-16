/**
 * The generic HTTP adapter of the external-api provider kind (PLAN.md Phase 7e). A preset from
 * catalog/providers.yaml says how to call one service: the path of each task, the form fields
 * and the header that carries the API key. Each request is a POST of a multipart form with the
 * image as PNG. The answer is an image: for a mask task, its transparency is the selection when
 * it has any, else its gray value. A selection of another size is resized to the image with
 * bilinear interpolation, since some services answer smaller.
 *
 * The key goes only in the preset's header, to the configured base URL. It is never put in the
 * URL and never in an error message.
 */
import type { ProviderPreset } from "@/generated/catalog-types";
import { checkEndpoint } from "@/core/ai/endpoint";
import type { AiOutput, AiRequest, ProviderAdapter } from "@/core/ai/types";
import { resizeImageTo } from "@/core/image/resample";
import type { RgbaImage } from "@/core/image/types";
import { createMask, maskToImage, type Mask } from "@/core/mask/mask";

export type { ProviderPreset };

/** What the adapter needs besides the preset. Tests pass fakes. */
export interface HttpDeps {
  readonly baseUrl: string;
  readonly key?: string;
  readonly model?: string;
  readonly fetch: typeof fetch;
  readonly encodePng: (image: RgbaImage) => Promise<Uint8Array>;
  readonly decode: (bytes: Uint8Array) => Promise<RgbaImage>;
}

/** The URL of a task: the base URL, one slash, and the preset's path. */
export function taskUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** A selection from an answer image: its transparency when it has any, else its gray value. */
export function maskFromAnswer(image: RgbaImage): Mask {
  const mask = createMask(image.width, image.height);
  let transparent = false;
  for (let i = 3; i < image.data.length; i += 4) {
    if ((image.data[i] ?? 255) < 255) {
      transparent = true;
      break;
    }
  }
  const offset = transparent ? 3 : 0;
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = image.data[i * 4 + offset] ?? 0;
  return mask;
}

const png = (bytes: Uint8Array) => new Blob([bytes.slice()], { type: "image/png" });

/** A short reason from an error answer, from the common JSON shapes, or the status alone. */
export async function errorReason(response: Response): Promise<string> {
  const status = `The service answered with error ${response.status}`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return `${status}.`;
  }
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return pick(value[0]);
    if (typeof value === "object" && value !== null) {
      const item = value as Record<string, unknown>;
      return pick(item.title ?? item.message ?? item.detail ?? item.error);
    }
    return undefined;
  };
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const reason = pick(record.errors ?? record.error ?? record.detail ?? record.message);
  return reason ? `${status}: ${reason.slice(0, 200).replace(/\.+$/, "")}.` : `${status}.`;
}

export function httpAdapter(preset: ProviderPreset, deps: HttpDeps): ProviderAdapter {
  return {
    async run(request: AiRequest, signal?: AbortSignal): Promise<AiOutput> {
      const entry = preset.tasks.find((t) => t.task === request.task.id);
      if (!entry) throw new Error(`${preset.name} does not do ${request.task.name}`);
      const check = checkEndpoint(deps.baseUrl);
      if (!check.ok) throw new Error(check.reason);
      if (!deps.key) throw new Error(`Add the API key of ${preset.name} in AI providers`);

      const form = new FormData();
      form.append(preset.imageField, png(await deps.encodePng(request.image)), "image.png");
      if (preset.maskField && request.mask) {
        form.append(
          preset.maskField,
          png(await deps.encodePng(maskToImage(request.mask))),
          "mask.png",
        );
      }
      if (preset.promptsField && (request.points?.length || request.box)) {
        form.append(
          preset.promptsField,
          JSON.stringify({
            points: request.points ?? [],
            ...(request.box ? { box: request.box } : {}),
          }),
        );
      }
      if (preset.modelField && deps.model) form.append(preset.modelField, deps.model);
      for (const [name, value] of Object.entries(entry.fields ?? {})) form.append(name, value);

      let response: Response;
      try {
        response = await deps.fetch(taskUrl(check.url.href, entry.path), {
          method: "POST",
          headers: { [preset.keyHeader]: `${preset.keyPrefix ?? ""}${deps.key}` },
          body: form,
          credentials: "omit",
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error(
          `Could not reach ${check.host}. Check the URL and your connection. Some services do not accept requests from a web page`,
          { cause: error },
        );
      }
      if (!response.ok) throw new Error(await errorReason(response));
      const type = response.headers.get("Content-Type") ?? "";
      if (!type.startsWith("image/")) {
        throw new Error(`${preset.name} did not answer with an image`);
      }
      const image = await deps.decode(new Uint8Array(await response.arrayBuffer()));
      if (request.task.output === "image") return { kind: "image", image };
      const { width, height } = request.image;
      const sized =
        image.width === width && image.height === height
          ? image
          : resizeImageTo(image, width, height, "bilinear");
      return { kind: "mask", mask: maskFromAnswer(sized) };
    },
  };
}
