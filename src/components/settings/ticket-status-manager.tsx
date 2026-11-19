"use client";
/* RepairOX — Settings → Tickets → Statuses & Categories.
   Controlled editor (the page's Save button persists it):
     • Categories — add, rename, reorder, delete (only when empty).
     • Statuses per category — the 7 SYSTEM statuses (colour + category; they
       can't be renamed or deleted because business rules depend on them) and
       CUSTOM statuses (name, colour, category, "Works like" system stage,
       active). A custom status that is used on a ticket can't be deleted —
       it can be switched off, which hides it from the dropdown while old
       tickets keep showing it. */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type TicketStatus } from "@/lib/mock-data";
import {
  SYSTEM_STATUSES, suggestedBase, newStatusId, newCategoryId,
  type TicketStatusConfig, type CustomTicketStatus,
} from "@/lib/ticket-status-config";

export const PRESET_COLORS = [
  "#3B82F6", "#2563EB", "#1D4ED8", "#06B6D4", "#0891B2", "#0E7490",
  "#F59E0B", "#D97706", "#F97316", "#EA580C", "#10B981", "#059669",
  "#047857", "#6366F1", "#4F46E5", "#8B5CF6", "#7C3AED", "#EC4899",
  "#DB2777", "#F43F5E", "#E11D48", "#BE123C", "#71717A", "#3F3F46",
];

