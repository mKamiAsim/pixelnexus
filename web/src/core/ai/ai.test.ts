import { describe, expect, it, vi } from "vitest";

import { catalog } from "@/catalog";
import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";

import { consentSummary, needsConsent, requestBytes, SessionApprovals } from "./consent";
import { cropImage, cropMask, downscaleFactor, maskBounds, withMargin } from "./crop";
import { checkEndpoint, isPrivateHost } from "./endpoint";
import { RequestLog } from "./log";
import { leavesDevice, route, type RouterContext } from "./router";
import { maskKey, SecretStore, type KeyStorage } from "./secrets";
import {
  AI_RESULT_LABEL,
  type AiOutput,
  type AiRequest,
  type ProviderAdapter,
  type ProviderConfig,
} from "./types";

const kinds = catalog.providers;
function defined<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${what}`);
  return value;
}

const task = (id: string) =>
  defined(
    catalog.aiTasks.find((t) => t.id === id),
    id,
  );

function request(id = "subject-select", size = 8): AiRequest {
  return { task: task(id), image: createImage(size, size), full: { width: size, height: size } };
}

const PROVIDERS: ProviderConfig[] = [
  { id: "local", kind: "engine-model", name: "Engine" },
  { id: "phone", kind: "on-device", name: "On device" },
  { id: "lab", kind: "remote-engine", name: "Lab PC", baseUrl: "http://192.168.1.20:8765" },
  { id: "cloud", kind: "external-api", name: "Cloud", baseUrl: "https://api.example.com/v1" },
  { id: "plain", kind: "external-api", name: "Plain", baseUrl: "http://api.example.com" },
];

function maskOutput(size = 8): AiOutput {
  return { kind: "mask", mask: createMask(size, size, 255) };
}

function context(
  settings: Record<string, string | null>,
  adapter: ProviderAdapter = { run: async () => maskOutput() },
  answer: "send" | "cancel" = "send",
): RouterContext & { asked: ReturnType<typeof vi.fn> } {
  const asked = vi.fn(async () => answer);
  return {
    settings,
    providers: PROVIDERS,
    kinds,
    adapter: () => adapter,
    askConsent: asked,
    approvals: new SessionApprovals(),
    log: new RequestLog(),
    asked,
  };
}

describe("catalog", () => {
  it("lists the four provider kinds and names a classical alternative for every task", () => {
    expect(kinds.map((k) => k.id)).toEqual([
      "engine-model",
      "on-device",
      "remote-engine",
      "external-api",
    ]);
    for (const t of catalog.aiTasks) {
      const pool = t.classical.kind === "tool" ? catalog.tools : catalog.filters;
      expect(pool.some((entry) => entry.id === t.classical.id)).toBe(true);
    }
  });
});

describe("endpoint rules", () => {
  it("accepts HTTPS and private HTTP with a warning, and rejects public HTTP", () => {
    expect(checkEndpoint("https://api.example.com/v1")).toMatchObject({
      ok: true,
      host: "api.example.com",
    });
    const local = checkEndpoint("http://127.0.0.1:8765");
    expect(local.ok && local.warning).toBeTruthy();
    expect(checkEndpoint("http://api.example.com")).toEqual({
      ok: false,
      reason: "External hosts must use HTTPS.",
    });
    expect(checkEndpoint("ftp://example.com").ok).toBe(false);
    expect(checkEndpoint("not a url").ok).toBe(false);
  });

  it("keeps keys and passwords out of URLs", () => {
    expect(checkEndpoint("https://user:secret@example.com").ok).toBe(false);
    expect(checkEndpoint("https://example.com/v1?key=abc").ok).toBe(false);
    expect(checkEndpoint("https://example.com/#token").ok).toBe(false);
  });

  it("knows private and loopback addresses", () => {
    for (const host of [
      "localhost",
      "a.localhost",
      "10.0.0.1",
      "172.20.1.1",
      "192.168.0.9",
      "169.254.1.1",
      "127.0.0.1",
      "[::1]",
      "fd12:3456::1",
      "fe80::1",
    ]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2001:db8::1"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe("consent rules", () => {
  const kind = (id: string) =>
    defined(
      kinds.find((k) => k.id === id),
      id,
    );

  it("never asks for local models, once per host for a remote engine, and every time for external AI", () => {
    const approvals = new SessionApprovals();
    expect(needsConsent(kind("engine-model"), undefined, approvals)).toBe(false);
    expect(needsConsent(kind("on-device"), undefined, approvals)).toBe(false);
    expect(needsConsent(kind("remote-engine"), "lab:8765", approvals)).toBe(true);
    approvals.add("LAB:8765");
    expect(needsConsent(kind("remote-engine"), "lab:8765", approvals)).toBe(false);
    expect(needsConsent(kind("remote-engine"), "other:8765", approvals)).toBe(true);
    approvals.add("api.example.com");
    expect(needsConsent(kind("external-api"), "api.example.com", approvals)).toBe(true);
  });

  it("summarizes what is sent and what comes back", () => {
    const crop: AiRequest = {
      task: task("object-select"),
      image: createImage(20, 10),
      mask: createMask(20, 10),
      box: { x: 1, y: 1, width: 5, height: 5 },
      full: { width: 100, height: 80 },
    };
    const summary = consentSummary(
      crop,
      defined(PROVIDERS[3], "provider"),
      kind("external-api"),
      "api.example.com",
    );
    expect(summary).toMatchObject({
      provider: "Cloud",
      host: "api.example.com",
      imageSize: "20 x 10 px",
      crop: true,
      mask: true,
      box: true,
      points: 0,
      returns: "a mask",
      bytes: 20 * 10 * 4 + 20 * 10,
      perSession: false,
    });
    expect(requestBytes(request())).toBe(8 * 8 * 4);
    expect(
      consentSummary(
        request("denoise"),
        defined(PROVIDERS[2], "provider"),
        kind("remote-engine"),
        "lab",
      ),
    ).toMatchObject({
      crop: false,
      returns: "an image",
      perSession: true,
    });
  });
});

describe("less data out", () => {
  it("crops to the selection box plus a margin, inside the image", () => {
    const mask = createMask(10, 8);
    mask.data[3 * 10 + 4] = 255;
    mask.data[5 * 10 + 6] = 128;
    const box = defined(maskBounds(mask), "bounds");
    expect(box).toEqual({ x: 4, y: 3, width: 3, height: 3 });
    expect(withMargin(box, 2, 10, 8)).toEqual({ x: 2, y: 1, width: 7, height: 7 });
    expect(withMargin(box, 10, 10, 8)).toEqual({ x: 0, y: 0, width: 10, height: 8 });
    const image = createImage(10, 8);
    image.data[(3 * 10 + 4) * 4] = 99;
    const cropped = cropImage(image, box);
    expect([cropped.width, cropped.height, cropped.data[0]]).toEqual([3, 3, 99]);
    expect(Array.from(cropMask(mask, box).data)).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 128]);
    expect(downscaleFactor(4000, 3000, 1024)).toBeCloseTo(0.256);
    expect(downscaleFactor(800, 600, 1024)).toBe(1);
  });
});

describe("secrets", () => {
  function fakeStorage(): KeyStorage & { items: Map<string, string> } {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => void items.set(k, v),
      removeItem: (k) => void items.delete(k),
    };
  }

  it("keeps keys for the session unless you ask to remember them", () => {
    const device = fakeStorage();
    const store = new SecretStore(device);
    store.set("cloud", "sk-12345678", false);
    expect(store.get("cloud")).toBe("sk-12345678");
    expect(device.items.size).toBe(0);
    expect(new SecretStore(device).get("cloud")).toBeUndefined();
    store.set("cloud", "sk-12345678", true);
    expect(store.remembered("cloud")).toBe(true);
    expect(new SecretStore(device).get("cloud")).toBe("sk-12345678");
    store.forget("cloud");
    expect(store.has("cloud")).toBe(false);
    expect(device.items.size).toBe(0);
  });

  it("never prints a key", () => {
    const store = new SecretStore();
    store.set("cloud", "sk-secret-value", false);
    expect(JSON.stringify({ store })).not.toContain("secret");
    expect(String(store)).not.toContain("secret");
    expect(maskKey("sk-secret-a1b2")).toBe("...a1b2");
    expect(maskKey("abc")).toBe("....");
  });
});

describe("router", () => {
  it("names the classical alternative when no provider is set", async () => {
    const outcome = await route(request(), context({}));
    expect(outcome).toEqual({
      status: "no-provider",
      classical: { kind: "tool", id: "subject-heuristic" },
    });
  });

  it("runs local providers without consent and labels the result", async () => {
    for (const id of ["local", "phone"]) {
      const ctx = context({ "subject-select": id });
      const outcome = await route(request(), ctx);
      expect(outcome.status).toBe("done");
      expect(outcome.status === "done" && outcome.result.label).toBe(AI_RESULT_LABEL);
      expect(ctx.asked).not.toHaveBeenCalled();
      expect(ctx.log.entries()).toHaveLength(0);
    }
  });

  it("asks before every external request and logs each one", async () => {
    const ctx = context({ "subject-select": "cloud" });
    await route(request(), ctx);
    await route(request(), ctx);
    expect(ctx.asked).toHaveBeenCalledTimes(2);
    expect(ctx.log.entries().map((e) => [e.host, e.task, e.bytes, e.outcome])).toEqual([
      ["api.example.com", "Subject selection", 256, "done"],
      ["api.example.com", "Subject selection", 256, "done"],
    ]);
  });

  it("asks once per session for a remote engine host", async () => {
    const ctx = context({ "subject-select": "lab" });
    await route(request(), ctx);
    await route(request(), ctx);
    expect(ctx.asked).toHaveBeenCalledTimes(1);
    expect(ctx.log.entries()).toHaveLength(2);
  });

  it("sends nothing when you cancel", async () => {
    const run = vi.fn(async () => maskOutput());
    const ctx = context({ "subject-select": "cloud" }, { run }, "cancel");
    expect(await route(request(), ctx)).toEqual({ status: "cancelled" });
    expect(run).not.toHaveBeenCalled();
    expect(ctx.log.entries()).toHaveLength(0);
  });

  it("refuses plain HTTP to a public host before asking", async () => {
    const ctx = context({ "subject-select": "plain" });
    const outcome = await route(request(), ctx);
    expect(outcome).toMatchObject({ status: "failed", message: "External hosts must use HTTPS." });
    expect(ctx.asked).not.toHaveBeenCalled();
  });

  it("reports a failure with the classical alternative and never switches provider", async () => {
    const adapter = vi.fn(() => ({ run: async () => Promise.reject(new Error("timeout")) }));
    const ctx = { ...context({ denoise: "cloud" }), adapter };
    const outcome = await route(request("denoise"), ctx);
    expect(outcome).toMatchObject({
      status: "failed",
      message: "Cloud failed: timeout",
      classical: { kind: "filter", id: "nlm" },
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(ctx.log.entries()[0]?.outcome).toBe("failed");
  });

  it("rejects a result of the wrong kind", async () => {
    const ctx = context({ denoise: "local" });
    const outcome = await route(request("denoise"), ctx);
    expect(outcome).toMatchObject({
      status: "failed",
      message: "Engine returned a mask, not an image.",
    });
  });

  it("treats an abort as a cancel", async () => {
    const run = async () => Promise.reject(new DOMException("stop", "AbortError"));
    const ctx = context({ "subject-select": "cloud" }, { run });
    expect(await route(request(), ctx)).toEqual({ status: "cancelled" });
    expect(ctx.log.entries()[0]?.outcome).toBe("cancelled");
  });

  it("reports a provider that was removed", async () => {
    const outcome = await route(request(), context({ "subject-select": "gone" }));
    expect(outcome).toMatchObject({
      status: "failed",
      message: "The provider set for this task no longer exists.",
    });
  });

  it("knows which kinds leave the device", () => {
    expect(kinds.filter(leavesDevice).map((k) => k.id)).toEqual(["remote-engine", "external-api"]);
  });
});
