/* Ninja offline outbox. Every server-bound action is wrapped as an item with a
   stable id (used as the DB idempotency key). Items replay in order when the
   network returns. Never shown as committed until the server accepted it. */

export type OutboxKind = "transition" | "event" | "handover";

export interface OutboxItem {
  id: string;                 // uuid = idempotency key
  kind: OutboxKind;
  tripId: string;
  createdAt: string;          // device clock (kept as device_at; NOT authoritative)
  attempts: number;
  state: "pending" | "conflict" | "failed";
  error?: string;
  payload: Record<string, unknown>;
}

const KEY = "repairox-ninja-outbox-v1";
const listeners = new Set<() => void>();

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as OutboxItem[]; } catch { return []; }
}
function write(items: OutboxItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota: keep in-memory only */ }
  listeners.forEach((l) => l());
}
export function enqueue(item: Omit<OutboxItem, "id" | "createdAt" | "attempts" | "state"> & { id?: string }): OutboxItem {
  const full: OutboxItem = { id: item.id ?? uid(), createdAt: new Date().toISOString(), attempts: 0, state: "pending", ...item };
  write([...readOutbox(), full]);
  return full;
}
export function updateItem(id: string, patch: Partial<OutboxItem>) {
  write(readOutbox().map((i) => (i.id === id ? { ...i, ...patch } : i)));
}
export function removeItem(id: string) { write(readOutbox().filter((i) => i.id !== id)); }
export function clearResolved() { write(readOutbox().filter((i) => i.state === "pending")); }
export function subscribeOutbox(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Network-level failure (not a server rejection) => safe to queue and retry. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = String((e as { message?: string })?.message ?? e ?? "").toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|timeout|fetch/.test(m);
}
