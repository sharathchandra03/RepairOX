"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Repeat-enquiry / duplicate awareness for the Add Lead form (Phase 8).

   While a NEW lead is being captured, once the typed phone / e-mail (or the
   linked customer) matches an existing customer that already has OPEN leads,
   this notice shows them — with owner — and offers the informed choices:
     1. View Existing Lead
     2. Request Handoff from the current owner
     3. Create a Separate New Enquiry (reason required only when the open lead
        looks like the SAME device + issue)

   It is awareness, not a block: genuine repeat business is never prevented,
   nothing is merged, and no ownership / attribution is rewritten. The server
   (lead_repeat_check) returns only leads the caller may see; a user without
   the shared-reference key only ever sees their own.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, ExternalLink, ArrowRightLeft, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { statusTone } from "@/components/leads/lead-pills";
import { Textarea } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useSession } from "@/lib/use-session";
import { rpcRepeatCheck, isDbSearch, type RepeatCheck } from "@/lib/lead-search";
import type { Lead } from "@/lib/leads-data";
import { HandoffRequestDialog } from "@/components/leads/search/reference-mode";
import { ago } from "@/components/leads/search/lead-search-parts";

export interface RepeatState {
  /** An open lead for the same customer looks like the SAME device + issue. */
  significant: boolean;
  /** Any open lead exists for this customer. */
  hasOpen: boolean;
  /** Open lead numbers (for the audit note on the new lead). */
  leadNos: string[];
}

export function RepeatEnquiryNotice({
  phone, email, customerId, device, issue, reason, onReasonChange, onState,
}: {
  phone: string;
  email: string;
  customerId: string;
  device: string;
  issue: string;
  reason: string;
  onReasonChange: (v: string) => void;
  onState: (s: RepeatState) => void;
}) {
  const { can } = usePermissions();
  const { id: me } = useSession();
  const [data, setData] = useState<RepeatCheck | null>(null);
  const [handoffFor, setHandoffFor] = useState<Lead | null>(null);
  const seq = useRef(0);
  const canHandoff = allow(can, CAP.lead.referenceRead);

  useEffect(() => {
    if (!isDbSearch()) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 && !email.includes("@") && !customerId) { setData(null); return; }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await rpcRepeatCheck({ phone, email, customerId, device, issue });
        if (mySeq === seq.current) setData(r);
      } catch {
        if (mySeq === seq.current) setData(null); // awareness only — never block entry on a lookup error
      }
    }, 500);
    return () => clearTimeout(t);
  }, [phone, email, customerId, device, issue]);

  const leads = data?.leads ?? [];
  const significant = leads.some((l) => l.similar);

  useEffect(() => {
    onState({ significant, hasOpen: leads.length > 0, leadNos: leads.map((l) => l.lead_no) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [significant, leads.length]);

  if (leads.length === 0) return null;

  const tone = significant
    ? { ring: "border-amber-300", head: "bg-amber-50", chip: "bg-amber-100 text-amber-800", title: "text-amber-950" }
    : { ring: "border-sky-200", head: "bg-sky-50", chip: "bg-sky-100 text-sky-800", title: "text-sky-950" };

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", tone.ring)}>
      {/* Header */}
      <div className={cn("flex items-start gap-3 px-4 py-3", tone.head)}>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone.chip)}>
          {significant ? <AlertTriangle className="h-4.5 w-4.5" /> : <Info className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13.5px] font-bold leading-tight", tone.title)}>
            {significant ? "An existing enquiry may already be in progress" : "Returning customer"}
          </p>
          <p className="mt-0.5 text-[12px] text-zinc-600">
            <span className="font-semibold text-zinc-800">{data?.customer?.name || "This customer"}</span> already has{" "}
            <span className="font-semibold text-zinc-800">{leads.length} open lead{leads.length === 1 ? "" : "s"}</span>. Check before creating a new one.
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", tone.chip)}>{leads.length} open</span>
      </div>

      {/* Open leads */}
      <ul className="divide-y divide-border">
        {leads.slice(0, 3).map((l) => {
          const mine = l.assigned_user_id === me;
          return (
            <li key={l.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#EEF1FD] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#4361EE]">{l.lead_no}</span>
                    {l.status && <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", statusTone(l.status))}>{l.status}</span>}
                    {l.similar && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Same device &amp; issue</span>}
                    <span className="text-[11px] text-zinc-400">{ago(l.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-semibold leading-snug text-foreground">{l.device || "Device not recorded"}</p>
                  {l.issue && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{l.issue}</p>}
                </div>

                {/* Owner — the key fact */}
                <div className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-1.5", mine ? "border-teal-200 bg-teal-50" : "border-violet-200 bg-violet-50")}>
                  <Avatar name={l.assigned_to_name || "?"} size={26} />
                  <div className="leading-tight">
                    <p className={cn("text-[9.5px] font-bold uppercase tracking-wider", mine ? "text-teal-700" : "text-violet-700")}>{mine ? "Your lead" : "Owner"}</p>
                    <p className="text-[12.5px] font-semibold text-foreground">{mine ? "You" : l.assigned_to_name || "Unassigned"}</p>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <a
                  href={`/leads/${l.id}?from=search`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#4361EE]/30 bg-[#EEF1FD] px-2.5 text-[11.5px] font-semibold text-[#4361EE] transition hover:bg-[#E2E8FC]"
                >
                  <ExternalLink className="h-3 w-3" /> View lead
                </a>
                {canHandoff && l.assigned_user_id && !mine && (
                  <button
                    type="button"
                    onClick={() => setHandoffFor({ id: l.id, leadNo: l.lead_no, assignedToName: l.assigned_to_name || "", assignedTo: l.assigned_user_id || "" } as Lead)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    <ArrowRightLeft className="h-3 w-3" /> Request handoff
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {leads.length > 3 && <li className="px-4 py-2 text-center text-[11.5px] text-muted-foreground">+ {leads.length - 3} more open lead{leads.length - 3 === 1 ? "" : "s"}</li>}
      </ul>

      {/* Footer */}
      <div className="space-y-2.5 border-t border-border bg-zinc-50/70 px-4 py-3">
        <p className="flex items-start gap-2 text-[11.5px] leading-snug text-zinc-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
          Saving creates a <span className="font-semibold text-zinc-800">separate enquiry under your name</span>. The existing lead and its owner stay untouched.
        </p>
        {significant && (
          <label className="block text-[12px] font-semibold text-amber-900">
            Reason for a separate enquiry <span className="text-rose-600">*</span>
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={2}
              placeholder="e.g. Different unit of the same model, or customer wants a second opinion"
              className="mt-1.5 bg-white"
            />
          </label>
        )}
      </div>
      {handoffFor && (
        <HandoffRequestDialog open lead={handoffFor} onClose={() => setHandoffFor(null)} onDone={() => setHandoffFor(null)} />
      )}
    </div>
  );
}
