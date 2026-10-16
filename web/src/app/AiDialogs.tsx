/**
 * The studio side of the AI provider framework (PLAN.md section 3.11): the AI providers dialog
 * with the provider for each task, the consent dialog shown before a request leaves the device,
 * and the session request log.
 */
import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { catalog } from "@/catalog";
import { checkEndpoint } from "@/core/ai/endpoint";
import {
  downloadModel,
  isCached,
  removeModel,
  runsOnDevice,
  totalMB,
} from "@/core/ai/ondevice/store";
import { maskKey } from "@/core/ai/secrets";
import type { ProviderKindId } from "@/core/ai/types";
import { ENGINE_PROVIDER, ON_DEVICE_PROVIDER, requestLog, secrets, useAi } from "@/state/ai";
import { useUi } from "@/state/ui";

import { classicalName } from "./aiActions";
import { openModelCache } from "./onDeviceAdapter";
import { formatBytes } from "./format";

const FIELD =
  "h-7 w-full rounded-control border border-border-control bg-raised px-2 text-sm text-text outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

/** The task setting for no provider. Radix Select needs a value that is not empty. */
const NONE = "none";

/** The kinds you set up by hand. Local and on-device models come with their phases. */
const ADDABLE: readonly ProviderKindId[] = ["remote-engine", "external-api"];

const kindName = (id: ProviderKindId) => catalog.providers.find((k) => k.id === id)?.name ?? id;

