"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Quick Actions (View Lead rail).

   The colorful, permission-gated shortcut hub for a single Lead. It replaces
   the old three-row monochrome Quick Actions (Call / WhatsApp / Edit) with the
   full set of real Lead shortcuts a Sales Agent needs on the detail page — each
   wired to the EXISTING canonical flow (never a fork, never fake data):

     • Call           → tel: the lead's number
     • WhatsApp       → wa.me the lead's number
     • Email          → mailto the lead's email
     • Edit Lead      → the canonical Lead capture flow (?action=edit)
     • Assign Agent   → reuses <AssignMenu> (Sales-Agent-only, store-scoped,
                        writes assignment history) — CAP.lead.assign/reassign
     • Route Lead     → <RouteLeadDialog> (Walk-In / Pickup / On-Site) via the
                        existing Field module — CAP.lead.convert fallback
     • Push to Deal   → <DealRequestModal> (discount approval) — CAP.deal.create
     • Follow-up      → scroll to the Follow-ups section (its own schedule UI)
     • Send Quotation → <SendQuotationFlow> — CAP.quotation.view
     • View Customer  → the linked Customer Master record — CAP.customer.view

   Every tile is a semantic-colour chip (icon tint + hover lift) so the hub reads
   as a vivid action board, not a stack of grey rows. Nothing here mutates the
   Lead directly — each tile defers to the canonical, audited flow it opens.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import Link from "next/link";
