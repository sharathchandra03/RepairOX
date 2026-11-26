"use client";
/* Start a stock audit: pick the type + scope, decide blind counting, snapshot the system quantities. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoHint } from "@/components/ui/info-hint";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useStockAudit } from "@/lib/use-stock-audit";
import { AUDIT_KIND_HINT, AUDIT_KIND_LABEL, brandOf, itemsInScope, lineFromItem, scopeLabel, type AuditKind } from "@/lib/stock-audit";
import type { DocLine } from "@/lib/inventory-ops";
import type { InventoryItem } from "@/lib/inventory-data";
import { cn } from "@/lib/utils";

const KINDS: AuditKind[] = ["full", "cycle", "spot"];
const ALL = "all";
const field = "mt-1.5 h-[34px]";

export function AuditCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { stockItems } = useInventoryScope();
  const { createAudit } = useStockAudit();
  const [kind, setKind] = useState<AuditKind>("full");
  const [location, setLocation] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [brand, setBrand] = useState(ALL);
  const [blind, setBlind] = useState(true);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<DocLine[]>([]);
  const [saving, setSaving] = useState(false);

  const uniq = (f: (i: InventoryItem) => string) => [...new Set(stockItems.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const locations = useMemo(() => uniq((i) => i.store), [stockItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(() => uniq((i) => i.category), [stockItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const brands = useMemo(() => uniq(brandOf), [stockItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope = { location, category: kind === "full" ? ALL : category, brand: kind === "full" ? ALL : brand };
  const scoped = useMemo(() => itemsInScope(stockItems, scope), [stockItems, location, category, brand, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines: DocLine[] = kind === "spot" ? picked : scoped.map(lineFromItem);
  const canSave = lines.length > 0 && !saving;

  function reset() { setKind("full"); setLocation(ALL); setCategory(ALL); setBrand(ALL); setBlind(true); setNotes(""); setPicked([]); }
  function close() { reset(); onClose(); }
  function pick(it: InventoryItem) {
    if (picked.some((l) => l.itemId === it.id)) { toast.error(`${it.name} is already in the list`); return; }
    setPicked((p) => [...p, lineFromItem(it)]);
  }
  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const doc = await createAudit({ kind, blind, scope: scopeLabel(scope, kind), notes: notes.trim(), lines });
      if (doc) { toast.success(`${doc.id} started`); close(); router.push(`/inventory/stock-count/${doc.id}`); }
    } finally { setSaving(false); }
  }

  return (
    <RoxCenteredForm
      open={open}
      onClose={close}
      title="Start a stock audit"
      subtitle="The system quantity is saved the moment you start. Nothing changes in stock until a reviewer approves."
      icon={ClipboardCheck}
      width="max-w-2xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={!canSave}>{saving ? "Starting…" : `Start audit (${lines.length} item${lines.length === 1 ? "" : "s"})`}</Button></div>}
    >
      <div className="space-y-4">
        <div>
          <Label>Audit type</Label>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={cn("rounded-xl border px-3 py-2.5 text-left transition", kind === k ? "border-[#4361EE] bg-[#EEF1FD] ring-2 ring-[#4361EE]/15" : "border-input bg-card hover:border-[#4361EE]/40")}>
                <p className="text-[13px] font-semibold">{AUDIT_KIND_LABEL[k]}</p>
                <p className="text-[11.5px] text-muted-foreground">{AUDIT_KIND_HINT[k]}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Location</Label>
            <Select className={field} value={location} onChange={(e) => setLocation(e.target.value)} options={[{ label: "All locations", value: ALL }, ...locations.map((l) => ({ label: l, value: l }))]} />
          </div>
          {kind === "cycle" && (
            <>
              <div>
                <Label>Category</Label>
                <Select className={field} value={category} onChange={(e) => setCategory(e.target.value)} options={[{ label: "All categories", value: ALL }, ...categories.map((c) => ({ label: c, value: c }))]} />
              </div>
              <div>
                <Label>Brand</Label>
                <Select className={field} value={brand} onChange={(e) => setBrand(e.target.value)} options={[{ label: "All brands", value: ALL }, ...brands.map((b) => ({ label: b, value: b }))]} />
              </div>
            </>
          )}
        </div>

        {kind === "spot" && (
          <div>
            <Label>Add items to check</Label>
            <div className="mt-1.5"><InventorySearchBox kind="part" onSelect={pick} placeholder="Search a part by name, SKU or category…" /></div>
            {picked.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {picked.map((l) => (
                  <li key={l.itemId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate font-medium" title={l.name}>{l.name}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{l.itemId}</span></span>
                    <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setPicked((p) => p.filter((x) => x.itemId !== l.itemId))} className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <Checkbox checked={blind} onChange={() => setBlind((b) => !b)} aria-label="Blind count" className="mt-0.5" />
          <span className="text-[13px] font-semibold">
            Blind count
            <InfoHint content="Counters do not see the system quantity while counting, so they count what is on the shelf instead of copying the system. Reviewers still see it." className="ml-1.5 align-middle" />
          </span>
        </label>

        <div>
          <Label>Note (optional)</Label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Month-end count, Rack B" className="mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
        </div>
      </div>
    </RoxCenteredForm>
  );
}