export function AiProvidersDialog() {
  const open = useUi((s) => s.dialog === "ai-providers");
  const setDialog = useUi((s) => s.setDialog);
  const providers = useAi((s) => s.providers);
  const tasks = useAi((s) => s.tasks);
  const setTaskProvider = useAi((s) => s.setTaskProvider);
  const removeProvider = useAi((s) => s.removeProvider);
  // Keys live outside the store, so redraw the list when one changes.
  const [, setVersion] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "ai-providers" : null)}
      title="AI providers"
      description="Choose who runs each AI task. With no provider, use the classical tool."
      className="w-[min(44rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setDialog("ai-log")}>
            Request log
          </Button>
          <Button variant="primary" onClick={() => setDialog(null)}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 overflow-y-auto p-4 text-sm">
        <section aria-labelledby="ai-tasks" className="flex flex-col gap-2">
          <h3 id="ai-tasks" className="text-xs font-semibold text-text-secondary">
            Tasks
          </h3>
          {catalog.aiTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-secondary">{task.name}</span>
              <Select
                label={`Provider for ${task.name}`}
                value={tasks[task.id] ?? NONE}
                onChange={(value) => setTaskProvider(task.id, value === NONE ? null : value)}
                options={[
                  { value: NONE, label: `None. Use ${classicalName(task)}` },
                  { value: ENGINE_PROVIDER.id, label: ENGINE_PROVIDER.name },
                  { value: ON_DEVICE_PROVIDER.id, label: ON_DEVICE_PROVIDER.name },
                  ...providers.map((p) => ({ value: p.id, label: p.name })),
                ]}
                className="w-72"
              />
            </div>
          ))}
        </section>
        <section aria-labelledby="ai-list" className="flex flex-col gap-2">
          <h3 id="ai-list" className="text-xs font-semibold text-text-secondary">
            Providers
          </h3>
          <p className="text-xs">
            <span className="font-medium text-text">{ENGINE_PROVIDER.name}</span>{" "}
            <span className="text-text-muted">
              Built in. Runs on this computer with the models you download, so nothing is sent.
            </span>
          </p>
          {providers.length === 0 ? (
            <p className="text-xs text-text-muted">No other providers yet. Add one below.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {providers.map((p) => {
                const key = secrets.get(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-text">{p.name}</span>{" "}
                      <span className="text-text-muted">
                        {kindName(p.kind)}
                        {p.baseUrl ? `, ${p.baseUrl}` : ""}
                        {key
                          ? `, key ${maskKey(key)} ${secrets.remembered(p.id) ? "remembered" : "for this session"}`
                          : ""}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        removeProvider(p.id);
                        setVersion((v) => v + 1);
                      }}
                    >
                      Remove {p.name}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <OnDeviceModels />
        <AddProvider onAdded={() => setVersion((v) => v + 1)} />
      </div>
    </Dialog>
  );
}

/**
 * Models that run in this browser. Each one shows its size and license, and downloads only when
 * you click Download. Files are checked against their SHA-256 and kept in this browser.
 */
function OnDeviceModels() {
  const models = catalog.models.filter(runsOnDevice);
  const [state, setState] = useState<Record<string, "ready" | "missing" | number | string>>({});
  const available = typeof caches !== "undefined";

  useEffect(() => {
    if (!available) return;
    let current = true;
    void openModelCache().then(async (cache) => {
      const entries = await Promise.all(
        models.map(async (m) => [m.id, (await isCached(m, cache)) ? "ready" : "missing"] as const),
      );
      if (current) setState(Object.fromEntries(entries));
    });
    return () => {
      current = false;
    };
    // The catalog does not change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const set = (id: string, value: "ready" | "missing" | number | string) =>
    setState((old) => ({ ...old, [id]: value }));

  return (
    <section aria-labelledby="ai-device" className="flex flex-col gap-2">
      <h3 id="ai-device" className="text-xs font-semibold text-text-secondary">
        On-device models
      </h3>
      {!available ? (
        <p className="text-xs text-text-muted">
          This browser cannot keep models. Open the studio over HTTPS or on localhost.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {models.map((m) => {
            const status = state[m.id];
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="min-w-0">
                  <span className="font-medium text-text">{m.name}</span>{" "}
                  <span className="text-text-muted">
                    {totalMB(m)} MB. {m.license}
                    {m.nonCommercial ? " Non-commercial use only." : ""}
                  </span>
                  {typeof status === "string" && status !== "ready" && status !== "missing" ? (
                    <span role="alert" className="block text-danger">
                      {status}
                    </span>
                  ) : null}
                </span>
                {status === "ready" ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void openModelCache()
                        .then((cache) => removeModel(m, cache))
                        .then(() => set(m.id, "missing"))
                    }
                  >
                    Remove {m.name}
                  </Button>
                ) : (
                  <Button
                    disabled={typeof status === "number"}
                    onClick={() => {
                      set(m.id, 0);
                      void openModelCache()
                        .then((cache) => downloadModel(m, cache, (share) => set(m.id, share)))
                        .then(() => set(m.id, "ready"))
                        .catch((error: unknown) =>
                          set(
                            m.id,
                            error instanceof Error ? error.message : "The download failed.",
                          ),
                        );
                    }}
                  >
                    {typeof status === "number"
                      ? `Downloading ${Math.round(status * 100)}%`
                      : `Download ${m.name}`}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddProvider({ onAdded }: { onAdded: () => void }) {
  const addProvider = useAi((s) => s.addProvider);
  const [kind, setKind] = useState<ProviderKindId>("external-api");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const ids = { name: useId(), url: useId(), model: useId(), key: useId(), note: useId() };
  const check = url.trim() ? checkEndpoint(url) : null;
  const external = kind === "external-api";
  const ready = name.trim() !== "" && check?.ok === true;

  const add = () => {
    if (!ready || !check.ok) return;
    const created = addProvider({
      kind,
      name: name.trim(),
      baseUrl: check.url.href,
      ...(external && model.trim() ? { model: model.trim() } : {}),
    });
    if (key) secrets.set(created.id, key, remember);
    setName("");
    setUrl("");
    setModel("");
    setKey("");
    setRemember(false);
    onAdded();
  };

  return (
    <section aria-labelledby="ai-add" className="flex flex-col gap-2.5">
      <h3 id="ai-add" className="text-xs font-semibold text-text-secondary">
        Add a provider
      </h3>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">Kind</span>
        <Select
          label="Provider kind"
          value={kind}
          onChange={(value) => setKind(value as ProviderKindId)}
          options={ADDABLE.map((id) => ({ value: id, label: kindName(id) }))}
          className="w-72"
        />
      </div>
      <p className="text-xs text-text-muted">
        {catalog.providers.find((k) => k.id === kind)?.description}
      </p>
      <label htmlFor={ids.name} className="flex flex-col gap-1 text-xs text-text-secondary">
        Name
        <input
          id={ids.name}
          className={FIELD}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label htmlFor={ids.url} className="flex flex-col gap-1 text-xs text-text-secondary">
        Base URL
        <input
          id={ids.url}
          className={FIELD}
          value={url}
          placeholder={external ? "https://api.example.com/v1" : "http://192.168.1.20:8765"}
          aria-describedby={ids.note}
          aria-invalid={check?.ok === false}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <p
        id={ids.note}
        className={check?.ok === false ? "text-xs text-danger" : "text-xs text-warning"}
      >
        {check === null ? "" : check.ok ? (check.warning ?? "") : check.reason}
      </p>
      {external ? (
        <label htmlFor={ids.model} className="flex flex-col gap-1 text-xs text-text-secondary">
          Model name (optional)
          <input
            id={ids.model}
            className={FIELD}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
      ) : null}
      <label htmlFor={ids.key} className="flex flex-col gap-1 text-xs text-text-secondary">
        API key {external ? "" : "(optional)"}
        <input
          id={ids.key}
          type="password"
          autoComplete="off"
          className={FIELD}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <Switch label="Remember the key on this device" checked={remember} onChange={setRemember} />
      <p className="text-xs text-text-muted">
        Without this, the key is forgotten when you close the tab. Keys are never logged, never put
        in URLs and never saved in projects.
      </p>
      <div>
        <Button variant="primary" disabled={!ready} onClick={add}>
          Add provider
        </Button>
      </div>
    </section>
  );
}

/** Asks before each request that leaves the device. There is no "always allow". */
export function ConsentDialog() {
  const pending = useAi((s) => s.pending);
  const answer = useAi((s) => s.answerConsent);
  const summary = pending?.summary;
  const parts = summary
    ? [
        `The image, ${summary.imageSize}${summary.crop ? ", a crop around the selection" : ", the full image"}.`,
        summary.mask ? "The selection mask." : null,
        summary.box ? "The box you drew." : null,
        summary.points > 0 ? `${summary.points} click points.` : null,
      ].filter((part): part is string => part !== null)
    : [];

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next) answer("cancel");
      }}
      title={summary ? `Send to ${summary.provider}?` : "Send?"}
      description={summary ? `${summary.task} runs on ${summary.host}.` : undefined}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => answer("cancel")}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => answer("send")}>
            Send once
          </Button>
        </>
      }
    >
      {summary ? (
        <div className="flex flex-col gap-3 p-4 text-sm">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary">What will be sent</h3>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {parts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-text-muted">
              About {formatBytes(summary.bytes)} of pixel data.
            </p>
          </div>
          <p className="text-xs">
            <span className="font-semibold text-text-secondary">What comes back: </span>
            {summary.returns}.
          </p>
          <p className="text-xs text-text-secondary">
            The privacy terms of {summary.host} apply to what you send.
            {summary.perSession
              ? " You will not be asked again for this host until you close the tab."
              : " You will be asked again before every request."}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

const subscribe = (listener: () => void) => requestLog.subscribe(listener);
const snapshot = () => requestLog.entries().length + requestLog.running() * 1e6;

/** The requests that left the device in this session. The log stays on the device. */
export function AiLogDialog() {
  const open = useUi((s) => s.dialog === "ai-log");
  const setDialog = useUi((s) => s.setDialog);
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const entries = requestLog.entries();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "ai-log" : null)}
      title="AI request log"
      description="Every request that left this device in this session. The log stays here."
      footer={
        <Button variant="primary" onClick={() => setDialog(null)}>
          Done
        </Button>
      }
    >
      <div className="overflow-y-auto p-4 text-xs">
        {entries.length === 0 ? (
          <p className="text-text-muted">No requests have left this device.</p>
        ) : (
          <table className="tabular w-full text-left">
            <thead className="text-text-secondary">
              <tr>
                <th className="py-1 font-medium">Time</th>
                <th className="py-1 font-medium">Host</th>
                <th className="py-1 font-medium">Task</th>
                <th className="py-1 font-medium">Size</th>
                <th className="py-1 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={index} className="border-t border-border-subtle">
                  <td className="py-1">{entry.time.toLocaleTimeString("en-US")}</td>
                  <td className="py-1">{entry.host}</td>
                  <td className="py-1">{entry.task}</td>
                  <td className="py-1">{formatBytes(entry.bytes)}</td>
                  <td className="py-1">{entry.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}
