/**
 * AI providers and the provider chosen for each AI task (PLAN.md section 3.11). The provider
 * list and the task settings are a per-browser convenience in localStorage. Keys are kept apart
 * in the SecretStore, per D24, and never in this store. The session approvals and the request
 * log live in memory only.
 */
import { create } from "zustand";

import { catalog } from "@/catalog";
import { SessionApprovals, type ConsentSummary } from "@/core/ai/consent";
import { RequestLog } from "@/core/ai/log";
import type { ConsentAnswer, TaskSettings } from "@/core/ai/router";
import { SecretStore, type KeyStorage } from "@/core/ai/secrets";
import type { ProviderConfig, ProviderKindId } from "@/core/ai/types";

const STORAGE_KEY = "pixelnexus.ai.v1";
const KINDS: readonly ProviderKindId[] = catalog.providers.map((kind) => kind.id);

interface Saved {
  readonly providers: readonly ProviderConfig[];
  readonly tasks: TaskSettings;
}

const EMPTY: Saved = { providers: [], tasks: {} };

function isProvider(value: unknown): value is ProviderConfig {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    KINDS.includes(item.kind as ProviderKindId) &&
    (item.baseUrl === undefined || typeof item.baseUrl === "string") &&
    (item.model === undefined || typeof item.model === "string")
  );
}

/** Read the saved providers and task settings. Broken values fall back to none. */
export function loadAi(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<{
      providers: unknown;
      tasks: unknown;
    }>;
    const providers = Array.isArray(raw.providers) ? raw.providers.filter(isProvider) : [];
    const ids = new Set(providers.map((p) => p.id));
    const tasks: Record<string, string> = {};
    if (typeof raw.tasks === "object" && raw.tasks !== null) {
      for (const [task, id] of Object.entries(raw.tasks)) {
        if (typeof id === "string" && ids.has(id)) tasks[task] = id;
      }
    }
    return { providers, tasks };
  } catch {
    return EMPTY;
  }
}

function save(saved: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage is blocked. The settings still apply for this visit.
  }
}

/** localStorage behind guards, since storage can be blocked. */
const guardedStorage: KeyStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The key stays for the session only.
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was stored.
    }
  },
};

export const secrets = new SecretStore(typeof window === "undefined" ? undefined : guardedStorage);
export const approvals = new SessionApprovals();
export const requestLog = new RequestLog();

interface PendingConsent {
  readonly summary: ConsentSummary;
  readonly resolve: (answer: ConsentAnswer) => void;
}

interface AiState extends Saved {
  /** The consent dialog shows while this is set. */
  pending: PendingConsent | null;
  addProvider: (provider: Omit<ProviderConfig, "id">) => ProviderConfig;
  removeProvider: (id: string) => void;
  setTaskProvider: (task: string, providerId: string | null) => void;
  /** Ask before a request leaves the device. Resolves when you answer the dialog. */
  askConsent: (summary: ConsentSummary) => Promise<ConsentAnswer>;
  answerConsent: (answer: ConsentAnswer) => void;
}

let counter = 0;
const newId = () => `provider-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const useAi = create<AiState>()((set, get) => {
  const persist = (change: Partial<Saved>) => {
    set(change);
    const { providers, tasks } = get();
    save({ providers, tasks });
  };
  return {
    ...(typeof window === "undefined" ? EMPTY : loadAi()),
    pending: null,
    addProvider: (provider) => {
      const created: ProviderConfig = { ...provider, id: newId() };
      persist({ providers: [...get().providers, created] });
      return created;
    },
    removeProvider: (id) => {
      secrets.forget(id);
      const tasks = Object.fromEntries(
        Object.entries(get().tasks).filter(([, providerId]) => providerId !== id),
      );
      persist({ providers: get().providers.filter((p) => p.id !== id), tasks });
    },
    setTaskProvider: (task, providerId) => {
      const others = Object.entries(get().tasks).filter(([id]) => id !== task);
      persist({ tasks: Object.fromEntries(providerId ? [...others, [task, providerId]] : others) });
    },
    askConsent: (summary) =>
      new Promise<ConsentAnswer>((resolve) => {
        // A second request while one waits cancels the first, so nothing is sent unasked.
        get().pending?.resolve("cancel");
        set({ pending: { summary, resolve } });
      }),
    answerConsent: (answer) => {
      const pending = get().pending;
      set({ pending: null });
      pending?.resolve(answer);
    },
  };
});
