"use client";

/* View Incident — full page (View-record standard): hero + KPI cards, accented
   sections on the left, pinned rail (actions, history, related) on the right.
   Every approval step is permission-gated (CAP.inventory.approve) and a reporter
   can never verify or approve their own incident. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, Check, ClipboardList, History, Image as ImageIcon, Lock, MapPin, PackageSearch, ShieldAlert, UserRound, X } from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { DetailField, DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { PinnedRail } from "@/components/common/pinned-rail";
import { Button } from "@/components/ui/button";
import { ModalPortal, Z } from "@/components/ui/modal-portal";
import { fmtDate } from "@/components/inventory/doc-ui";
import { DecisionDialog } from "@/components/inventory/loss-damage/decision-dialog";
import { IncidentStatus, KindPill, money, statusLabel } from "@/components/inventory/loss-damage/ld-ui";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, type DocAction } from "@/lib/inventory-ops";
import { availableStock } from "@/lib/inventory-analytics";
import { CONFIRMED, buildIncidents, canMoveTo, canReviewOwn, incidentFromDoc, isOwnIncident, quickActions } from "@/lib/loss-damage";
import { NoPermission } from "@/components/common/no-permission";
import { cn } from "@/lib/utils";

/* The happy path shown as a stepper. Side exits (rejected / quarantined / restored)
   replace the steps they skip. */
const STEPS = [
  { key: "reported", label: "Reported" },
  { key: "verified", label: "Verified" },
  { key: "approved", label: "Approved" },
] as const;

