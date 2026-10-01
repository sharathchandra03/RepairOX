"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Form field controls (reusable, Lead-specific).

   Two controlled pickers used by the Lead Form so the 28-field contract is
   collected as REAL relationships, not free text:

     • AgentPicker         — a searchable SALES AGENT dropdown (eligible Sales
                             Agents only, store-scoped). Stores the USER ID
                             (staff.id) and shows the readable name. Used for
                             AGENTS (primary owner) and FOLLOW-UP AGENT. Two
                             users can share a role and stay distinct people.
     • DeviceCatalogPicker — cascading Category → Brand → Model from the shared
                             Device Catalog (useCatalog). Stores the catalog IDs
                             + a cached display label; never a duplicate device
                             master.

   Both reuse the RepairOX form visual language (same borders / focus / portal
   dropdown behaviour as the lead ConfigurableSelect).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, ChevronDown, Check, X, Smartphone, UserX, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { CAP, allow } from "@/lib/capabilities";
import { useCatalog, sortBrandsAZ, sortModelsAZ } from "@/lib/catalog-context";
import { cn } from "@/lib/utils";

/* ─── Shared portal dropdown shell (mirrors ConfigurableSelect behaviour) ─── */

function useAnchoredPanel() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 280 && r.top > spaceBelow;
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, width: r.width, top: r.bottom + 4 });
  };
  useEffect(() => {
    if (!open) return;
    const onReflow = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      place();
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  return { triggerRef, panelRef, open, setOpen, pos, place, mounted };
}

const triggerCls = (open: boolean, invalid?: boolean) =>
  cn(
    "flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all",
    open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : invalid ? "border-rose-300" : "border-input hover:border-[#4361EE]/40",
  );

/* ═══════════════════════════════════════════════════════════════════════
   SALES AGENT PICKER — eligible Sales Agents ONLY → stores USER ID, shows name.

   The option list is the Sales Agent directory (useLeads().salesAgentsFor):
   active users whose ROLE holds `leads_sales_agent`, scoped to the lead's
   store. Never the whole staff list, never filtered by display name, never a
   hard-coded list. Technicians / owners / managers are not offered unless
   their role is explicitly configured as Sales Agent. The DB ownership guard
   (migration 0049) enforces the same rule on save.
   ═══════════════════════════════════════════════════════════════════════ */

/** Empty state shared by every Sales Agent picker (form + table + drawer). */
export function SalesAgentEmptyState({ storeScoped }: { storeScoped?: boolean }) {
  const { can } = usePermissions();
  const canAddUser = allow(can, CAP.admin.addUser);
  return (
    <div className="px-3 py-4 text-center">
      <span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
        <UserX className="h-4 w-4" />
      </span>
      <p className="text-[12.5px] font-semibold text-foreground">No sales agents available</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {storeScoped
          ? "No active Sales Agent is configured for this store."
          : "No Sales Agent is configured for this account."}
      </p>
      {canAddUser && (
        <Link
          href="/settings/roles-permissions/add-user"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"
        >
          <UserPlus className="h-3 w-3" /> Add a Sales Agent user
        </Link>
      )}
    </div>
  );
}

export function AgentPicker({
  valueId, onChange, placeholder = "Select sales agent…", storeId, invalid, disabled, fallbackName, allowClear = true,
}: {
  /** Selected Sales Agent user id ("" = none). */
  valueId: string;
  /** Emits the chosen user id + display name (name is cached on the lead). */
  onChange: (userId: string, name: string) => void;
  placeholder?: string;
  /** The lead's store — only Sales Agents authorized for it are offered. */
  storeId?: string;
  invalid?: boolean;
  /** Read-only (e.g. the caller may not assign someone else). */
  disabled?: boolean;
  /** Display name for a historical value that is no longer an eligible agent. */
  fallbackName?: string;
  allowClear?: boolean;
}) {
  const { team } = usePermissions();
  const { salesAgentsFor, salesAgentsReady } = useLeads();
  const { triggerRef, panelRef, open, setOpen, pos, place, mounted } = useAnchoredPanel();
  const [query, setQuery] = useState("");

  const agents = useMemo(() => salesAgentsFor(storeId || null), [salesAgentsFor, storeId]);
  const selectedAgent = agents.find((a) => a.id === valueId);
  // A saved owner who is no longer eligible (role removed / deactivated / lost
  // store access) is still SHOWN (history is preserved) but flagged.
  const savedName = valueId ? (team.find((m) => m.id === valueId)?.name || fallbackName || "") : "";
  // Only flag once the directory has loaded (no false "not eligible" flash).
  const historicalName = salesAgentsReady && !selectedAgent && valueId ? (savedName || "Former agent") : "";
  const selectedName = selectedAgent?.name || historicalName || savedName;

  const q = query.trim().toLowerCase();
  const filtered = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;

  const toggle = () => { if (disabled) return; if (!open) place(); setOpen((o) => !o); };
  const close = () => { setOpen(false); setQuery(""); };

  return (
    <>
      <button
        ref={triggerRef} type="button" onClick={toggle} disabled={disabled}
        className={cn(triggerCls(open, invalid), disabled && "cursor-not-allowed bg-muted/40")}
        aria-haspopup="listbox" aria-expanded={open}
      >
        <span className={cn("flex min-w-0 items-center gap-1.5 truncate text-left", !selectedName && "text-muted-foreground")}>
          {selectedName ? (
            <>
              <Avatar name={selectedName} src={selectedAgent?.avatarUrl} size={18} />
              <span className="truncate">{selectedName}</span>
              {historicalName && (
                <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                  Not an active Sales Agent
                </span>
              )}
            </>
          ) : placeholder}
        </span>
        {!disabled && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[10040]" onClick={close} />
          <div ref={panelRef} data-lead-popover-open="true" role="listbox" style={{ left: pos.left, width: Math.max(pos.width, 240), top: pos.top, bottom: pos.bottom }}
            className="fixed z-[10041] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]">
            {agents.length > 0 && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sales agents…"
                  aria-label="Search sales agents"
                  className="w-full bg-transparent text-[13px] outline-none !shadow-none focus-visible:!shadow-none placeholder:text-muted-foreground" />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {valueId && allowClear && (
                <button type="button" onClick={() => { onChange("", ""); close(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              {!salesAgentsReady ? (
                <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">Loading sales agents…</p>
              ) : agents.length === 0 ? (
                <SalesAgentEmptyState storeScoped={!!storeId} />
              ) : filtered.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No sales agent matches “{query.trim()}”.</p>
              ) : (
                filtered.map((a) => (
                  <button key={a.id} type="button" role="option" aria-selected={a.id === valueId} onClick={() => { onChange(a.id, a.name); close(); }}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors", a.id === valueId ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60")}>
                    <Avatar name={a.name} src={a.avatarUrl} size={20} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.name}</span>
                      {a.roleLabel && <span className="block truncate text-[10.5px] font-normal text-muted-foreground">{a.roleLabel}</span>}
                    </span>
                    {a.id === valueId && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DEVICE CATALOG PICKER — Category → Brand → Model (shared catalog).
   Stores ids + a cached display label. Never duplicates the catalog.
   ═══════════════════════════════════════════════════════════════════════ */

export interface DeviceSelection {
  categoryId: string;
  brandId: string;
  modelId: string;
  /** Cached display label (brand + model, else category). */
  label: string;
}

/** Build the cached display label from the resolved catalog rows. */
export function deviceLabel(brandName?: string, modelName?: string, categoryName?: string): string {
  const bm = [brandName, modelName].filter(Boolean).join(" ").trim();
  return bm || categoryName || "";
}

function MiniSelect({
  value, options, onChange, placeholder, disabled, searchable = true, alwaysSearch = false,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string, name: string) => void;
  placeholder: string;
  disabled?: boolean;
  /** When false the dropdown never shows a search box. */
  searchable?: boolean;
  /** When true the search box always shows (ignores the 6+ options threshold). */
  alwaysSearch?: boolean;
}) {
  const { triggerRef, panelRef, open, setOpen, pos, place, mounted } = useAnchoredPanel();
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value);
  const filtered = query.trim() ? options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const toggle = () => { if (disabled) return; if (!open) place(); setOpen((o) => !o); };
  const close = () => { setOpen(false); setQuery(""); };
  return (
    <>
      <button ref={triggerRef} type="button" onClick={toggle} disabled={disabled} className={cn(triggerCls(open), disabled && "cursor-not-allowed opacity-50")}>
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{selected?.name || placeholder}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[10040]" onClick={close} />
          <div ref={panelRef} data-lead-popover-open="true" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            className="fixed z-[10041] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]">
            {searchable && (alwaysSearch || options.length > 6) && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
                  className="w-full bg-transparent text-[13px] outline-none !shadow-none focus-visible:!shadow-none placeholder:text-muted-foreground" />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {value && (
                <button type="button" onClick={() => { onChange("", ""); close(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No matches.</p>}
              {filtered.map((o) => (
                <button key={o.id} type="button" onClick={() => { onChange(o.id, o.name); close(); }}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors", o.id === value ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60")}>
                  <Check className={cn("h-3.5 w-3.5 text-[#4361EE]", o.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export function DeviceCatalogPicker({
  value, onChange,
}: {
  value: DeviceSelection;
  onChange: (next: DeviceSelection) => void;
}) {
  const { categories, brands, models } = useCatalog();

  const catOptions = useMemo(
    () => categories.filter((c) => c.enabled !== false).map((c) => ({ id: c.id, name: c.name })),
    [categories],
  );
  const brandOptions = useMemo(
    () => sortBrandsAZ(brands.filter((b) => b.categoryId === value.categoryId && b.enabled !== false)).map((b) => ({ id: b.id, name: b.name })),
    [brands, value.categoryId],
  );
  const modelOptions = useMemo(
    () => sortModelsAZ(models.filter((m) => m.brandId === value.brandId)).map((m) => ({ id: m.id, name: m.name })),
    [models, value.brandId],
  );

  const nameOf = (arr: { id: string; name: string }[], id: string) => arr.find((o) => o.id === id)?.name || "";

  const setCategory = (categoryId: string, name: string) => {
    // Changing category resets brand + model.
    onChange({ categoryId, brandId: "", modelId: "", label: deviceLabel(undefined, undefined, name) });
  };
  const setBrand = (brandId: string, name: string) => {
    const catName = nameOf(catOptions, value.categoryId);
    onChange({ ...value, brandId, modelId: "", label: deviceLabel(name, undefined, catName) });
  };
  const setModel = (modelId: string, name: string) => {
    const brandName = nameOf(brandOptions, value.brandId);
    const catName = nameOf(catOptions, value.categoryId);
    onChange({ ...value, modelId, label: deviceLabel(brandName, name, catName) });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MiniSelect value={value.categoryId} options={catOptions} onChange={setCategory} placeholder="Device Category" />
        <MiniSelect value={value.brandId} options={brandOptions} onChange={setBrand} placeholder="Brand" disabled={!value.categoryId} />
        <MiniSelect value={value.modelId} options={modelOptions} onChange={setModel} placeholder="Model Name" disabled={!value.brandId} alwaysSearch />
      </div>
      {value.label && (
        <p className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1FD] px-2.5 py-1 text-[11px] font-medium text-[#4361EE]">
          <Smartphone className="h-3 w-3" /> {value.label}
        </p>
      )}
    </div>
  );
}
