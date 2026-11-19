/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Ticket status CATEGORIES + CUSTOM statuses (Settings → Tickets).

   The 7 system statuses (TicketStatus) carry business rules — invoice gating
   for "Repaired & Collected", parts deduction on "Repaired", invoice repair-
   status sync, the multi-device rollup and reports. They are never removed.

   On top of them an organisation can:
     • group statuses into CATEGORIES (Open / On hold / Closed / Cancelled / …)
       — the status dropdown is grouped by category;
     • add CUSTOM statuses (e.g. "L4 Repair", "Waiting on Customer"). Every
       custom status picks the SYSTEM STAGE it behaves like (`base`). A ticket
       stores the base in `status` (so every rule keeps working) and the custom
       status id in `statusId` (label + colour + category for display).

   Display resolution is safe by construction: a `statusId` is honoured only
   while its custom status' base still equals the record's `status`. If the
   status is changed by any other path (invoice sync, bulk update, rollup), the
   record falls back to the system status label — never a wrong label.
   Persisted as organization_settings.ticket_status_config (jsonb, 0109).
   ────────────────────────────────────────────────────────────────────────── */
import { STATUS_LABEL, type TicketStatus } from "@/lib/mock-data";

export interface StatusCategory { id: string; name: string }
export interface CustomTicketStatus {
  id: string;            // "cs_xxx" — stable, stored on tickets/devices
  name: string;
  color: string;         // #RRGGBB
  categoryId: string;
  base: TicketStatus;    // the system stage it behaves like
  active: boolean;       // inactive = hidden from the dropdown, still displays on old tickets
}
export interface TicketStatusConfig {
  categories: StatusCategory[];
  /** Category of each SYSTEM status. */
  builtins: Partial<Record<TicketStatus, string>>;
  statuses: CustomTicketStatus[];
}

/** Lifecycle order of the system statuses (also the order inside a category). */
export const SYSTEM_STATUSES: TicketStatus[] = [
  "in_progress", "waiting_approval", "waiting_parts", "repaired", "repaired_collected", "return", "return_collected",
];

export const DEFAULT_TICKET_STATUS_CONFIG: TicketStatusConfig = {
  categories: [
    { id: "open", name: "Open" },
    { id: "on_hold", name: "On hold" },
    { id: "closed", name: "Closed" },
    { id: "cancelled", name: "Cancelled" },
  ],
  builtins: {
    in_progress: "open",
    waiting_approval: "on_hold",
    waiting_parts: "on_hold",
    repaired: "closed",
    repaired_collected: "closed",
    return: "cancelled",
    return_collected: "cancelled",
  },
  statuses: [],
};

/** Suggested system stage for a new custom status in a category. */
export function suggestedBase(config: TicketStatusConfig, categoryId: string): TicketStatus {
  const sys = SYSTEM_STATUSES.find((s) => config.builtins[s] === categoryId);
  return sys ?? "in_progress";
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Make any stored / partial value safe to use (unknown ids dropped, every
 *  system status assigned to an existing category, at least one category). */
export function normalizeStatusConfig(raw: unknown): TicketStatusConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TicketStatusConfig>;
  const cats = (Array.isArray(r.categories) ? r.categories : DEFAULT_TICKET_STATUS_CONFIG.categories)
    .filter((c): c is StatusCategory => !!c && typeof c.id === "string" && typeof c.name === "string" && c.name.trim() !== "");
  const categories = cats.length ? cats : DEFAULT_TICKET_STATUS_CONFIG.categories;
  const ids = new Set(categories.map((c) => c.id));
  const builtins: Partial<Record<TicketStatus, string>> = {};
  for (const s of SYSTEM_STATUSES) {
    const want = r.builtins?.[s] ?? DEFAULT_TICKET_STATUS_CONFIG.builtins[s];
    builtins[s] = want && ids.has(want) ? want : categories[0].id;
  }
  const statuses = (Array.isArray(r.statuses) ? r.statuses : [])
    .filter((x): x is CustomTicketStatus => !!x && typeof x.id === "string" && typeof x.name === "string" && SYSTEM_STATUSES.includes(x.base))
    .map((x) => ({ ...x, name: x.name.trim() || "Untitled status", color: HEX.test(x.color) ? x.color : "#71717A",
      categoryId: ids.has(x.categoryId) ? x.categoryId : categories[0].id, active: x.active !== false }));
  return { categories, builtins, statuses };
}

/* ─── Options + display ─────────────────────────────────────────────── */
export interface StatusOption {
  /** Unique key: "sys:<status>" or the custom id. */
  key: string;
  status: TicketStatus;
  statusId?: string;
  label: string;
  color: string;
  categoryId: string;
  system: boolean;
}
export interface StatusGroup { category: StatusCategory; options: StatusOption[] }

export function statusGroups(config: TicketStatusConfig, colors: Record<string, string>, opts?: { includeInactive?: boolean }): StatusGroup[] {
  return config.categories.map((category) => ({
    category,
    options: [
      ...SYSTEM_STATUSES.filter((s) => config.builtins[s] === category.id).map((s): StatusOption => ({
        key: `sys:${s}`, status: s, label: STATUS_LABEL[s], color: colors[s] || "#71717A", categoryId: category.id, system: true,
      })),
      ...config.statuses.filter((c) => c.categoryId === category.id && (opts?.includeInactive || c.active)).map((c): StatusOption => ({
        key: c.id, status: c.base, statusId: c.id, label: c.name, color: c.color, categoryId: category.id, system: false,
      })),
    ],
  })).filter((g) => g.options.length > 0);
}

/** Label / colour / category for a record's status. `statusId` wins only when
 *  its custom status still has the same base as `status`. */
export function resolveStatus(status: TicketStatus, statusId: string | undefined | null, config: TicketStatusConfig, colors: Record<string, string>) {
  const custom = statusId ? config.statuses.find((c) => c.id === statusId && c.base === status) : undefined;
  const categoryId = custom?.categoryId ?? config.builtins[status] ?? config.categories[0]?.id;
  const category = config.categories.find((c) => c.id === categoryId);
  return {
    label: custom?.name ?? STATUS_LABEL[status] ?? String(status),
    color: custom?.color ?? colors[status] ?? "#71717A",
    categoryName: category?.name ?? "",
    statusId: custom?.id,
  };
}

export const newStatusId = () => `cs_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
export const newCategoryId = () => `cat_${Math.random().toString(36).slice(2, 8)}`;
