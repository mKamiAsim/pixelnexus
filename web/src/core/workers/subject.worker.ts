/** Subject worker: Select > Subject and Select > Background, off the main thread. */
import { subjectMask } from "@/core/selection/subject";

import type { SubjectRequest, SubjectResponse } from "./subject-protocol";

/** The parts of the worker global scope this file uses. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<SubjectRequest>) => void) | null;
  postMessage(message: SubjectResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SubjectRequest>) => {
  const { id, width, height, buffer } = event.data;
  try {
    const mask = subjectMask({ width, height, data: new Uint8ClampedArray(buffer) });
    scope.postMessage({ id, ok: true, mask: mask.data }, [mask.data.buffer]);
  } catch (error) {
    scope.postMessage(
      {
        id,
        ok: false,
        message: error instanceof Error ? error.message : "Subject selection failed.",
      },
      [],
    );
  }
};
