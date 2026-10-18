/**
 * On-device model files. A model downloads only after you accept it in the
 * studio, which first shows its size and license. Every file is checked against the SHA-256 in
 * catalog/models.yaml before it is kept, and kept in the browser's Cache Storage, keyed by that
 * hash, so it loads without the network next time. The model then runs in the browser.
 *
 * A model's browserUrl, when it has one, is a copy of the main file with the same SHA-256 that
 * browsers can download, for a source that sends no CORS header.
 */
import type { Model } from "@/generated/catalog-types";

export const CACHE_NAME = "pixelnexus-models-v1";

/** The part of the Cache Storage API the store needs, so tests can pass a fake. */
export interface ModelCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface ModelFile {
  readonly url: string;
  readonly sha256: string;
  readonly sizeMB: number;
}

/** The files of a model for a browser: the main file first, then the extra files. */
export function browserFiles(model: Model): ModelFile[] {
  return [
    { url: model.browserUrl ?? model.sourceUrl, sha256: model.sha256, sizeMB: model.sizeMB },
    ...(model.extraFiles ?? []).map((f) => ({
      url: f.sourceUrl,
      sha256: f.sha256,
      sizeMB: f.sizeMB,
    })),
  ];
}

/** Only ONNX files run in the browser. Other formats need the engine. */
export function runsOnDevice(model: Model): boolean {
  return model.format === "onnx" && model.runtimes.includes("on-device");
}

export function totalMB(model: Model): number {
  return Math.round(browserFiles(model).reduce((sum, f) => sum + f.sizeMB, 0) * 100) / 100;
}

const key = (sha256: string) => `https://models.pixelnexus.invalid/${sha256}`;

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Read a response body, reporting the bytes received so far. */
async function readAll(
  response: Response,
  onBytes: (received: number) => void,
): Promise<ArrayBuffer> {
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    onBytes(received);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}

export async function isCached(model: Model, cache: ModelCache): Promise<boolean> {
  for (const file of browserFiles(model)) {
    if (!(await cache.match(key(file.sha256)))) return false;
  }
  return true;
}

/** The cached files of a model, or undefined when one is missing. */
export async function cachedFiles(
  model: Model,
  cache: ModelCache,
): Promise<ArrayBuffer[] | undefined> {
  const out: ArrayBuffer[] = [];
  for (const file of browserFiles(model)) {
    const hit = await cache.match(key(file.sha256));
    if (!hit) return undefined;
    out.push(await hit.arrayBuffer());
  }
  return out;
}

/**
 * Download every file of a model that is not cached, check its SHA-256 and cache it. Call this
 * only after the user accepted the model. `onProgress` gets the share done, from 0 to 1.
 */
export async function downloadModel(
  model: Model,
  cache: ModelCache,
  onProgress: (share: number) => void = () => undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const files = browserFiles(model);
  const total = files.reduce((sum, f) => sum + f.sizeMB * 1e6, 0);
  let done = 0;
  for (const file of files) {
    if (await cache.match(key(file.sha256))) {
      done += file.sizeMB * 1e6;
      continue;
    }
    const response = await fetchImpl(file.url);
    if (!response.ok) throw new Error(`The download failed with error ${response.status}.`);
    const data = await readAll(response, (received) =>
      onProgress(Math.min(1, (done + received) / total)),
    );
    if ((await sha256Hex(data)) !== file.sha256) {
      throw new Error(
        "The downloaded file does not match the checksum in the catalog, so it was not kept.",
      );
    }
    await cache.put(key(file.sha256), new Response(data));
    done += file.sizeMB * 1e6;
  }
  onProgress(1);
}

export async function removeModel(model: Model, cache: ModelCache): Promise<void> {
  for (const file of browserFiles(model)) await cache.delete(key(file.sha256));
}
