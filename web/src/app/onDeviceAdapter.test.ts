import { describe, expect, it } from "vitest";

import { catalog } from "@/catalog";
import { createImage } from "@/core/image/types";
import type { ModelCache } from "@/core/ai/ondevice/store";

import { onDeviceAdapter, onDeviceModel } from "./onDeviceAdapter";

const provider = { id: "on-device", kind: "on-device" as const, name: "On-device models" };
const emptyCache = async (): Promise<ModelCache> => ({
  match: async () => undefined,
  put: async () => undefined,
  delete: async () => false,
});

describe("on-device adapter", () => {
  it("picks the first model of the task that runs in the browser", () => {
    expect(onDeviceModel("subject-select", provider)?.id).toBe("u2netp");
    expect(onDeviceModel("click-select", provider)?.id).toBe("efficientsam-ti");
    expect(onDeviceModel("super-resolution", provider)?.id).toBe("swin2sr-lightweight-x2");
    expect(onDeviceModel("jpeg-cleanup", provider)).toBeUndefined();
  });

  it("never downloads, and says which model to download", async () => {
    const task = catalog.aiTasks.find((t) => t.id === "subject-select");
    if (!task) throw new Error("no task");
    const adapter = onDeviceAdapter(provider, emptyCache);
    await expect(adapter.run({ task, image: createImage(4, 4) })).rejects.toThrow(
      "Download U2-Net small (u2netp) first, in Edit > AI providers.",
    );
  });
});
