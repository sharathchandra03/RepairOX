"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Contextual actions on Lead-search results (Phase 7).

   Every action defers to an EXISTING, permission-gated flow — nothing here
   writes lead data directly:
     • View Customer / View Lead   → navigation (reference mode if not owner)
     • Call / WhatsApp / Email     → tel: / wa.me / mailto: (opening a link is
                                     NOT recorded as a call attempt or contact)
     • Copy                        → clipboard only
     • New Lead for this customer  → the normal Add Lead flow, identity only
     • Request Handoff             → lead_request_handoff() — never transfers
   ────────────────────────────────────────────────────────────────────────── */
import { useState, type ReactNode, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Mail, Copy, UserPlus, ArrowRightLeft, Eye, Pencil } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useSession } from "@/lib/use-session";
import { normalizeCustomerPhone } from "@/lib/customer-data";
import { newLeadForCustomerHref, customerHref, leadHref, type CustomerHit, type LeadHit } from "@/lib/lead-search";
import type { Lead } from "@/lib/leads-data";
import { HandoffRequestDialog } from "@/components/leads/search/reference-mode";
import { cn } from "@/lib/utils";

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

function waLink(phone: string): string {
  const d = normalizeCustomerPhone(phone);
  return d.length === 10 ? `https://wa.me/91${d}` : `https://wa.me/${phone.replace(/\D/g, "")}`;
}

function Act({
  icon, label, onClick, href, tone = "neutral",
}: { icon: ReactNode; label: string; onClick?: (e: MouseEvent) => void; href?: string; tone?: "neutral" | "primary" | "amber" }) {
  const cls = cn(
    "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition",
    tone === "primary" && "border-[#4361EE]/30 bg-[#EEF1FD] text-[#4361EE] hover:bg-[#E2E8FC]",
    tone === "amber" && "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
    tone === "neutral" && "border-border bg-card text-zinc-600 hover:border-[#4361EE]/30 hover:text-[#4361EE]",
  );
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cls} title={label}>
        {icon}<span className="hidden sm:inline">{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick?.(e); }} className={cls} title={label}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function CustomerActions({ item }: { item: CustomerHit }) {
  const router = useRouter();
  const { can } = usePermissions();
  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Act tone="primary" icon={<Eye className="h-3 w-3" />} label="View Customer" onClick={() => router.push(customerHref(item.id))} />
      {allow(can, CAP.lead.create) && (
        <Act icon={<UserPlus className="h-3 w-3" />} label="New Lead" onClick={() => router.push(newLeadForCustomerHref(item.id))} />
      )}
      {item.mobile && <Act icon={<Phone className="h-3 w-3" />} label="Call" href={`tel:${item.mobile}`} />}
      {item.mobile && <Act icon={<MessageCircle className="h-3 w-3" />} label="WhatsApp" href={waLink(item.mobile)} />}
      {item.email && <Act icon={<Mail className="h-3 w-3" />} label="Email" href={`mailto:${item.email}`} />}
      {item.mobile && <Act icon={<Copy className="h-3 w-3" />} label="Copy mobile" onClick={() => copyText(item.mobile, "Mobile number")} />}
    </div>
  );
}

export function LeadActions({ item }: { item: LeadHit }) {
  const router = useRouter();
  const { can } = usePermissions();
  const { id: me } = useSession();
  const [handoff, setHandoff] = useState(false);
  const mine = item.assigned_user_id === me;
  const canEditLead = item.ordinary && allow(can, CAP.lead.edit);
  const canHandoff = !!item.assigned_user_id && !mine && !item.closed && allow(can, CAP.lead.referenceRead);

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Act
        tone="primary"
        icon={item.ordinary ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        label={canEditLead ? "View Lead" : item.ordinary ? "View Lead" : "View (read-only)"}
        onClick={() => router.push(leadHref(item.id))}
      />
      {item.customer_id && allow(can, CAP.lead.customerHistory) && (
        <Act icon={<Eye className="h-3 w-3" />} label="Customer" onClick={() => router.push(customerHref(item.customer_id!))} />
      )}
      {item.number && <Act icon={<Phone className="h-3 w-3" />} label="Call" href={`tel:${item.number}`} />}
      {item.number && <Act icon={<MessageCircle className="h-3 w-3" />} label="WhatsApp" href={waLink(item.number)} />}
      {item.email && <Act icon={<Mail className="h-3 w-3" />} label="Email" href={`mailto:${item.email}`} />}
      <Act icon={<Copy className="h-3 w-3" />} label="Copy ID" onClick={() => copyText(item.lead_no, "Lead ID")} />
      {item.number && <Act icon={<Copy className="h-3 w-3" />} label="Copy mobile" onClick={() => copyText(item.number, "Mobile number")} />}
      {canHandoff && <Act tone="amber" icon={<ArrowRightLeft className="h-3 w-3" />} label="Request Handoff" onClick={() => setHandoff(true)} />}
      {handoff && (
        <HandoffRequestDialog
          open
          lead={{ id: item.id, leadNo: item.lead_no, assignedToName: item.assigned_to_name || "", assignedTo: item.assigned_user_id || "" } as Lead}
          onClose={() => setHandoff(false)}
          onDone={() => setHandoff(false)}
        />
      )}
    </div>
  );
}