function stepState(status: string): { done: number; exit?: { label: string; tone: "rose" | "violet" | "emerald" } } {
  switch (status) {
    case "reported": return { done: 0 };
    case "investigating": return { done: 0, exit: { label: "Under investigation", tone: "violet" } };
    case "verified": return { done: 1 };
    case "quarantined": return { done: 1, exit: { label: "Quarantined for repair", tone: "violet" } };
    case "approved": case "posted": return { done: 3 };
    case "restored": return { done: 1, exit: { label: "Restored to stock", tone: "emerald" } };
    case "rejected": return { done: 0, exit: { label: "Rejected", tone: "rose" } };
    default: return { done: 0 };
  }
}

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const { can, currentUser } = usePermissions();
  const { getDoc, docsOfType, ready } = useInventoryOps();
  const { inventory, stockMovements } = useStore();
  const { canViewCost } = useInventoryScope();
  const [pending, setPending] = useState<DocAction | null>(null);
  const [chain, setChain] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const doc = getDoc(decodeURIComponent(id));
  const inc = useMemo(() => (doc && doc.type === "write_off" ? incidentFromDoc(doc) : null), [doc]);
  const item = inc ? inventory.find((i) => i.id === inc.itemId) : undefined;
  const related = useMemo(
    () => (inc ? buildIncidents(docsOfType("write_off"), []).filter((r) => r.id !== inc.id && r.itemId && r.itemId === inc.itemId).slice(0, 4) : []),
    [inc, docsOfType],
  );
  const ledger = useMemo(() => (inc ? stockMovements.filter((m) => m.docNumber.split("/")[0] === inc.id) : []), [inc, stockMovements]);

  if (!allow(can, CAP.lossDamage.view)) return <NoPermission subtitle="Viewing Loss & Damage needs the Loss & Damage permission." />;

  if (!doc || !inc) {
    return (
      <div className="space-y-4">
        <BackPill href="/inventory/loss-damage" label="Back to Loss & Damage" />
        <p className="py-16 text-center text-muted-foreground">{ready ? "This incident doesn't exist or you don't have access to it." : "Loading…"}</p>
      </div>
    );
  }

  const own = isOwnIncident(inc, currentUser?.id);
  // Each step has its own permission (verify / approve / reject); a reporter never reviews their own report.
  const stepActions = DOC_META.write_off.actions(doc.status);
  const permitted = stepActions.filter((a) => canMoveTo(can, a.to));
  const ownerMay = canReviewOwn(can);
  const actions = own && !ownerMay ? [] : permitted;
  const locked = own && !ownerMay && permitted.length > 0;
  const selfNote = own && ownerMay && permitted.length > 0;
  const canApprove = permitted.length > 0;
  const quick = quickActions(inc, can, currentUser?.id);
  const st = stepState(doc.status);
  const confirmed = CONFIRMED.has(doc.status);
  const reportedQty = typeof doc.data.reportedQty === "number" ? doc.data.reportedQty : inc.qty;

  return (
    <div className="space-y-6">
      <BackPill href="/inventory/loss-damage" label="Back to Loss & Damage" />

      <DetailHero>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]"><ShieldAlert className="h-6 w-6" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Loss &amp; Damage incident</p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{inc.id}</h1>
              <p className="mt-0.5 text-[14px] font-semibold">{inc.model} · {inc.itemName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <KindPill kind={inc.kind} />
                <span className="w-56"><IncidentStatus status={doc.status} /></span>
                <span className="text-[13px] text-muted-foreground">{inc.reason}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <Button key={q.key} onClick={() => { setChain(!!q.chain); setPending(q.action); }} variant={q.tone === "danger" ? "destructive" : "primary"} className="gap-1.5">
                {q.tone !== "danger" && <Check className="h-4 w-4" />}{q.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Approval path */}
        <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Approval progress">
          {STEPS.map((s, i) => {
            const done = i < st.done;
            const current = i === st.done && !st.exit;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span className={cn("grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold ring-1 ring-inset",
                  done ? "bg-emerald-500 text-white ring-emerald-500" : current ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-card text-muted-foreground ring-border")}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-[13px] font-semibold", done || current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                {i < STEPS.length - 1 && <span className={cn("mx-1 h-px w-8", i < st.done - 1 || (i < st.done && st.done >= 3) ? "bg-emerald-400" : "bg-border")} />}
              </li>
            );
          })}
          {st.exit && (
            <li className={cn("ml-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset",
              st.exit.tone === "rose" ? "bg-rose-50 text-rose-700 ring-rose-200" : st.exit.tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-violet-50 text-violet-700 ring-violet-200")}>
              {st.exit.label}
            </li>
          )}
        </ol>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Quantity" value={inc.qty} />
          <SummaryCard label="Financial impact" value={canViewCost ? (inc.value > 0 ? money(inc.value) : "Not costed") : "Hidden"} />
          <SummaryCard label="Branch" value={inc.branch} />
          <SummaryCard label="Reported" value={fmtDate(inc.createdAt)} />
        </div>
      </DetailHero>

      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>You reported this incident, so another approver has to verify and approve it.</p>
        </div>
      )}
      {selfNote && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>You reported this incident. As an owner you can review it yourself; it will be recorded as <b>self-reviewed</b>.</p>
        </div>
      )}
      {stepActions.length > 0 && !canApprove && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Waiting for someone with the right permission to review this incident. Stock has not changed.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection icon={ClipboardList} title="Incident details" accent="rose">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Type" value={<KindPill kind={inc.kind} />} flat />
              <DetailField label="Reason" value={inc.reason} flat />
              <DetailField label="Model" value={inc.model} flat />
              <DetailField label="Item" value={inc.itemName} flat />
              <DetailField label="SKU" value={inc.itemId || "—"} flat />
              <DetailField label="Category" value={inc.category || "—"} flat />
              <DetailField label="Quantity" value={reportedQty !== inc.qty ? `${inc.qty} (reported ${reportedQty})` : String(inc.qty)} flat />
              {canViewCost && <DetailField label="Unit cost" value={money(inc.unitCost)} flat />}
              {canViewCost && <DetailField label="Total impact" value={money(inc.value)} highlight flat />}
              <DetailField label="Branch" value={<span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{inc.branch}</span>} flat />
              <DetailField label="Reported by" value={inc.reportedBy} flat />
              <DetailField label="Responsible employee" value={inc.responsible || "Not assigned"} flat />
              {typeof doc.data.decidedBy === "string" && doc.data.decidedBy && <DetailField label="Last decision by" value={`${doc.data.decidedBy} · ${fmtDate(String(doc.data.decidedAt ?? ""))}`} flat />}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[11px] font-medium text-muted-foreground">Remarks</p>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px]">{inc.notes || "—"}</p>
            </div>
          </DetailSection>

          <DetailSection icon={ImageIcon} title="Evidence" accent="indigo">
            {inc.photos.length === 0 ? <p className="text-[13px] text-muted-foreground">No photos were attached to this report.</p> : (
              <div className="flex flex-wrap gap-3">
                {inc.photos.map((p, i) => (
                  <button key={i} onClick={() => setZoom(p)} className="h-24 w-24 overflow-hidden rounded-xl border border-border transition hover:border-[#4361EE]" aria-label={`Open photo ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection icon={PackageSearch} title="Stock impact" accent="amber">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Stock effect" value={confirmed ? `−${inc.qty} written off` : doc.status === "rejected" || doc.status === "restored" ? "None. Stock unchanged" : "Not yet. Written off only after approval"} flat />
              <DetailField label="On hand now" value={item ? String(item.currentStock) : "—"} flat />
              <DetailField label="Available now" value={item ? String(availableStock(item)) : "—"} flat />
              <DetailField label="Ledger entry" value={ledger.length ? ledger.map((m) => m.docNumber).join(", ") : confirmed ? "Recorded before the ledger link existed" : "—"} flat />
            </div>
            {item && <Link href="/inventory/stock-movement" className="mt-4 inline-block text-[12.5px] font-semibold text-[#4361EE] hover:underline">Open stock movement ledger</Link>}
          </DetailSection>
        </div>

        <PinnedRail>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next step</h3>
            <div className="mt-3 space-y-2">
              {actions.length > 0 ? actions.map((a) => (
                <button key={a.to} onClick={() => { setChain(false); setPending(a); }}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[13px] font-semibold transition",
                    a.tone === "danger" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-border hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/60")}>
                  {a.tone === "danger" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4 text-[#4361EE]" />}{a.label}
                </button>
              )) : (
                <p className="text-[13px] text-muted-foreground">
                  {locked ? "Waiting for another approver." : stepActions.length === 0 ? `This incident is closed (${statusLabel(doc.status).toLowerCase()}).` : "None of the steps available here are switched on for your role."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
            <ol className="mt-4 space-y-4">
              {(inc.history.length ? inc.history : [{ at: inc.createdAt, by: inc.reportedBy, status: doc.status === "posted" ? "posted" : "reported" }]).slice().reverse().map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-[#4361EE]"><History className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold">{statusLabel(h.status)}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDate(h.at)}</span>
                    </div>
                    <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><UserRound className="h-3 w-3" />{h.by || "—"}{h.self && <span className="ml-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">self-reviewed</span>}</p>
                    {h.note && <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {related.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other incidents for this item</h3>
              <ul className="mt-3 space-y-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/inventory/loss-damage/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-[13px] hover:border-[#4361EE]/40">
                      <span className="font-semibold text-[#4361EE]">{r.id}</span>
                      <span className="truncate text-muted-foreground">{r.qty} × {r.reason}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PinnedRail>
      </div>

      <DecisionDialog doc={doc} action={pending} chain={chain} onClose={() => { setPending(null); setChain(false); }} />

      {zoom && (
        <ModalPortal>
          <div className={`fixed inset-0 ${Z.overlay} grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]`} onClick={() => setZoom(null)} role="dialog" aria-modal="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="Evidence" className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
            <button onClick={() => setZoom(null)} aria-label="Close" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-black"><X className="h-4 w-4" /></button>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
