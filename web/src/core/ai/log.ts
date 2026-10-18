/**
 * The session log of requests that leave the device: time, host, task and
 * data size. It lives in memory, stays on the device, and never holds keys or pixels.
 */

export interface LogEntry {
  readonly time: Date;
  readonly provider: string;
  readonly host: string;
  readonly task: string;
  readonly bytes: number;
  outcome: "running" | "done" | "failed" | "cancelled";
}

export class RequestLog {
  private readonly items: LogEntry[] = [];
  private readonly listeners = new Set<() => void>();

  add(entry: Omit<LogEntry, "outcome">): LogEntry {
    const item: LogEntry = { ...entry, outcome: "running" };
    this.items.push(item);
    this.emit();
    return item;
  }

  finish(item: LogEntry, outcome: LogEntry["outcome"]): void {
    item.outcome = outcome;
    this.emit();
  }

  entries(): readonly LogEntry[] {
    return this.items;
  }

  /** Requests that have not finished, for the status bar indicator. */
  running(): number {
    return this.items.filter((item) => item.outcome === "running").length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
