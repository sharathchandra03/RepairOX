"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Pending Leads queue (future automated intake lands here).

   PENDING  = received, NOBODY owns it yet (public.pending_leads).
   ASSIGNED = a Sales Agent already owns the Lead (leads.assigned_user_id) and
              it waits in that agent's Assigned Leads inbox.
   These are different states and different tables — a pending record becomes
   a real Lead only when an authorised user assigns it.

   Gated by CAP.lead.pendingAccess (leads_pending_access): the entry is hidden
   without it AND pending_leads RLS (migration 0086) blocks the rows. Inbound
   ingestion (webhooks / round-robin / working hours) is NOT built in this
   phase; rows arrive via the service role later.

   Claim protocol (race-safe, auditable): pending → assigning (conditional
   UPDATE … WHERE status='pending', 0 rows = someone else took it) → addLead →
   assigned. A failed lead save releases the claim back to pending.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { Inbox, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface PendingLead {
  id: string;
  branchId: string;
  name: string;
  number: string;
  email: string;
  device: string;
  issue: string;
  source: string;
  captureChannel: string;
  region: string;
  ingestSource: string;
  pendingReason: string;
  receivedAt: string;
}

function rowToPending(r: any): PendingLead {
  return {
    id: r.id,
    branchId: r.branch_id ?? "",
    name: r.name ?? "",
    number: r.number ?? "",
    email: r.email ?? "",
    device: r.device ?? "",
    issue: r.issue ?? "",
    source: r.source ?? "",
    captureChannel: r.capture_channel ?? "",
    region: r.region ?? "",
    ingestSource: r.ingest_source ?? "manual",
    pendingReason: r.pending_reason ?? "",
    receivedAt: r.received_at ?? "",
  };
}

const REASON_LABEL: Record<string, string> = {
  no_agent_available: "No agent available",
  outside_hours: "Outside working hours",
  no_rule: "No routing rule",
  manual: "Manual",
};

/* ─── Claim protocol (client side of the DB guard) ─────────────────────── */

/** pending → assigning. Returns false when another user already claimed it. */
export async function claimPendingLead(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase
    .from("pending_leads").update({ status: "assigning" }).eq("id", id).eq("status", "pending").select("id");
  return !error && (data?.length ?? 0) === 1;
}

/** assigning → pending (the lead save failed, or the user backed out). */
export async function releasePendingLead(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("pending_leads").update({ status: "pending" }).eq("id", id).eq("status", "assigning");
}

/** assigning → assigned (server stamps assigned_by / assigned_at + audit event). */
export async function completePendingLead(id: string, leadId: string, agentId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase
    .from("pending_leads")
    .update({ status: "assigned", assigned_lead_id: leadId, assigned_to: agentId })
    .eq("id", id).eq("status", "assigning").select("id");
  return !error && (data?.length ?? 0) === 1;
}

export function usePendingLeads(enabled: boolean) {
  const [rows, setRows] = useState<PendingLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured || !supabase) { setRows([]); return; }
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("pending_leads").select("*").eq("status", "pending").order("received_at", { ascending: false }).limit(200);
    if (err) setError("Pending leads could not be loaded.");
    else setRows((data ?? []).map(rowToPending));
    setLoading(false);
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { rows, loading, error, refresh };
}

export function PendingLeadsPanel({
  rows, loading, error, onRefresh, onPick, storeName,
}: {
  rows: PendingLead[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onPick: (row: PendingLead) => void;
  storeName: (branchId: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          Inbound enquiries nobody owns yet. Assigning one creates the Lead and puts it in the chosen agent&apos;s Assigned Leads inbox.
        </p>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}

      {rows.length === 0 && !loading && !error ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Inbox className="h-5 w-5" /></span>
          <p className="mt-3 text-sm font-semibold text-foreground">No pending leads</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
            Pending inbound leads will appear here when the automated intake workflow is enabled — for example enquiries
            received after agents log out, outside working hours, or when no eligible agent is available.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.name || "Unnamed enquiry"}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[r.number, r.device, r.source].filter(Boolean).join(" · ") || "No details"}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Received {r.receivedAt ? new Date(r.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  {r.branchId ? ` · ${storeName(r.branchId)}` : ""}
                </p>
              </div>
              {r.pendingReason && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                  {REASON_LABEL[r.pendingReason] ?? r.pendingReason}
                </span>
              )}
              <Button type="button" size="sm" className="gap-1.5 rounded-full" onClick={() => onPick(r)}>
                <UserPlus className="h-3.5 w-3.5" /> Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
