"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Lead Quick View — the SAME basic-info card for every lead found in search,
   whoever owns it. The OWNER is the headline. Actions depend on the viewer:

     • my lead / I can edit   → View Lead · Edit Lead
     • someone else's lead     → View Full Details (read-only) · Request Handoff
                                 · Customer history · Call / WhatsApp / Copy

   Data comes from lead_reference_get() (server-enforced visibility). Opening a
   quick view is NOT a sales activity — nothing is written except the
   reference-access audit row when the lead is not the viewer's own.
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, Phone, Mail, MessageCircle, Copy, Pencil, Eye, ArrowRightLeft, UserRound, Loader2,
  AlertTriangle, UserPlus, Smartphone, CalendarClock, MapPin, Hourglass, ShieldCheck, Lock,
} from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toaster";
import { statusTone, leadNatureTone } from "@/components/leads/lead-pills";
import { HandoffRequestDialog } from "@/components/leads/search/reference-mode";
import { ago, fmtDate, fmtDateTime } from "@/components/leads/search/lead-search-parts";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { allow, CAP } from "@/lib/capabilities";
import { rowToLead } from "@/lib/leads-context";
import { normalizeCustomerPhone } from "@/lib/customer-data";
import { rpcLeadReference, customerHref, leadHref, newLeadForCustomerHref, type ReferenceBundle } from "@/lib/lead-search";
import type { Lead } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

type Ev = { at: string; title: string; detail: string; actor: string };

