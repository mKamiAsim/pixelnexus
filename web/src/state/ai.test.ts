// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { catalog } from "@/catalog";
import { classicalName, registerAdapter, reportOutcome, runAiTask } from "@/app/aiActions";
import { createImage } from "@/core/image/types";
import { createMask } from "@/core/mask/mask";
import type { AiRequest, AiTask } from "@/core/ai/types";

import { loadAi, requestLog, secrets, useAi } from "./ai";
import { useNotices } from "./notifications";

const KEY = "pixelnexus.ai.v1";

function task(id: string): AiTask {
  const found = catalog.aiTasks.find((t) => t.id === id);
  if (!found) throw new Error(`Missing task ${id}`);
  return found;
}

const request = (id = "subject-select"): AiRequest => ({
  task: task(id),
  image: createImage(4, 4),
  full: { width: 4, height: 4 },
});

const lastNotice = () => useNotices.getState().notices.at(-1);

describe("AI settings", () => {
  beforeEach(() => {
    localStorage.clear();
    useAi.setState({ providers: [], tasks: {}, pending: null });
  });

  it("loads valid providers and drops broken ones and dangling task settings", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        providers: [
          { id: "a", kind: "external-api", name: "A", baseUrl: "https://a.example" },
          { id: "b", kind: "teleport", name: "B" },
          { id: 3, kind: "on-device", name: "C" },
        ],
        tasks: { "subject-select": "a", denoise: "b", "jpeg-cleanup": 7 },
      }),
    );
    expect(loadAi()).toEqual({
      providers: [{ id: "a", kind: "external-api", name: "A", baseUrl: "https://a.example" }],
      tasks: { "subject-select": "a" },
    });
    localStorage.setItem(KEY, "not json");
    expect(loadAi()).toEqual({ providers: [], tasks: {} });
  });

  it("saves providers and task settings, but never keys", () => {
    const added = useAi.getState().addProvider({
      kind: "external-api",
      name: "Cloud",
      baseUrl: "https://api.example.com/",
    });
    secrets.set(added.id, "sk-very-secret", false);
    useAi.getState().setTaskProvider("denoise", added.id);
    const saved = localStorage.getItem(KEY) ?? "";
    expect(JSON.parse(saved)).toEqual({ providers: [added], tasks: { denoise: added.id } });
    expect(JSON.stringify(localStorage)).not.toContain("sk-very-secret");
    useAi.getState().setTaskProvider("denoise", null);
    expect(useAi.getState().tasks).toEqual({});
  });

  it("removing a provider clears its tasks and forgets its key", () => {
    const added = useAi
      .getState()
      .addProvider({ kind: "remote-engine", name: "Lab", baseUrl: "http://10.0.0.2:8765/" });
    secrets.set(added.id, "k-123456", true);
    useAi.getState().setTaskProvider("subject-select", added.id);
    useAi.getState().removeProvider(added.id);
    expect(useAi.getState().tasks).toEqual({});
    expect(secrets.has(added.id)).toBe(false);
  });

  it("a second consent request cancels the first", async () => {
    const summary = { provider: "A" } as never;
    const first = useAi.getState().askConsent(summary);
    const second = useAi.getState().askConsent(summary);
    expect(await first).toBe("cancel");
    useAi.getState().answerConsent("send");
    expect(await second).toBe("send");
    expect(useAi.getState().pending).toBeNull();
  });
});

describe("running an AI task", () => {
  beforeEach(() => {
    localStorage.clear();
    useAi.setState({ providers: [], tasks: {}, pending: null });
    useNotices.setState({ notices: [] });
  });

  it("names the classical alternative when no provider is set", async () => {
    const outcome = await runAiTask(request());
    expect(outcome.status).toBe("no-provider");
    expect(lastNotice()?.title).toBe("No AI provider is set for Subject selection");
    expect(lastNotice()?.detail).toBe(
      `Choose one in AI providers, or use ${classicalName(task("subject-select"))} instead.`,
    );
  });

  it("shows the consent dialog before an external request, and sends only after Send once", async () => {
    const run = vi.fn(async () => ({ kind: "mask" as const, mask: createMask(4, 4, 255) }));
    const unregister = registerAdapter("external-api", () => ({ run }));
    const added = useAi
      .getState()
      .addProvider({ kind: "external-api", name: "Cloud", baseUrl: "https://api.example.com/" });
    useAi.getState().setTaskProvider("subject-select", added.id);
    const running = runAiTask(request());
    await vi.waitFor(() => expect(useAi.getState().pending).not.toBeNull());
    expect(run).not.toHaveBeenCalled();
    expect(useAi.getState().pending?.summary).toMatchObject({
      host: "api.example.com",
      returns: "a mask",
    });
    useAi.getState().answerConsent("send");
    const outcome = await running;
    expect(outcome.status).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(requestLog.entries().at(-1)).toMatchObject({ host: "api.example.com", outcome: "done" });
    unregister();
  });

  it("never asks for a local engine model", async () => {
    const run = vi.fn(async () => ({ kind: "image" as const, image: createImage(4, 4) }));
    const unregister = registerAdapter("engine-model", () => ({ run }));
    useAi.setState({
      providers: [{ id: "local", kind: "engine-model", name: "Engine" }],
      tasks: { denoise: "local" },
    });
    const outcome = await runAiTask(request("denoise"));
    expect(outcome.status).toBe("done");
    expect(useAi.getState().pending).toBeNull();
    unregister();
  });

  it("runs a remote engine at its own base URL, after consent", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return Response.json(
          { detail: "Download the model DnCNN-3, gray first." },
          { status: 409 },
        );
      }),
    );
    useAi.setState({
      providers: [{ id: "lab", kind: "remote-engine", name: "Lab", baseUrl: "https://lab.test/" }],
      tasks: { "jpeg-cleanup": "lab" },
    });
    const running = runAiTask(request("jpeg-cleanup"));
    await vi.waitFor(() => expect(useAi.getState().pending).not.toBeNull());
    useAi.getState().answerConsent("send");
    await running;
    expect(urls[0]).toMatch(/^https:\/\/lab\.test\/api\/v1\/images/);
    expect(lastNotice()).toMatchObject({
      tone: "error",
      title: "JPEG cleanup did not run",
      detail: `Lab failed: Download the model DnCNN-3, gray first. Use ${classicalName(task("jpeg-cleanup"))} instead.`,
    });
    vi.unstubAllGlobals();
  });

  it("ends a failure message with one period", () => {
    reportOutcome(task("denoise"), {
      status: "failed",
      message: "External hosts must use HTTPS.",
      classical: task("denoise").classical,
    });
    expect(lastNotice()?.detail).toBe(
      `External hosts must use HTTPS. Use ${classicalName(task("denoise"))} instead.`,
    );
  });
});
