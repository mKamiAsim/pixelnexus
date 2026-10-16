/**
 * ONNX Runtime Web for on-device models (PLAN.md Phase 7d). The runtime, about 27 MB of
 * WebAssembly, loads only when an on-device model first runs. It uses WebGPU where the browser
 * offers it, and WebAssembly on the CPU otherwise, the same in the Pages studio and the phone app.
 */
import type * as OrtModule from "onnxruntime-web/webgpu";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

type Ort = typeof OrtModule;
export type Session = OrtModule.InferenceSession;
export type Tensor = OrtModule.Tensor;

let loading: Promise<Ort> | undefined;

/** The ONNX Runtime Web module, loaded once. */
export function runtime(): Promise<Ort> {
  loading ??= import("onnxruntime-web/webgpu").then((ort) => {
    ort.env.wasm.wasmPaths = { wasm: wasmUrl };
    return ort;
  });
  return loading;
}

/** WebGPU when the browser has an adapter, else WebAssembly. */
export async function providers(): Promise<string[]> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      if (await gpu.requestAdapter()) return ["webgpu", "wasm"];
    } catch {
      // No usable adapter. WebAssembly works everywhere.
    }
  }
  return ["wasm"];
}

/**
 * A session for a model given as bytes. Extra files, such as an external data file, are passed
 * by the name the model refers to.
 */
export async function createSession(
  model: ArrayBuffer,
  external: readonly { path: string; data: ArrayBuffer }[] = [],
): Promise<Session> {
  const ort = await runtime();
  return ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: await providers(),
    ...(external.length
      ? { externalData: external.map((f) => ({ path: f.path, data: new Uint8Array(f.data) })) }
      : {}),
  });
}

/** A float32 tensor of the given shape. */
export async function floatTensor(data: Float32Array, dims: readonly number[]): Promise<Tensor> {
  const ort = await runtime();
  return new ort.Tensor("float32", data, dims);
}
