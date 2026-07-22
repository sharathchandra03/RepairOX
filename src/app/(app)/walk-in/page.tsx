"use client";

import { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Download, Upload, Search, Eye, Pencil, MoreHorizontal,
  Trash2, Ticket, Receipt, Clock, Users, TrendingUp, UserPlus,
  DollarSign, RefreshCw, X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { useStore } from "@/lib/store";
import { WALKIN_STATUS_LABEL, WALKIN_STATUS_TONE, type WalkIn, type WalkInStatus } from "@/lib/mock-data";
import { formatINR, cn } from "@/lib/utils";

const SOURCES = ["Walk-In","Reference","Google","Website","Instagram","Facebook","WhatsApp","Existing Customer","Campaign","Advertisement","Other"];
const CATEGORIES = ["Mobile","Laptop","Tablet","Desktop","Smart Watch","Accessory","Other"];
const REASONS = ["Repair","Screen Damage","Battery Issue","Water Damage","Quotation","Accessory Purchase","General Enquiry","Software Issue","Data Recovery","Warranty","Other"];

function genWalkInId(existing: WalkIn[]): string {
  const max = existing.reduce((m, w) => { const n = parseInt(w.id.replace("WI-", ""), 10); return n > m ? n : m; }, 0);
  return `WI-${String(max + 1).padStart(3, "0")}`;
}

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

/** Parse date like "2-Jan", "10-Mar", "1-Feb" into ISO date string */
function parseWalkInDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const months: Record<string, string> = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };
  const parts = raw.split("-");
  if (parts.length === 2) {
    const day = parts[0].padStart(2, "0");
    const mon = months[parts[1]] || "01";
    return `2026-${mon}-${day}`;
  }
  return raw;
}

/** Map SOURCE column to our source values */
function mapSource(raw: string): string {
  if (!raw) return "Walk-In";
  const upper = raw.toUpperCase();
  if (upper === "WALKIN" || upper === "WALK-IN") return "Walk-In";
  if (upper === "REGULAR CUSTOMER" || upper === "EXISTING CUSTOMER") return "Existing Customer";
  if (upper.includes("S2S")) return "Reference";
  if (upper.includes("EMPLOYEE")) return "Reference";
  if (upper.includes("GOOGLE")) return "Google";
  if (upper.includes("REFERENCE")) return "Reference";
  if (upper.includes("CORP")) return "Walk-In";
  if (upper.includes("NINJA")) return "Other";
  return raw;
}

/** Map CATEGORY column */
function mapCategory(raw: string): string {
  if (!raw) return "Other";
  const upper = raw.toUpperCase();
  if (upper.includes("IPHONE") || upper.includes("ANDROID")) return "Mobile";
  if (upper.includes("MACBOOK") || upper.includes("WINDOWS")) return "Laptop";
  if (upper.includes("IPAD") || upper.includes("IPAD")) return "Tablet";
  if (upper.includes("IWATCH")) return "Smart Watch";
  if (upper.includes("IMAC")) return "Desktop";
  if (upper.includes("ACCESSORIES") || upper.includes("BUYBACK")) return "Accessory";
  return "Other";
}

/** Map STATUS column to our WalkInStatus */
function mapStatus(raw: string): WalkInStatus {
  if (!raw) return "waiting";
  const upper = raw.toUpperCase();
  if (upper === "TICKETS") return "converted_ticket";
  if (upper === "VISITER" || upper === "VISITOR") return "closed";
  if (upper === "ENQUIRY") return "quotation_given";
  if (upper === "ACCESSORIES") return "converted_invoice";
  if (upper === "REPEATED") return "follow_up";
  return "waiting";
}

