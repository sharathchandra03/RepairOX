"use client";
/**
 * Ticket dropdown options — Lead Type + Source + Job Type.
 *
 * Built-in values live in code (they drive behaviour, e.g. Job Type
 * "estimate"/"warranty" shows guidance). Values users add with "+ Add" are
 * stored per organization in `ticket_field_options` (migration 0129) and
 * managed in Settings › Tickets › Assigned & Options, next to Assigned By/To.
 *
 * Dual-mode: Supabase when configured (realtime-synced), localStorage otherwise
 * (and in demo mode).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { usePermissions } from "./permissions-context";
import { logActivity } from "./activity-log";
import { toast } from "@/components/ui/toaster";

export type TicketOptionField = "lead_type" | "source" | "job_type";

export type TicketFieldOption = {
  id: string;
  field: TicketOptionField;
  label: string;
  createdAt: string;
};

export type SelectOption = { label: string; value: string };

/** Built-in values. Kept in code so existing tickets and logic keep working. */
export const BUILT_IN_TICKET_OPTIONS: Record<TicketOptionField, SelectOption[]> = {
  // Built-in lead types drive the WK / PD / OS avatar + the Tickets Type filter.
  lead_type: [
    { label: "Walk-In", value: "walkin" },
    { label: "Pick-Up", value: "pickup" },
    { label: "On-Site", value: "onsite" },
  ],
  source: [
    { label: "Google", value: "Google" },
    { label: "Meta", value: "Meta" },
    { label: "YouTube", value: "YouTube" },
    { label: "GMB", value: "GMB" },
    { label: "Organic", value: "Organic" },
    { label: "Reference", value: "Reference" },
  ],
  job_type: [
    { label: "Service", value: "service" },
    { label: "Accessories", value: "accessories" },
    { label: "Warranty", value: "warranty" },
    { label: "Repair Estimate", value: "estimate" },
    { label: "Buyback", value: "buyback" },
  ],
};

export const TICKET_OPTION_FIELD_LABEL: Record<TicketOptionField, string> = {
  lead_type: "Lead Type",
  source: "Source",
  job_type: "Job Type",
};

const LS_KEY = "repairox-ticket-field-options";

function rowToOption(r: any): TicketFieldOption {
  return { id: r.id, field: r.field, label: r.label ?? "", createdAt: r.created_at ?? new Date().toISOString() };
}