export function TicketStatusManager({ config, colors, onChange, onColorsChange, usedIds, disabled }: {
  config: TicketStatusConfig;
  colors: Record<string, string>;
  onChange: (c: TicketStatusConfig) => void;
  onColorsChange: (c: Record<string, string>) => void;
  /** Custom status ids currently used on any ticket / device. */
  usedIds: Set<string>;
  disabled?: boolean;
}) {
  const [palette, setPalette] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);

  const catOptions = config.categories.map((c) => ({ label: c.name, value: c.id }));
  const baseOptions = SYSTEM_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: s }));

  const patchCustom = (id: string, p: Partial<CustomTicketStatus>) =>
    onChange({ ...config, statuses: config.statuses.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const moveCat = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= config.categories.length) return;
    const cats = [...config.categories]; [cats[i], cats[j]] = [cats[j], cats[i]];
    onChange({ ...config, categories: cats });
  };
  const countIn = (catId: string) =>
    SYSTEM_STATUSES.filter((s) => config.builtins[s] === catId).length + config.statuses.filter((x) => x.categoryId === catId).length;
  const addStatus = (catId: string) => onChange({ ...config, statuses: [...config.statuses,
    { id: newStatusId(), name: "New status", color: PRESET_COLORS[(config.statuses.length * 5) % PRESET_COLORS.length], categoryId: catId, base: suggestedBase(config, catId), active: true }] });
  const addCategory = (name: string) => {
    const n = name.trim(); if (!n) return;
    onChange({ ...config, categories: [...config.categories, { id: newCategoryId(), name: n }] });
    setNewCat(null);
  };

  const total = useMemo(() => SYSTEM_STATUSES.length + config.statuses.length, [config.statuses.length]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">{config.categories.length} categories · {total} statuses. The ticket status dropdown shows them grouped in this order.</p>
        {!disabled && (newCat == null ? (
          <button type="button" onClick={() => setNewCat("")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#4361EE]/40 bg-[#EEF1FD] px-3 text-[12px] font-semibold text-[#4361EE] transition hover:bg-[#4361EE] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name, e.g. Warranty repair"
              onKeyDown={(e) => { if (e.key === "Enter") addCategory(newCat); if (e.key === "Escape") setNewCat(null); }} className="h-8 w-64" />
            <IconBtn label="Add category" onClick={() => addCategory(newCat)}><Check className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn label="Cancel" onClick={() => setNewCat(null)}><X className="h-3.5 w-3.5" /></IconBtn>
          </div>
        ))}
      </div>

      {config.categories.map((cat, ci) => {
        const sys = SYSTEM_STATUSES.filter((s) => config.builtins[s] === cat.id);
        const custom = config.statuses.filter((x) => x.categoryId === cat.id);
        const empty = sys.length + custom.length === 0;
        return (
          <div key={cat.id} className="rounded-2xl border border-border bg-card">
            {/* Category header */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
              <span className="h-px w-4 bg-border" />
              {renaming?.id === cat.id ? (
                <div className="flex items-center gap-1.5">
                  <Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: cat.id, name: e.target.value })} className="h-8 w-52"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renaming.name.trim()) { onChange({ ...config, categories: config.categories.map((c) => (c.id === cat.id ? { ...c, name: renaming.name.trim() } : c)) }); setRenaming(null); }
                      if (e.key === "Escape") setRenaming(null);
                    }} />
                  <IconBtn label="Save name" onClick={() => { if (!renaming.name.trim()) return; onChange({ ...config, categories: config.categories.map((c) => (c.id === cat.id ? { ...c, name: renaming.name.trim() } : c)) }); setRenaming(null); }}><Check className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Cancel" onClick={() => setRenaming(null)}><X className="h-3.5 w-3.5" /></IconBtn>
                </div>
              ) : (
                <p className="text-[12px] font-bold uppercase tracking-wider text-foreground">{cat.name}</p>
              )}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{sys.length + custom.length}</span>
              {!disabled && (
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn label="Rename category" onClick={() => setRenaming({ id: cat.id, name: cat.name })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move up" disabled={ci === 0} onClick={() => moveCat(ci, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move down" disabled={ci === config.categories.length - 1} onClick={() => moveCat(ci, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label={empty ? "Delete category" : "Move its statuses out before deleting"} disabled={!empty || config.categories.length <= 1}
                    onClick={() => onChange({ ...config, categories: config.categories.filter((c) => c.id !== cat.id) })} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  <button type="button" onClick={() => addStatus(cat.id)}
                    className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#4361EE] px-3 text-[12px] font-semibold text-white transition hover:bg-[#3450D8]">
                    <Plus className="h-3.5 w-3.5" /> Add status
                  </button>
                </div>
              )}
            </div>

            <div className="divide-y divide-border/60">
              {empty && <p className="px-4 py-4 text-[12px] text-muted-foreground">No statuses yet — add one, or move a status here.</p>}
              {sys.map((s) => (
                <Row key={s} id={`sys:${s}`} color={colors[s] || "#71717A"} palette={palette} setPalette={setPalette} disabled={disabled}
                  onColor={(c) => onColorsChange({ ...colors, [s]: c })}
                  name={<span className="inline-flex items-center gap-1.5 text-sm font-medium">{STATUS_LABEL[s]}
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600"><Lock className="h-2.5 w-2.5" />System</span></span>}
                  middle={<div className="w-40"><Select value={cat.id} disabled={disabled} className="h-[32px]" options={catOptions}
                    onChange={(e) => onChange({ ...config, builtins: { ...config.builtins, [s]: e.target.value } })} /></div>}
                  label={STATUS_LABEL[s]} />
              ))}
              {custom.map((x) => {
                const used = usedIds.has(x.id);
                return (
                  <Row key={x.id} id={x.id} color={x.color} palette={palette} setPalette={setPalette} disabled={disabled} muted={!x.active}
                    onColor={(c) => patchCustom(x.id, { color: c })}
                    name={<Input value={x.name} disabled={disabled} onChange={(e) => patchCustom(x.id, { name: e.target.value })} className="h-8 w-full max-w-[220px]" aria-label="Status name" />}
                    middle={<>
                      <div className="w-40"><Select value={cat.id} disabled={disabled} className="h-[32px]" options={catOptions} onChange={(e) => patchCustom(x.id, { categoryId: e.target.value })} /></div>
                      <div className="w-48"><Select value={x.base} disabled={disabled} className="h-[32px]" options={baseOptions.map((o) => ({ ...o, label: `Works like: ${o.label}` }))}
                        onChange={(e) => patchCustom(x.id, { base: e.target.value as TicketStatus })} /></div>
                    </>}
                    label={x.name || "New status"}
                    trailing={!disabled && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => patchCustom(x.id, { active: !x.active })} aria-pressed={x.active}
                          title={x.active ? "Shown in the status dropdown — click to hide" : "Hidden from the dropdown — click to show"}
                          className={cn("h-6 w-10 rounded-full p-0.5 transition", x.active ? "bg-[#4361EE]" : "bg-zinc-300")}>
                          <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition", x.active && "translate-x-4")} />
                        </button>
                        <IconBtn label={used ? "In use on tickets — switch it off instead" : "Delete status"} disabled={used} danger
                          onClick={() => onChange({ ...config, statuses: config.statuses.filter((y) => y.id !== x.id) })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    )} />
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
        How &quot;Works like&quot; is used
        <InfoHint content="A custom status always works like one of the 7 system statuses. That system stage drives the rules: Repaired deducts planned parts, Repaired & Collected needs an invoice, invoices sync the stage, and reports group by it. The custom name and colour are what people see." />
      </p>
    </div>
  );
}

function Row({ id, color, palette, setPalette, onColor, name, middle, label, trailing, disabled, muted }: {
  id: string; color: string; palette: string | null; setPalette: (v: string | null) => void; onColor: (c: string) => void;
  name: React.ReactNode; middle: React.ReactNode; label: string; trailing?: React.ReactNode; disabled?: boolean; muted?: boolean;
}) {
  const open = palette === id;
  return (
    <div className={cn("px-4 py-2.5", muted && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={disabled} onClick={() => setPalette(open ? null : id)}
          className="h-8 w-8 shrink-0 rounded-lg ring-2 ring-inset ring-black/10 transition hover:scale-110 focus:outline-none focus-visible:ring-[#4361EE]"
          style={{ backgroundColor: color }} title="Pick colour" aria-label={`Pick colour for ${label}`} />
        <div className="min-w-[180px] flex-1">{name}</div>
        <div className="flex flex-wrap items-center gap-2">{middle}</div>
        <span className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ backgroundColor: `${color}15`, color, boxShadow: `inset 0 0 0 1px ${color}30` }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="truncate">{label}</span>
        </span>
        <input type="text" value={color} disabled={disabled} maxLength={7} aria-label="Hex colour"
          onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onColor(e.target.value); }}
          className="w-20 rounded-md border border-input bg-card px-2 py-1 text-center font-mono text-[11px] focus:border-[#4361EE] focus:outline-none focus:ring-1 focus:ring-[#4361EE]/30" />
        {trailing}
      </div>
      {open && !disabled && (
        <div className="ml-11 mt-2 flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
          {PRESET_COLORS.map((pc) => (
            <button key={pc} type="button" onClick={() => { onColor(pc); setPalette(null); }}
              className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-125 focus:outline-none focus:ring-2 focus:ring-[#4361EE]"
              style={{ backgroundColor: pc }} title={pc} aria-label={`Set colour ${pc}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={cn("grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-35",
        danger ? "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" : "hover:border-[#4361EE]/40 hover:bg-[#EEF1FD] hover:text-[#4361EE]")}>
      {children}
    </button>
  );
}