function buildEvents(b: ReferenceBundle): Ev[] {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const ev: Ev[] = [
    ...b.activity.map((a) => ({
      at: s(a.occurred_at || a.created_at), title: s(a.activity_type || "activity").replace(/_/g, " "),
      detail: [a.contact_status, a.result, a.note].filter(Boolean).map(s).join(" · "), actor: s(a.actor_name),
    })),
    ...b.followups.map((f) => ({
      at: s(f.completed_at || f.created_at), title: `follow-up ${s(f.status)}`,
      detail: [f.scheduled_at ? fmtDateTime(s(f.scheduled_at)) : "", f.result, f.comments].filter(Boolean).map(s).join(" · "), actor: s(f.followup_user_name),
    })),
    ...b.status_history.map((x) => ({
      at: s(x.changed_at || x.created_at), title: "status changed",
      detail: [x.from_status, x.to_status].filter(Boolean).map(s).join(" → "), actor: s(x.actor_name),
    })),
    ...b.assignment.map((a) => ({
      at: s(a.created_at), title: a.from_user_id ? "reassigned" : "assigned",
      detail: [a.from_user_name, a.to_user_name].filter(Boolean).map(s).join(" → "), actor: s(a.assigned_by_name),
    })),
    ...b.conversion.map((c) => ({
      at: s(c.occurred_at || c.created_at), title: s(c.event_type).replace(/_/g, " "),
      detail: [c.target_type, c.target_id].filter(Boolean).map(s).join(" "), actor: s(c.actor_name),
    })),
  ];
  return ev.filter((e) => e.at).sort((a, b2) => b2.at.localeCompare(a.at));
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-[13px] font-medium text-foreground">{children || <span className="text-zinc-400">—</span>}</div>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Briefcase; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function LeadQuickView({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { can } = usePermissions();
  const { id: me } = useSession();
  const [bundle, setBundle] = useState<ReferenceBundle | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState(false);

  const load = useCallback(async (id: string) => {
    setStatus("loading");
    try {
      const b = await rpcLeadReference(id);
      if (!b) { setStatus("missing"); return; }
      setBundle(b);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!leadId) { setBundle(null); setStatus("idle"); return; }
    void load(leadId);
  }, [leadId, load]);

  const lead: Lead | null = useMemo(() => (bundle ? rowToLead(bundle.lead) : null), [bundle]);
  const events = useMemo(() => (bundle ? buildEvents(bundle).slice(0, 6) : []), [bundle]);

  const mine = !!lead && lead.assignedTo === me;
  const isRef = !!bundle?.reference;
  const canEdit = !!lead && !isRef && allow(can, CAP.lead.edit);
  const canHandoff = !!lead && !!lead.assignedTo && !mine && lead.status !== undefined && allow(can, CAP.lead.referenceRead);
  const pending = bundle?.pending_handoff?.status === "pending" ? bundle.pending_handoff : null;
  const owner = lead?.assignedToName || lead?.agent || "";

  const go = (href: string) => { onClose(); router.push(href); };
  const copy = async (t: string, label: string) => {
    try { await navigator.clipboard.writeText(t); toast.success(`${label} copied`); } catch { toast.error("Couldn't copy"); }
  };
  const wa = lead && lead.number
    ? (normalizeCustomerPhone(lead.number).length === 10 ? `https://wa.me/91${normalizeCustomerPhone(lead.number)}` : `https://wa.me/${lead.number.replace(/\D/g, "")}`)
    : "";

  return (
    <>
      <RoxCenteredForm
        open={!!leadId}
        onClose={onClose}
        title={lead ? `${lead.leadNo} · ${lead.name || "Unnamed lead"}` : "Lead"}
        subtitle={lead ? [lead.device, lead.issue].filter(Boolean).join(" · ") || "Quick view" : "Quick view"}
        icon={Briefcase}
        width="max-w-3xl"
        footer={
          lead && status === "ready" ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {lead.number && <a href={`tel:${lead.number}`}><Button size="sm" variant="ghost" className="gap-1.5 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 hover:text-emerald-800"><Phone className="h-3.5 w-3.5" />Call</Button></a>}
                {wa && <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" className="gap-1.5 bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 hover:bg-green-100 hover:text-green-800"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</Button></a>}
                {lead.email && <a href={`mailto:${lead.email}`}><Button size="sm" variant="ghost" className="gap-1.5 bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 hover:text-sky-800"><Mail className="h-3.5 w-3.5" />Email</Button></a>}
                <Button size="sm" variant="ghost" className="gap-1.5 bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100 hover:text-violet-800" onClick={() => copy(lead.leadNo, "Lead ID")}><Copy className="h-3.5 w-3.5" />ID</Button>
                {lead.number && <Button size="sm" variant="ghost" className="gap-1.5 bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 hover:text-indigo-800" onClick={() => copy(lead.number, "Mobile")}><Copy className="h-3.5 w-3.5" />Mobile</Button>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {lead.customerId && allow(can, CAP.lead.customerHistory) ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go(customerHref(lead.customerId))}><UserRound className="h-3.5 w-3.5" />Customer history</Button>
                ) : null}
                {allow(can, CAP.lead.create) && lead.customerId && (
                  <Button size="sm" variant="outline" className="gap-1.5 border-[#4361EE]/40 bg-[#EEF1FD] font-semibold text-[#4361EE] hover:bg-[#E2E8FC] hover:text-[#3450D8]" onClick={() => go(newLeadForCustomerHref(lead.customerId))}><UserPlus className="h-3.5 w-3.5" />New lead</Button>
                )}
                {canHandoff && !pending && (
                  <Button size="sm" variant="outline" className="gap-1.5 border-amber-400 text-amber-800" onClick={() => setHandoff(true)}><ArrowRightLeft className="h-3.5 w-3.5" />Request handoff</Button>
                )}
                {pending && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300"><Hourglass className="h-3 w-3" />Handoff requested</span>}
                {canEdit && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go(`/leads/list?lead=${lead.id}&action=edit`)}><Pencil className="h-3.5 w-3.5" />Edit Lead</Button>
                )}
                <Button size="sm" className="gap-1.5" onClick={() => go(leadHref(lead.id))}>
                  <Eye className="h-3.5 w-3.5" /> {isRef ? "View Full Details (read-only)" : "View Lead"}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading lead…</div>
        )}
        {status === "missing" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <AlertTriangle className="h-7 w-7 text-amber-500" />
            <p className="text-sm font-semibold">Lead not found or not accessible</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <AlertTriangle className="h-7 w-7 text-rose-500" />
            <p className="text-sm font-semibold">Couldn’t load this lead</p>
            <p className="text-[12.5px] text-muted-foreground">{error}</p>
          </div>
        )}

        {status === "ready" && lead && bundle && (
          <div className="space-y-4">
            {/* OWNER — the headline */}
            <div className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-4",
              mine ? "border-teal-300 bg-teal-50/70" : isRef ? "border-amber-300 bg-amber-50/70" : "border-[#4361EE]/30 bg-[#EEF1FD]/70",
            )}>
              <div className="flex items-center gap-3">
                <Avatar name={owner || "?"} size={44} />
                <div>
                  <p className={cn("text-[10.5px] font-bold uppercase tracking-wider", mine ? "text-teal-700" : isRef ? "text-amber-800" : "text-[#4361EE]")}>
                    {mine ? "Your lead" : "Lead owner"}
                  </p>
                  <p className="text-lg font-bold leading-tight text-foreground">{owner || "Unassigned"}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {lead.assignedAt ? `Assigned ${fmtDateTime(lead.assignedAt)}` : "Not yet assigned"}
                    {bundle.created_by_name ? ` · created by ${bundle.created_by_name}` : ""}
                  </p>
                </div>
              </div>
              {isRef ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
                  <Lock className="h-3.5 w-3.5" /> Read-only · owned by {owner || "another agent"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> {canEdit ? "You can edit this lead" : "View access"}
                </span>
              )}
            </div>

            {/* status strip */}
            <div className="flex flex-wrap items-center gap-2">
              {lead.status && <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
              {lead.contactStatus && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">{lead.contactStatus}</span>}
              {lead.leadNature && <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", leadNatureTone(lead.leadNature))}>{lead.leadNature}</span>}
              {lead.source && <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-zinc-600">{lead.source}</span>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Block icon={UserRound} title="Customer & Contact">
                <Field label="Name">{lead.name}</Field>
                <Field label="Mobile">{lead.number}{lead.alternateNumber ? ` · ${lead.alternateNumber}` : ""}</Field>
                <Field label="Email" wide>{lead.email}</Field>
                <Field label="Location" wide>{lead.location}</Field>
              </Block>
              <Block icon={Smartphone} title="Device & Issue">
                <Field label="Device" wide>{lead.device}</Field>
                <Field label="Issue" wide>{lead.issue}</Field>
                <Field label="Category">{lead.subCategory || lead.category}</Field>
                <Field label="Lead category">{lead.leadCategory}</Field>
              </Block>
              <Block icon={MapPin} title="Lead Details">
                <Field label="Region">{lead.region}</Field>
                <Field label="Store">{bundle.store_name}</Field>
                <Field label="Capture channel">{lead.captureChannel}</Field>
                <Field label="Created">{fmtDate(lead.createdAt)}</Field>
              </Block>
              <Block icon={CalendarClock} title="Follow-up & Activity">
                <Field label="Next follow-up">{lead.nextFollowUpAt ? fmtDateTime(lead.nextFollowUpAt) : lead.followUpDate}</Field>
                <Field label="Follow-up agent">{lead.followUpAgent}</Field>
                <Field label="Last activity">{bundle.last_activity ? ago(bundle.last_activity) : ""}</Field>
                <Field label="Last updated">{fmtDateTime(lead.updatedAt)}{bundle.updated_by_name ? ` · ${bundle.updated_by_name}` : ""}</Field>
              </Block>
            </div>

            {(lead.comments || lead.finalRemarks) && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">Comments & Remarks</h3>
                {lead.comments && <p className="whitespace-pre-wrap text-[12.5px] text-foreground">{lead.comments}</p>}
                {lead.finalRemarks && <p className="mt-2 whitespace-pre-wrap border-t border-border/70 pt-2 text-[12.5px] text-muted-foreground">{lead.finalRemarks}</p>}
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">Recent activity</h3>
              {events.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No calls, follow-ups or status changes recorded yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {events.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4361EE]/60" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[12.5px] font-semibold capitalize">{e.title}</p>
                          <span className="text-[10.5px] text-muted-foreground">{fmtDateTime(e.at)}</span>
                        </div>
                        {e.detail && <p className="text-[12px] text-muted-foreground">{e.detail}</p>}
                        {e.actor && <p className="text-[10.5px] text-zinc-400">by {e.actor}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </RoxCenteredForm>
      {handoff && lead && (
        <HandoffRequestDialog open lead={lead} onClose={() => setHandoff(false)} onDone={() => { setHandoff(false); if (leadId) void load(leadId); }} />
      )}
    </>
  );
}