import {
  Phone, MessageSquare, Mail, Pencil, UserCog, Route as RouteIcon,
  BadgePercent, CalendarClock, FileText, User, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { AssignMenu } from "@/components/leads/lead-assign";
import { RouteLeadDialog } from "@/components/leads/route-lead-dialog";
import { DealRequestModal } from "@/components/deals/deal-request-modal";
import { SendQuotationFlow } from "@/components/quotations/send-quotation-flow";
import { useDeals } from "@/lib/lead-deals-context";
import { currentDealForLead } from "@/lib/lead-deals";
import type { Lead } from "@/lib/leads-data";

type Tone = "blue" | "green" | "sky" | "indigo" | "violet" | "amber" | "emerald" | "zinc";

const TONE: Record<Tone, { chip: string; hover: string; ring: string }> = {
  blue:    { chip: "bg-[#EEF1FD] text-[#4361EE]", hover: "hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/70", ring: "group-hover:ring-[#4361EE]/20" },
  green:   { chip: "bg-green-50 text-green-600",   hover: "hover:border-green-300 hover:bg-green-50/70",     ring: "group-hover:ring-green-200" },
  sky:     { chip: "bg-sky-50 text-sky-600",       hover: "hover:border-sky-300 hover:bg-sky-50/70",         ring: "group-hover:ring-sky-200" },
  indigo:  { chip: "bg-indigo-50 text-indigo-600", hover: "hover:border-indigo-300 hover:bg-indigo-50/70",   ring: "group-hover:ring-indigo-200" },
  violet:  { chip: "bg-violet-50 text-violet-600", hover: "hover:border-violet-300 hover:bg-violet-50/70",   ring: "group-hover:ring-violet-200" },
  amber:   { chip: "bg-amber-50 text-amber-600",   hover: "hover:border-amber-300 hover:bg-amber-50/70",     ring: "group-hover:ring-amber-200" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", hover: "hover:border-emerald-300 hover:bg-emerald-50/70", ring: "group-hover:ring-emerald-200" },
  zinc:    { chip: "bg-zinc-100 text-zinc-500",    hover: "hover:border-zinc-300 hover:bg-muted/60",          ring: "group-hover:ring-zinc-200" },
};

/* A single square action tile — icon chip + label, subtle hover lift + icon
   nudge. Rendered as a button, an <a>, or a next/link depending on props. */
function Tile({
  icon: Icon, label, tone, onClick, href, external, nudge = "x",
}: {
  icon: LucideIcon;
  label: string;
  tone: Tone;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  nudge?: "x" | "y";
}) {
  const t = TONE[tone];
  const inner = (
    <>
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl ring-1 ring-transparent transition", t.chip, t.ring)}>
        <Icon className={cn("h-4 w-4 transition-transform duration-200", nudge === "x" ? "group-hover:translate-x-0.5" : "group-hover:-translate-y-0.5")} />
      </span>
      <span className="text-[12.5px] font-semibold leading-tight text-zinc-700 group-hover:text-foreground">{label}</span>
    </>
  );
  const cls = cn(
    "group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left transition",
    "hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(20,30,80,0.28)] active:translate-y-0",
    t.hover,
  );
  if (href) {
    return external
      ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
      : <Link href={href} className={cls}>{inner}</Link>;
  }
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

export function LeadQuickActions({ lead, readOnly = false }: { lead: Lead; readOnly?: boolean }) {
  const { can } = usePermissions();
  const { deals } = useDeals();

  const [routeOpen, setRouteOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const canEdit = allow(can, CAP.lead.edit) && !readOnly;
  const canRoute = allow(can, CAP.lead.convert) && !readOnly;
  const canDeal = allow(can, CAP.deal.create) && !readOnly;
  const canQuote = allow(can, CAP.quotation.view) && !readOnly;
  const canViewCustomer = allow(can, CAP.customer.view);
  const canAssign = (allow(can, CAP.lead.assign) || allow(can, CAP.lead.reassign)) && !readOnly;

  const phoneDigits = (lead.number || "").replace(/\D/g, "");
  const existingDeal = currentDealForLead(deals, lead.id) ?? null;

  // Scroll to the Follow-ups rail section (it owns the real scheduling UI).
  const goToFollowUps = () => {
    document.getElementById("followups")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#4361EE] to-[#3A4FD8] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.6)]">
          <Zap className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h3>
      </div>

      {/* Assign Agent — a real inline control (Sales-Agent picker). Full width so
          the owner name + dropdown read clearly. */}
      {canAssign && (
        <div className="mb-3 rounded-xl border border-[#4361EE]/20 bg-[#EEF1FD]/50 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
            <UserCog className="h-3 w-3" /> Assign / Reassign Agent
          </p>
          <AssignMenu lead={lead} />
        </div>
      )}

      {/* The colorful action grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {phoneDigits && <Tile icon={Phone} label={`Call ${lead.number}`} tone="green" href={`tel:${lead.number}`} />}
        {phoneDigits && <Tile icon={MessageSquare} label="WhatsApp" tone="emerald" href={`https://wa.me/${phoneDigits}`} external />}
        {lead.email && <Tile icon={Mail} label="Email" tone="sky" href={`mailto:${lead.email}`} />}
        {canEdit && <Tile icon={Pencil} label="Edit Lead" tone="blue" href={`/leads/list?lead=${lead.id}&action=edit`} />}
        {canRoute && <Tile icon={RouteIcon} label="Route Lead" tone="violet" onClick={() => setRouteOpen(true)} />}
        {canDeal && <Tile icon={BadgePercent} label={existingDeal ? "View / Revise Deal" : "Push to Deal"} tone="amber" onClick={() => setDealOpen(true)} />}
        <Tile icon={CalendarClock} label="Schedule Follow-up" tone="amber" onClick={goToFollowUps} nudge="y" />
        {canQuote && <Tile icon={FileText} label="Send Quotation" tone="indigo" onClick={() => setQuoteOpen(true)} />}
        {lead.customerId && canViewCustomer && <Tile icon={User} label="View Customer" tone="green" href={`/customers/${lead.customerId}`} />}
      </div>

      {/* Flows opened by the shortcuts — each the canonical, audited surface. */}
      {canRoute && <RouteLeadDialog lead={routeOpen ? lead : null} open={routeOpen} onClose={() => setRouteOpen(false)} />}
      {canDeal && (
        <DealRequestModal
          open={dealOpen}
          onClose={() => setDealOpen(false)}
          lead={dealOpen ? lead : null}
          deal={existingDeal}
          onDone={() => setDealOpen(false)}
        />
      )}
      {canQuote && <SendQuotationFlow lead={quoteOpen ? lead : null} open={quoteOpen} onClose={() => setQuoteOpen(false)} />}
    </section>
  );
}
