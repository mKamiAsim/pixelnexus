/**
 * Decode worker. It reads the header, checks the limits, then decodes, so a file that is too
 * large is rejected before the browser allocates memory for its pixels.
 */
import { decodeImageBytes } from "@/core/image/decode";
import { ImageFormatError, readImageHeader } from "@/core/image/format";
import { checkImage } from "@/core/image/limits";

import type { DecodeRequest, DecodeResponse } from "./decode-protocol";

/** The parts of the worker global scope this file uses. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(message: DecodeResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, buffer, limits } = event.data;
  const reply = (message: DecodeResponse, transfer: Transferable[] = []) =>
    scope.postMessage(message, transfer);
  try {
    const bytes = new Uint8Array(buffer);
    const header = readImageHeader(bytes);
    const issues = checkImage(bytes.byteLength, header, limits);
    const errors = issues.filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      reply({ id, ok: false, message: errors.map((e) => e.message).join(" "), issues });
      return;
    }
    const { image, path } = await decodeImageBytes(bytes, header);
    reply(
      {
        id,
        ok: true,
        width: image.width,
        height: image.height,
        buffer: image.data.buffer,
        header,
        issues,
        path,
      },
      [image.data.buffer],
    );
  } catch (error) {
    const message =
      error instanceof ImageFormatError ? error.message : "The file could not be opened.";
    reply({ id, ok: false, message, issues: [] });
  }
};
