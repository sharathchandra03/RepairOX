"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Read-only shared Lead reference (View Lead page).

   Shown when a user opens ANOTHER Sales Agent's lead through Lead Intelligence
   Search / Customer History. The page keeps the full View Lead design; this
   module adds:
     • ReferenceBanner         — the explicit READ-ONLY notice + ownership facts
                                 + safe actions (handoff request, new lead for
                                 this customer, view customer, copy).
     • HandoffRequestDialog    — captures reason/note; never changes ownership.
     • ReferenceActivityPanel  — contact attempts / notes / status changes.
     • HandoffRequestsPanel    — for the lead OWNER / managers: pending requests
                                 to approve or decline (approval uses the guarded
                                 reassignment path in the database).

   Enforcement is NOT here: hiding buttons is cosmetic. The database
   (leads_upd RLS + leads_ownership_guard + history-table RLS) rejects any write
   to a lead the viewer cannot normally see.
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, UserPlus, Copy, UserRound, ArrowRightLeft, Send, Check, X, History, Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { toast } from "@/components/ui/toaster";
import { DetailSection } from "@/components/common/detail-page";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { allow, CAP } from "@/lib/capabilities";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/leads-data";
import {
  rpcRequestHandoff, rpcDecideHandoff, newLeadForCustomerHref, customerHref, type ReferenceBundle, type HandoffRequest,
} from "@/lib/lead-search";
import { fmtDateTime } from "@/components/leads/search/lead-search-parts";

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

/* ── Banner ──────────────────────────────────────────────────────────────── */

export function ReferenceBanner({
  lead, bundle, onChanged,
}: { lead: Lead; bundle: ReferenceBundle; onChanged: () => void }) {
  const router = useRouter();
  const { can } = usePermissions();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const owner = lead.assignedToName || lead.agent || "another Sales Agent";
  const pending = bundle.pending_handoff && bundle.pending_handoff.status === "pending" ? bundle.pending_handoff : null;
  const canHandoff = !!lead.assignedTo && allow(can, CAP.lead.referenceRead);
  const canCreate = allow(can, CAP.lead.create) && !!lead.customerId;

  const cancelRequest = async () => {
    if (!pending) return;
    try {
      await rpcDecideHandoff(pending.id, "cancel");
      toast.success("Handoff request cancelled");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel the request");
    }
  };

  return (
    <div role="status" className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><Eye className="h-4.5 w-4.5" /></span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold tracking-wide text-amber-900">
              READ-ONLY REFERENCE
              <span className="ml-1.5 font-semibold normal-case tracking-normal text-amber-900">
                — This Lead is currently owned by {owner}. You can review the available details, activity history and follow-ups, but cannot edit this record.
              </span>
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] text-amber-900/90 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="inline font-semibold">Created by: </dt><dd className="inline">{bundle.created_by_name || "—"}</dd></div>
              <div><dt className="inline font-semibold">Current owner: </dt><dd className="inline">{owner}</dd></div>
              <div><dt className="inline font-semibold">Assigned: </dt><dd className="inline">{lead.assignedAt ? fmtDateTime(lead.assignedAt) : "—"}</dd></div>
              <div><dt className="inline font-semibold">Last updated: </dt><dd className="inline">{fmtDateTime(lead.updatedAt)}{bundle.updated_by_name ? ` by ${bundle.updated_by_name}` : ""}</dd></div>
            </dl>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canHandoff && !pending && (
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-400 bg-white" onClick={() => setHandoffOpen(true)}>
              <ArrowRightLeft className="h-3.5 w-3.5" /> Request Handoff
            </Button>
          )}
          {pending && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
                <Hourglass className="h-3 w-3" /> Handoff requested {fmtDateTime(pending.created_at)}
              </span>
              <Button size="sm" variant="ghost" className="gap-1 text-amber-900" onClick={cancelRequest}>
                <X className="h-3.5 w-3.5" /> Cancel request
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" variant="outline" className="gap-1.5 bg-white" onClick={() => router.push(newLeadForCustomerHref(lead.customerId))}>
              <UserPlus className="h-3.5 w-3.5" /> Create New Lead for This Customer
            </Button>
          )}
          {lead.customerId && allow(can, CAP.lead.customerHistory) && (
            <Button size="sm" variant="outline" className="gap-1.5 bg-white" onClick={() => router.push(customerHref(lead.customerId))}>
              <UserRound className="h-3.5 w-3.5" /> View Customer
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => copy(lead.leadNo, "Lead ID")}><Copy className="h-3.5 w-3.5" /> Lead ID</Button>
          {lead.number && <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => copy(lead.number, "Mobile number")}><Copy className="h-3.5 w-3.5" /> Mobile</Button>}
        </div>
      </div>
      <HandoffRequestDialog open={handoffOpen} lead={lead} onClose={() => setHandoffOpen(false)} onDone={() => { setHandoffOpen(false); onChanged(); }} />
    </div>
  );
}

