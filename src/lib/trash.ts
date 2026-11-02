/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Trash Bin (shared, client-safe).

   Every delete of a Ticket / Invoice / Walk-In / Lead is a SOFT delete
   (`deleted_at`). The Trash Bin is the ONE place those records are listed,
   separated by type, with who deleted them and who created them, and from
   where an authorized user can restore them.

   Supabase mode : the DB is the source of truth (`/api/trash`, server-scoped).
   Local mode    : delete pushes a tombstone into localStorage (this file) so
                   the same page works without a backend.
   ────────────────────────────────────────────────────────────────────────── */

import { getCurrentActor } from "@/lib/activity-log";

export type TrashKind = "ticket" | "invoice" | "walkin" | "lead";

export interface TrashKindMeta {
  kind: TrashKind;
  /** Tab label. */
  label: string;
  /** Singular noun for sentences ("this ticket"). */
  noun: string;
  /** DB table. */
  table: "tickets" | "invoices" | "walk_ins" | "leads";
  /** Column header for the record number. */
  refLabel: string;
}

export const TRASH_KINDS: TrashKindMeta[] = [
  { kind: "ticket",  label: "Tickets",  noun: "ticket",  table: "tickets",  refLabel: "Ticket" },
  { kind: "invoice", label: "Invoices", noun: "invoice", table: "invoices", refLabel: "Invoice" },
  { kind: "walkin",  label: "Walk-Ins", noun: "walk-in", table: "walk_ins", refLabel: "Walk-In" },
  { kind: "lead",    label: "Leads",    noun: "lead",    table: "leads",    refLabel: "Lead" },
];

export const TRASH_KIND_META: Record<TrashKind, TrashKindMeta> = Object.fromEntries(
  TRASH_KINDS.map((k) => [k.kind, k]),
) as Record<TrashKind, TrashKindMeta>;

/** One row in the Trash Bin (same shape for DB and local mode). */
export interface TrashItem {
  kind: TrashKind;
  id: string;
  /** Human record number: T-012 / INV-004 / WI-001 / L-005. Never a UUID. */
  ref: string;
  /** Customer / lead name. */
  title: string;
  /** Secondary line: device, phone … */
  subtitle: string;
  status: string;
  /** Money value (ticket amount, invoice total, lead estimate); null = n/a. */
  amount: number | null;
  branchId: string | null;
  storeName: string | null;
  createdAt: string | null;
  createdByName: string | null;
  deletedAt: string;
  deletedByName: string | null;
}

export interface TrashCounts {
  ticket: number;
  invoice: number;
  walkin: number;
  lead: number;
}

export const EMPTY_TRASH_COUNTS: TrashCounts = { ticket: 0, invoice: 0, walkin: 0, lead: 0 };

/* ── Soft-delete stamping ─────────────────────────────────────────────────
   `deleted_by` is also stamped by the DB trigger (migration 0085), which
   always wins for end-user writes. Sending it from the client as well keeps
   the "who deleted" answer correct even before that migration is applied.
   Only a real staff UUID is sent (the column is an FK to staff.id). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function softDeletePatch(): { deleted_at: string; deleted_by?: string } {
  const { id } = getCurrentActor();
  return {
    deleted_at: new Date().toISOString(),
    ...(id && UUID_RE.test(id) ? { deleted_by: id } : {}),
  };
}

/* ── Local-mode tombstones ──────────────────────────────────────────────── */

const LOCAL_KEY = "repairox-trash";

export interface LocalTombstone extends TrashItem {
  /** The full removed record, so it can be put back exactly as it was. */
  record: unknown;
}

function readAll(): LocalTombstone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: LocalTombstone[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* quota — ignore */ }
}

export function readLocalTrash(): LocalTombstone[] {
  return readAll().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function pushLocalTombstone(
  item: Omit<TrashItem, "deletedAt" | "deletedByName" | "createdByName" | "storeName"> &
    Partial<Pick<TrashItem, "createdByName" | "storeName">>,
  record: unknown,
) {
  const { name } = getCurrentActor();
  const list = readAll().filter((t) => !(t.kind === item.kind && t.id === item.id));
  list.unshift({
    createdByName: null,
    storeName: null,
    ...item,
    deletedAt: new Date().toISOString(),
    deletedByName: name,
    record,
  });
  writeAll(list);
}

export function removeLocalTombstone(kind: TrashKind, id: string) {
  writeAll(readAll().filter((t) => !(t.kind === kind && t.id === id)));
}

/** "2 Nov 2026, 12:31 pm" */
export function formatTrashDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