function loadLocal(): TicketFieldOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as TicketFieldOption[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(list: TicketFieldOption[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Merge built-ins + custom values for one field (deduped, built-ins first).
 *  `keep` makes sure a value already on a record is never dropped. */
export function mergeTicketOptions(field: TicketOptionField, custom: TicketFieldOption[], keep?: string): SelectOption[] {
  const out: SelectOption[] = [];
  const seen = new Set<string>();
  const push = (o: SelectOption) => {
    const k1 = norm(o.value), k2 = norm(o.label);
    if (!k1 || seen.has(k1) || seen.has(k2)) return;
    seen.add(k1); seen.add(k2);
    out.push(o);
  };
  BUILT_IN_TICKET_OPTIONS[field].forEach(push);
  custom.filter((c) => c.field === field).forEach((c) => push({ label: c.label, value: c.label }));
  if (keep) push({ label: keep, value: keep });
  return out;
}

/** Display label for a stored value (built-in value → its label, else the value). */
export function ticketOptionLabel(field: TicketOptionField, value: string | undefined | null): string {
  if (!value) return "";
  return BUILT_IN_TICKET_OPTIONS[field].find((o) => o.value === value)?.label ?? value;
}

type Ctx = {
  options: TicketFieldOption[];
  optionsFor: (field: TicketOptionField, keep?: string) => SelectOption[];
  /** Adds a value (or returns the existing one). Resolves to the value to select, or null on failure. */
  addOption: (field: TicketOptionField, label: string) => Promise<string | null>;
  deleteOption: (id: string) => Promise<void>;
};

const TicketFieldOptionsContext = createContext<Ctx | null>(null);

export function TicketFieldOptionsProvider({ children }: { children: ReactNode }) {
  const { isDemoMode, authReady } = usePermissions();
  const useDb = isSupabaseConfigured && !!supabase && !isDemoMode;
  const [options, setOptions] = useState<TicketFieldOption[]>([]);
  const ref = useRef(options);
  useEffect(() => { ref.current = options; }, [options]);

  // Load
  useEffect(() => {
    if (!useDb) { setOptions(loadLocal()); return; }
    if (!authReady) return;
    let cancelled = false;
    supabase!.from("ticket_field_options").select("*").order("created_at", { ascending: true }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // Table not migrated yet → fall back to the local cache so the form still works.
        console.warn("[ticket-field-options] load failed:", error.message);
        setOptions(loadLocal());
        return;
      }
      const list = (data ?? []).map(rowToOption);
      setOptions(list);
      saveLocal(list);
    });
    return () => { cancelled = true; };
  }, [useDb, authReady]);

  // Realtime
  useEffect(() => {
    if (!useDb || !authReady) return;
    const ch = supabase!
      .channel("ticket-field-options")
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_field_options" }, (p: any) => {
        if (p.eventType === "DELETE") {
          setOptions((prev) => prev.filter((o) => o.id !== p.old?.id));
          return;
        }
        const opt = rowToOption(p.new);
        setOptions((prev) => (prev.some((o) => o.id === opt.id) ? prev.map((o) => (o.id === opt.id ? opt : o)) : [...prev, opt]));
      })
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [useDb, authReady]);

  // Keep the local cache in sync (local mode = source of truth).
  useEffect(() => { if (!useDb) saveLocal(options); }, [options, useDb]);

  const optionsFor = useCallback(
    (field: TicketOptionField, keep?: string) => mergeTicketOptions(field, options, keep),
    [options]
  );

  const addOption = useCallback(async (field: TicketOptionField, raw: string) => {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) return null;
    // Already a built-in or custom value? Just select it.
    const builtIn = BUILT_IN_TICKET_OPTIONS[field].find((o) => norm(o.label) === norm(label) || norm(o.value) === norm(label));
    if (builtIn) return builtIn.value;
    const existing = ref.current.find((o) => o.field === field && norm(o.label) === norm(label));
    if (existing) return existing.label;

    const opt: TicketFieldOption = {
      id: `TFO-${field}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      field, label, createdAt: new Date().toISOString(),
    };
    setOptions((prev) => [...prev, opt]);
    if (useDb) {
      const { error } = await supabase!.from("ticket_field_options").insert({ id: opt.id, field, label });
      if (error) {
        setOptions((prev) => prev.filter((o) => o.id !== opt.id));
        console.error("[ticket-field-options] add failed:", error.code, error.message);
        toast.error(`${TICKET_OPTION_FIELD_LABEL[field]} not saved`, {
          description: error.code === "42P01" ? "Database table missing — apply migration 0129." : error.message,
        });
        return null;
      }
    }
    logActivity({
      module: "Ticket", action: `${TICKET_OPTION_FIELD_LABEL[field]} Added`, severity: "success",
      entity: TICKET_OPTION_FIELD_LABEL[field], reference: label,
      description: `Added "${label}" to ticket ${TICKET_OPTION_FIELD_LABEL[field]} options.`,
    });
    return label;
  }, [useDb]);

  const deleteOption = useCallback(async (id: string) => {
    const target = ref.current.find((o) => o.id === id);
    if (!target) return;
    setOptions((prev) => prev.filter((o) => o.id !== id));
    if (useDb) {
      const { error } = await supabase!.from("ticket_field_options").delete().eq("id", id);
      if (error) {
        setOptions((prev) => [...prev, target]);
        toast.error("Couldn't remove option", { description: error.message });
        return;
      }
    }
    logActivity({
      module: "Ticket", action: `${TICKET_OPTION_FIELD_LABEL[target.field]} Removed`, severity: "warning",
      entity: TICKET_OPTION_FIELD_LABEL[target.field], reference: target.label,
      description: `Removed "${target.label}" from ticket ${TICKET_OPTION_FIELD_LABEL[target.field]} options. Existing tickets keep their value.`,
    });
  }, [useDb]);

  const value = useMemo(() => ({ options, optionsFor, addOption, deleteOption }), [options, optionsFor, addOption, deleteOption]);
  return <TicketFieldOptionsContext.Provider value={value}>{children}</TicketFieldOptionsContext.Provider>;
}

export function useTicketFieldOptions(): Ctx {
  const ctx = useContext(TicketFieldOptionsContext);
  if (!ctx) throw new Error("useTicketFieldOptions must be used inside TicketFieldOptionsProvider");
  return ctx;
}