export default function WalkInPage() {
  const router = useRouter();
  const { walkIns, addWalkIn, updateWalkIn, deleteWalkIn } = useStore();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<WalkIn | null>(null);
  const [viewTarget, setViewTarget] = useState<WalkIn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalkIn | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<Partial<WalkIn>[] | null>(null);

  // Filtered list
  const list = useMemo(() => walkIns.filter((w) => {
    const okStatus = statusFilter === "all" || w.status === statusFilter;
    const okQ = !q || `${w.id} ${w.customer} ${w.phone} ${w.model} ${w.reasons.join(" ")}`.toLowerCase().includes(q.toLowerCase());
    return okStatus && okQ;
  }), [walkIns, statusFilter, q]);

  // KPIs
  const kpis = useMemo(() => ({
    total: walkIns.length,
    today: walkIns.filter((w) => w.date === new Date().toISOString().slice(0, 10)).length,
    businessValue: walkIns.reduce((s, w) => s + w.businessValue, 0),
    converted: walkIns.filter((w) => w.status === "converted_ticket" || w.status === "converted_invoice").length,
    pending: walkIns.filter((w) => w.status === "waiting" || w.status === "inspection" || w.status === "follow_up").length,
    lost: walkIns.filter((w) => w.status === "lost").length,
  }), [walkIns]);

  const allSelected = list.length > 0 && list.every((w) => selected.has(w.id));
  const someSelected = list.some((w) => selected.has(w.id));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Shop" title="Walk-In" subtitle="Record and manage every customer visit."
        actions={<>
          <Button variant="outline" size="md" className="rounded-full" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".csv"; input.onchange = (e: any) => { const file = e.target.files?.[0]; if (!file) return; if (!file.name.endsWith(".csv")) { setImportResult("Only CSV files are supported. Please save your Excel as CSV first."); setTimeout(() => setImportResult(null), 5000); return; } const reader = new FileReader(); reader.onload = (ev) => { try { const text = ev.target?.result as string; const lines = text.split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) { setImportResult("No data rows found in the file."); setTimeout(() => setImportResult(null), 4000); return; } const rows = lines.slice(1); const parsed: Partial<WalkIn>[] = []; rows.forEach((line) => { const cols = parseCSVLine(line); if (cols.length < 3) return; const name = cols[2]?.trim(); const phone = cols[3]?.trim(); if (!name && !phone && !cols[5]?.trim()) return; parsed.push({ date: parseWalkInDate(cols[0]?.trim()), time: cols[1]?.trim() || "", customer: (name && name !== "NA") ? name : "Unknown", phone: (phone && phone !== "NA") ? phone : "", source: mapSource(cols[4]?.trim()), category: mapCategory(cols[5]?.trim()), model: cols[6]?.trim() || "", reasons: (cols[7]?.trim() || "").split(/[,;]/).map((r: string) => r.trim()).filter(Boolean), status: mapStatus(cols[8]?.trim()), ticketId: cols[9]?.trim() || undefined, invoiceValue: Number(cols[10]?.trim()) || 0, businessValue: Number(cols[10]?.trim()) || 0 }); }); if (parsed.length === 0) { setImportResult("No valid rows found."); setTimeout(() => setImportResult(null), 4000); return; } setImportPreview(parsed); } catch { setImportResult("Error reading file. Ensure it is a valid CSV."); setTimeout(() => setImportResult(null), 4000); } }; reader.readAsText(file); }; input.click(); }}><Upload className="h-4 w-4" /> Import CSV</Button>
          <Can permission="export_reports"><Button variant="outline" size="md" className="rounded-full" onClick={() => { const headers = "DATE,TIME,NAME,NUMBER,SOURCE,CATEGORY,MODEL,WALK IN REASON,STATUS,TICKET NO,INVOICE VALUE,BUSINESS VALUE"; const rows = walkIns.map((w) => `${w.date},${w.time},${w.customer},${w.phone},${w.source},${w.category},${w.model},"${w.reasons.join(";")}",${w.status},${w.ticketId || ""},${w.invoiceValue},${w.businessValue}`); const csv = [headers, ...rows].join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `walk-ins-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); }}><Download className="h-4 w-4" /> Export</Button></Can>
          <Button size="md" className="rounded-full" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Walk-In</Button>
        </>}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiMini icon={Users} label="Total" value={String(kpis.total)} />
        <KpiMini icon={Clock} label="Today" value={String(kpis.today)} />
        <KpiMini icon={DollarSign} label="Business Value" value={formatINR(kpis.businessValue)} />
        <KpiMini icon={Ticket} label="Converted" value={String(kpis.converted)} />
        <KpiMini icon={RefreshCw} label="Pending" value={String(kpis.pending)} />
        <KpiMini icon={UserPlus} label="Lost" value={String(kpis.lost)} />
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {[{ label: "All", value: "all" }, { label: "Waiting", value: "waiting" }, { label: "Inspection", value: "inspection" }, { label: "Converted", value: "converted_ticket" }, { label: "Follow-Up", value: "follow_up" }, { label: "Closed", value: "closed" }, { label: "Lost", value: "lost" }].map((f) => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all", statusFilter === f.value ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200")}>{f.label}</button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search walk-ins…" iconLeft={<Search className="h-4 w-4" />} />
        </div>
      </div>

      {/* Bulk actions */}
      {someSelected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{selected.size} selected</span>
          <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => { selected.forEach((id) => deleteWalkIn(id)); setSelected(new Set()); }}>
            <Trash2 className="h-3 w-3" /> Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((w) => w.id)))}
                    className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer" />
                </th>
                <th className="px-3 py-3">ID</th>
                <th className="py-3">Time</th>
                <th className="py-3">Customer</th>
                <th className="py-3">Category</th>
                <th className="py-3">Reason</th>
                <th className="py-3">Status</th>
                <th className="py-3 text-right">Value</th>
                <th className="py-3 text-right px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w, i) => (
                <motion.tr key={w.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }}
                  className={cn("group border-t border-border transition", selected.has(w.id) ? "bg-indigo-50/40" : "hover:bg-muted/40")}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(w.id)}
                      onChange={() => setSelected((p) => { const n = new Set(p); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; })}
                      className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer" />
                  </td>
                  <td className="px-3 py-3 font-semibold text-foreground whitespace-nowrap">{w.id}</td>
                  <td className="py-3 text-[12px] text-muted-foreground whitespace-nowrap">{w.time}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={w.customer} size={28} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{w.customer}</p>
                        <p className="text-[11px] text-muted-foreground">{w.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-[12px]">{w.category} · {w.model}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {w.reasons.slice(0, 2).map((r) => (
                        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{r}</span>
                      ))}
                      {w.reasons.length > 2 && <span className="text-[10px] text-muted-foreground">+{w.reasons.length - 2}</span>}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${WALKIN_STATUS_TONE[w.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />{WALKIN_STATUS_LABEL[w.status]}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums font-medium text-[12px]">{w.businessValue > 0 ? formatINR(w.businessValue) : "—"}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewTarget(w)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"><Eye className="h-3.5 w-3.5" /></button>
                      <Dropdown align="right" width="w-44" trigger={({ toggle }) => (
                        <button onClick={toggle} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
                      )}>
                        {(close) => (<>
                          <MenuItem icon={Eye} onClick={() => { setViewTarget(w); close(); }}>View</MenuItem>
                          <MenuItem icon={Pencil} onClick={() => { setEditTarget(w); close(); }}>Edit</MenuItem>
                          <MenuItem icon={Ticket} onClick={() => { router.push(`/tickets/new`); close(); }}>Convert to Ticket</MenuItem>
                          <MenuItem icon={Receipt} onClick={() => { router.push(`/invoice/create`); close(); }}>Convert to Invoice</MenuItem>
                          <div className="my-1 border-t border-border" />
                          <MenuItem icon={Trash2} danger onClick={() => { setDeleteTarget(w); close(); }}>Delete</MenuItem>
                        </>)}
                      </Dropdown>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">👋</div>
            <p className="font-semibold">No walk-ins found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your filters or create a new walk-in.</p>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">Showing {list.length} of {walkIns.length}</p>
        </div>
      </div>

      {/* Import Confirmation Dialog */}
      {importPreview && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setImportPreview(null)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border overflow-hidden">
            <div className="p-5 pb-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                  <Upload className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold">Import Walk-Ins</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Ready to import <span className="font-semibold text-foreground">{importPreview.length}</span> walk-in record{importPreview.length !== 1 ? "s" : ""}.</p>
                </div>
              </div>
              {/* Preview first 3 */}
              <div className="mt-4 space-y-1.5 max-h-[120px] overflow-y-auto">
                {importPreview.slice(0, 3).map((w, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                    <span className="font-medium">{w.customer}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{w.phone}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{w.category}</span>
                  </div>
                ))}
                {importPreview.length > 3 && <p className="text-[11px] text-muted-foreground text-center">and {importPreview.length - 3} more…</p>}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" size="sm" onClick={() => setImportPreview(null)}>Cancel</Button>
              <Button size="sm" onClick={() => {
                let counter = walkIns.reduce((m, w) => { const n = parseInt(w.id.replace("WI-", ""), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
                importPreview.forEach((data) => { counter++; addWalkIn({ ...data, id: `WI-${String(counter).padStart(3, "0")}` } as WalkIn); });
                setImportResult(`Successfully imported ${importPreview.length} walk-in${importPreview.length !== 1 ? "s" : ""}.`);
                setImportPreview(null);
                setTimeout(() => setImportResult(null), 4000);
              }}>
                <Upload className="h-3.5 w-3.5" /> Import {importPreview.length} Records
              </Button>
            </div>
          </motion.div>
        </div>
      , document.body)}

      {/* Import Result Toast */}
      <AnimatePresence>
        {importResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]">
            <span className="text-sm font-medium">{importResult}</span>
            <button onClick={() => setImportResult(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create/Edit Drawer */}
      <WalkInFormDrawer open={showCreate || !!editTarget} onClose={() => { setShowCreate(false); setEditTarget(null); }}
        walkIn={editTarget} onSave={(data) => {
          if (editTarget) { updateWalkIn(editTarget.id, data); }
          else { addWalkIn({ ...data, id: genWalkInId(walkIns) } as WalkIn); }
          setShowCreate(false); setEditTarget(null);
        }} />

      {/* View Drawer */}
      <WalkInViewDrawer walkIn={viewTarget} onClose={() => setViewTarget(null)} />

      {/* Delete Confirm */}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteWalkIn(deleteTarget.id); }}
        title="Delete Walk-In?" description="This record will be permanently removed." confirmLabel="Delete" danger />
    </div>
  );
}

/* ─── KPI Mini ───────────────────────────────────────────────────────── */
function KpiMini({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-lg font-bold tracking-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Form Drawer ────────────────────────────────────────────────────── */
function WalkInFormDrawer({ open, onClose, walkIn, onSave }: { open: boolean; onClose: () => void; walkIn: WalkIn | null; onSave: (data: Partial<WalkIn>) => void }) {
  const [form, setForm] = useState<Partial<WalkIn>>({});
  const isEdit = !!walkIn;

  // Reset form when opened
  useState(() => {
    if (walkIn) setForm(walkIn);
    else setForm({ date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), customer: "", phone: "", source: "Walk-In", category: "Mobile", model: "", reasons: [], status: "waiting", invoiceValue: 0, businessValue: 0 });
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleReason = (r: string) => setForm((f) => {
    const reasons = f.reasons || [];
    return { ...f, reasons: reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r] };
  });

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? `Edit ${walkIn?.id}` : "New Walk-In"} subtitle="Quick entry — fill essentials only." icon={UserPlus} width="max-w-md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onSave(form)}>Save</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Customer Name *</Label><Input value={form.customer || ""} onChange={(e: any) => set("customer", e.target.value)} placeholder="Customer name" /></div>
          <div className="space-y-1"><Label>Phone *</Label><Input value={form.phone || ""} onChange={(e: any) => set("phone", e.target.value)} placeholder="+91…" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Category</Label><Select value={form.category || "Mobile"} onChange={(e: any) => set("category", e.target.value)} options={CATEGORIES.map((c) => ({ label: c, value: c }))} /></div>
          <div className="space-y-1"><Label>Model</Label><Input value={form.model || ""} onChange={(e: any) => set("model", e.target.value)} placeholder="Device model" /></div>
        </div>
        <div className="space-y-1"><Label>Source</Label><Select value={form.source || "Walk-In"} onChange={(e: any) => set("source", e.target.value)} options={SOURCES.map((s) => ({ label: s, value: s }))} /></div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => toggleReason(r)}
                className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition", (form.reasons || []).includes(r) ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-muted text-muted-foreground ring-border hover:ring-zinc-300")}>{r}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1"><Label>Status</Label><Select value={form.status || "waiting"} onChange={(e: any) => set("status", e.target.value)}
          options={Object.entries(WALKIN_STATUS_LABEL).map(([v, l]) => ({ label: l, value: v }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date || ""} onChange={(e: any) => set("date", e.target.value)} /></div>
          <div className="space-y-1"><Label>Time</Label><Input type="time" value={form.time || ""} onChange={(e: any) => set("time", e.target.value)} /></div>
        </div>
      </div>
    </Drawer>
  );
}

/* ─── View Drawer ────────────────────────────────────────────────────── */
function WalkInViewDrawer({ walkIn, onClose }: { walkIn: WalkIn | null; onClose: () => void }) {
  if (!walkIn) return null;
  return (
    <Drawer open={!!walkIn} onClose={onClose} title={`Walk-In ${walkIn.id}`} subtitle={`${walkIn.date} at ${walkIn.time}`} icon={Eye} width="max-w-md">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={walkIn.customer} size={40} />
          <div>
            <p className="font-semibold">{walkIn.customer}</p>
            <p className="text-xs text-muted-foreground">{walkIn.phone}</p>
          </div>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border">
          <DetailRow label="Category">{walkIn.category}</DetailRow>
          <DetailRow label="Model">{walkIn.model}</DetailRow>
          <DetailRow label="Source">{walkIn.source}</DetailRow>
          <DetailRow label="Status">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${WALKIN_STATUS_TONE[walkIn.status]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />{WALKIN_STATUS_LABEL[walkIn.status]}
            </span>
          </DetailRow>
          {walkIn.ticketId && <DetailRow label="Ticket">{walkIn.ticketId}</DetailRow>}
          <DetailRow label="Invoice Value">{walkIn.invoiceValue > 0 ? formatINR(walkIn.invoiceValue) : "—"}</DetailRow>
          <DetailRow label="Business Value">{walkIn.businessValue > 0 ? formatINR(walkIn.businessValue) : "—"}</DetailRow>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reasons</p>
          <div className="flex flex-wrap gap-1.5">
            {walkIn.reasons.map((r) => (
              <span key={r} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">{r}</span>
            ))}
          </div>
        </div>
        {walkIn.notes && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-muted-foreground">{walkIn.notes}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
