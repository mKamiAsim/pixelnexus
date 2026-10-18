/**
 * API keys, per decision D24. In a desktop browser a key is kept for the session only, unless
 * you choose "remember on this device". Keys are never logged, never put in URLs, and never
 * exported in projects or pipelines. Only the adapter of the provider reads its key, to send it
 * to the configured base URL.
 *
 * The phone app will put keys in the OS secure storage (Phase 11), behind the same interface.
 */

/** The part of the Web Storage API this store needs, so tests can pass a fake. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "pixelnexus.ai-key.";

export class SecretStore {
  private readonly session = new Map<string, string>();

  constructor(private readonly device?: KeyStorage) {}

  set(providerId: string, key: string, remember: boolean): void {
    this.session.set(providerId, key);
    if (remember && this.device) this.device.setItem(PREFIX + providerId, key);
    else this.device?.removeItem(PREFIX + providerId);
  }

  get(providerId: string): string | undefined {
    return this.session.get(providerId) ?? this.device?.getItem(PREFIX + providerId) ?? undefined;
  }

  has(providerId: string): boolean {
    return this.get(providerId) !== undefined;
  }

  /** True when the key is kept on this device beyond the session. */
  remembered(providerId: string): boolean {
    return (this.device?.getItem(PREFIX + providerId) ?? null) !== null;
  }

  forget(providerId: string): void {
    this.session.delete(providerId);
    this.device?.removeItem(PREFIX + providerId);
  }

  /** Keys never print, even by accident. */
  toJSON(): Record<string, never> {
    return {};
  }

  toString(): string {
    return "[SecretStore]";
  }
}

/** Show the end of a key only, as in "...a1b2". */
export function maskKey(key: string): string {
  return key.length <= 4 ? "...." : `...${key.slice(-4)}`;
}