/* ── Handoff request dialog ──────────────────────────────────────────────── */

export function HandoffRequestDialog({
  open, lead, onClose, onDone,
}: { open: boolean; lead: Lead; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setReason(""); setNote(""); } }, [open]);

  const submit = async () => {
    if (saving || !reason.trim()) return;
    setSaving(true);
    try {
      await rpcRequestHandoff(lead.id, reason.trim(), note.trim() || undefined);
      toast.success("Handoff requested", { description: `${lead.assignedToName || "The owner"} has been notified. Ownership is unchanged until it is approved.` });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoxCenteredForm
      open={open}
      onClose={onClose}
      title="Request Handoff"
      subtitle={`${lead.leadNo} · currently owned by ${lead.assignedToName || "another agent"}`}
      icon={ArrowRightLeft}
      width="max-w-lg"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !reason.trim()} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> {saving ? "Sending…" : "Send request"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
          This only notifies the current owner and managers. The lead stays with its owner until someone authorised approves the transfer.
        </p>
        <label className="block text-[12px] font-semibold text-foreground">
          Reason <span className="text-rose-600">*</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Customer called me directly and asked me to continue" className="mt-1.5" />
        </label>
        <label className="block text-[12px] font-semibold text-foreground">
          Note (optional)
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5" />
        </label>
      </div>
    </RoxCenteredForm>
  );
}

/* ── Activity panel (contact attempts / notes / status changes) ──────────── */

export function ReferenceActivityPanel({ bundle }: { bundle: ReferenceBundle }) {
  type Row = { at: string; title: string; detail: string; actor: string };
  const rows: Row[] = [
    ...bundle.activity.map((a) => ({
      at: String(a.occurred_at || a.created_at || ""),
      title: String(a.activity_type || "activity").replace(/_/g, " "),
      detail: [a.contact_status, a.result, a.note].filter(Boolean).join(" · "),
      actor: String(a.actor_name || ""),
    })),
    ...bundle.status_history.map((s) => ({
      at: String(s.changed_at || s.created_at || ""),
      title: "status changed",
      detail: [s.from_status, s.to_status].filter(Boolean).join(" → ") + (s.note ? ` · ${s.note}` : ""),
      actor: String(s.actor_name || ""),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <DetailSection icon={History} title="Contact Attempts & Activity" accent="violet">
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No calls, notes or status changes have been recorded on this lead yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 50).map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12.5px] font-semibold capitalize text-foreground">{r.title}</p>
                  <span className="text-[10.5px] text-muted-foreground">{fmtDateTime(r.at)}</span>
                </div>
                {r.detail && <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-muted-foreground">{r.detail}</p>}
                {r.actor && <p className="mt-0.5 text-[10.5px] text-zinc-400">by {r.actor}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

/* ── Owner / manager side: pending handoff requests ──────────────────────── */

export function HandoffRequestsPanel({ lead }: { lead: Lead }) {
  const { can } = usePermissions();
  const { canChangeLeadOwner } = useLeads();
  const [rows, setRows] = useState<HandoffRequest[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("lead_handoff_requests")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setRows((data as HandoffRequest[]) ?? []);
  }, [lead.id]);

  useEffect(() => { void load(); }, [load]);

  const canApprove = canChangeLeadOwner(lead);
  const canDecline = canApprove || allow(can, CAP.lead.reassignAny);

  if (rows.length === 0) return null;

  const decide = async (r: HandoffRequest, decision: "approve" | "decline") => {
    setBusy(r.id + decision);
    try {
      await rpcDecideHandoff(r.id, decision);
      toast.success(decision === "approve" ? `Lead transferred to ${r.requested_by_name || "the requester"}` : "Request declined");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the request");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5 shadow-card">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">Handoff requests</h3>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-amber-200 bg-white p-3">
            <p className="text-[12.5px] font-semibold text-foreground">{r.requested_by_name || "An agent"} wants to take over this lead</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{r.reason}</p>
            {r.note && <p className="mt-0.5 text-[11.5px] text-zinc-500">{r.note}</p>}
            <p className="mt-1 text-[10.5px] text-zinc-400">{fmtDateTime(r.created_at)}</p>
            <div className="mt-2 flex gap-2">
              {canApprove && (
                <Button size="sm" className="gap-1" disabled={!!busy} onClick={() => decide(r, "approve")}><Check className="h-3.5 w-3.5" /> Approve transfer</Button>
              )}
              {canDecline && (
                <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => decide(r, "decline")}><X className="h-3.5 w-3.5" /> Decline</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
