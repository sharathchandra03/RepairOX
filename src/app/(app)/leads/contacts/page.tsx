"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, Plus, Phone, Mail, MessageSquare, Building2,
  Filter, MapPin, LayoutGrid, List as ListIcon, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Can } from "@/components/common/can";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddContactModal } from "@/components/leads/add-contact-modal";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { CAP, allow } from "@/lib/capabilities";
import { SegmentedTabs } from "@/components/ui/tabs";
import { isFinalizedInvoice, isWonStatus, type Lead } from "@/lib/leads-data";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  location: string;
  lastContact: string;
  deals: number;
  tag: "customer" | "prospect" | "partner";
  /* ── Sales attribution (derived from the contact's leads) ── */
  /** Sales Agent user id that converted this contact ("" = none). */
  agentId: string;
  /** Cached display name of the converting sales agent. */
  agentName: string;
  /** True when a lead referencing this contact legitimately CONVERTED
   *  (linked ticket/invoice or a won lead) — spec §47. */
  converted: boolean;
  /** The source lead's number for the converted relationship. */
  sourceLeadNo: string;
  /** Converted date (source lead date). */
  convertedDate: string;
  /** Finalized revenue attributed via the source lead. */
  revenue: number;
}

/** A contact is CONVERTED when a lead that references it reached a real
 *  operational outcome — a linked ticket/invoice or a won lead. Creating a
 *  Customer Master record is NOT itself conversion (spec §47). */
function leadIsConverted(l: Lead): boolean {
  return !!l.linkedTicketId || !!l.linkedInvoiceId || isWonStatus(l.status, l.finalResult);
}

const TAG_CONFIG = {
  customer: { label: "Customer", color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  prospect: { label: "Prospect", color: "bg-violet-50 text-violet-700 ring-violet-200" },
  partner:  { label: "Partner",  color: "bg-sky-50 text-sky-700 ring-sky-200" },
};

/* Demo fallback — shown ONLY when there are no real saved contacts yet
   (fresh account / un-migrated DB), mirroring the Companies page pattern. */
const DEMO_CONTACTS: Omit<ContactRow, "agentId" | "agentName" | "converted" | "sourceLeadNo" | "convertedDate" | "revenue">[] = [
  { id: "C-001", name: "Aarav Mehta",    email: "aarav@technova.in",    phone: "+91 98765 43210", company: "TechNova Pvt Ltd",   role: "Founder",       location: "Bengaluru", lastContact: "2h ago", deals: 3, tag: "customer" },
  { id: "C-002", name: "Bina Soni",      email: "bina@designhub.co",    phone: "+91 87654 32109", company: "DesignHub Co",       role: "CTO",           location: "Mumbai",    lastContact: "1d ago", deals: 1, tag: "prospect" },
  { id: "C-003", name: "Chetan Bhatt",   email: "chetan@gmail.com",     phone: "+91 76543 21098", company: "",                    role: "Individual",    location: "Pune",      lastContact: "3d ago", deals: 0, tag: "prospect" },
  { id: "C-004", name: "Diya Sen",       email: "diya@greenleaf.org",   phone: "+91 65432 10987", company: "GreenLeaf Org",       role: "Operations Mgr",location: "Delhi",     lastContact: "5h ago", deals: 2, tag: "customer" },
  { id: "C-005", name: "Eshan Roy",      email: "eshan@cloudsync.io",   phone: "+91 54321 09876", company: "CloudSync Solutions", role: "IT Director",   location: "Chennai",   lastContact: "2d ago", deals: 1, tag: "partner" },
  { id: "C-006", name: "Falguni Patel",  email: "falguni@nexacore.in",  phone: "+91 43210 98765", company: "NexaCore Labs",       role: "CEO",           location: "Ahmedabad", lastContact: "4h ago", deals: 4, tag: "customer" },
];

/** Relativize an ISO timestamp to a compact "2h ago" style label. */
function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type ViewMode = "card" | "list";

export default function ContactsPage() {
  const { contacts, leads, deleteContact, viewAsReadOnly, viewAsAgentId, currentUserIsSalesAgent } = useLeads();
  const { companies, customers, invoices, tickets } = useStore();
  const { can } = usePermissions();
  const { id: currentUserId } = useSession();
  // Owner "view as agent" read-only lens disables deletes + add.
  const canDelete = allow(can, CAP.customer.delete) && !viewAsReadOnly;
  // Owner / manager sees ALL converted contacts (with an agent differentiation);
  // a Sales Agent defaults to their OWN converted contacts (spec §49/§67/§70).
  // A user who is themselves a Sales Agent only ever sees contacts THEY
  // converted, even with a coarse reporting/see-all key.
  const isSelfSalesAgent = currentUserIsSalesAgent();
  // Owner lens narrows "see all" down to one agent: while viewing an agent the
  // owner sees ONLY that agent's converted contacts (read-only) — never the
  // combined set. "All Agents" (no lens) keeps the combined see-all view.
  const canSeeAllContacts = (allow(can, CAP.lead.performanceAll) || allow(can, CAP.lead.viewTeam)) && !viewAsAgentId && !isSelfSalesAgent;
  // The agent id a contact's attribution must match when scoped to one person:
  // the viewed agent under the owner lens, else the signed-in user.
  const scopeAgentId = viewAsAgentId || currentUserId;
  // Scope strip: Converted (default) vs All. Agents effectively see only their
  // own regardless (enforced below); owners can switch Converted ↔ All.
  const [scope, setScope] = useState<"converted" | "all">("converted");
  // Only REAL saved contacts can be deleted — the demo fallback rows carry
  // fake ids (C-00x) with no backing record, so deletion is disabled for them.
  const hasRealContacts = contacts.length > 0;
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  /* Map the REAL saved contacts (from lead capture + Add Contact) into the
     page's display shape. Every value is derived from actual data — deals is
     the real count of leads linked to this contact, last activity comes from
     the contact record, and the tag reflects Customer-Master promotion. */
  const isDemo = contacts.length === 0;
  const rows = useMemo<ContactRow[]>(() => {
    if (contacts.length === 0) return DEMO_CONTACTS.map((d) => ({
      ...d, agentId: "", agentName: "", converted: d.tag === "customer", sourceLeadNo: "", convertedDate: "", revenue: 0,
    }));

    // deals per contact = number of leads that reference it (contactId).
    const dealsByContact = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.contactId) continue;
      dealsByContact.set(lead.contactId, (dealsByContact.get(lead.contactId) ?? 0) + 1);
    }
    const companyName = (id?: string) =>
      id ? companies.find((c) => c.id === id)?.name ?? "" : "";

    // Finalized revenue reachable from a lead (Lead→Ticket→Invoice).
    const revenueForLead = (l: Lead): number => {
      const finalized = invoices.filter((inv) => isFinalizedInvoice({
        id: inv.id, ticketId: inv.ticketId, total: Number(inv.total || 0), status: inv.status, documentType: inv.documentType,
      }));
      let total = 0;
      if (l.linkedTicketId) {
        const t = tickets.find((x) => x.id === l.linkedTicketId || x.ticketNo === l.linkedTicketId);
        if (t) for (const inv of finalized) if (inv.ticketId && (inv.ticketId === t.id || inv.ticketId === t.ticketNo)) total += Number(inv.total || 0);
      }
      if (l.linkedInvoiceId) { const d = finalized.find((inv) => inv.id === l.linkedInvoiceId); if (d) total += Number(d.total || 0); }
      return total;
    };

    return contacts.map((c) => {
      // Leads that belong to THIS contact — by contactId, or (once promoted) by
      // the shared customerId. Sales attribution comes from the lead's OWNER,
      // never the contact/customer record creator (spec §47/§76).
      const contactLeads = leads.filter((l) =>
        (l.contactId && l.contactId === c.id) || (c.customerId && l.customerId === c.customerId));
      const convertedLeads = contactLeads.filter(leadIsConverted);
      // Best converted lead = highest finalized revenue, else most recent.
      const best = [...convertedLeads].sort((a, b) =>
        (revenueForLead(b) - revenueForLead(a)) || (b.date || "").localeCompare(a.date || ""))[0];
      const converted = !!best;
      return {
        id: c.id,
        name: c.fullName || `${c.firstName} ${c.lastName ?? ""}`.trim(),
        email: c.email ?? "",
        phone: c.mobile || c.phone || "",
        company: companyName(c.companyId),
        role: c.designation || c.role || "",
        location: c.city || c.address || "",
        lastContact: relativeTime(c.lastContactAt || c.updatedAt),
        deals: dealsByContact.get(c.id) ?? 0,
        tag: c.customerId ? "customer" : "prospect",
        agentId: best?.assignedTo || "",
        agentName: best?.assignedToName || best?.agent || "",
        converted,
        sourceLeadNo: best?.leadNo || "",
        convertedDate: best?.date || "",
        revenue: best ? revenueForLead(best) : 0,
      } as ContactRow;
    });
  }, [contacts, leads, companies, customers, invoices, tickets]);

  const filtered = useMemo(
    () => rows.filter((c) => {
      if (!query || `${c.name} ${c.email} ${c.company} ${c.location}`.toLowerCase().includes(query.toLowerCase())) {
        // Scope: Converted-only unless the user explicitly switched to All.
        // (Demo rows ignore scoping so the empty-account preview still shows.)
        if (!isDemo && scope === "converted" && !c.converted) return false;
        // Scoped to one person (a Sales Agent, or the owner's viewed agent):
        // only contacts THAT person converted. "See all" (combined owner view)
        // skips this.
        if (!isDemo && !canSeeAllContacts && c.converted && c.agentId && scopeAgentId && c.agentId !== scopeAgentId) return false;
        return true;
      }
      return false;
    }),
    [query, rows, scope, isDemo, canSeeAllContacts, scopeAgentId]
  );

  const deletingContact = useMemo(
    () => rows.find((c) => c.id === confirmDeleteId) ?? null,
    [confirmDeleteId, rows]
  );

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await deleteContact(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  // ── Multi-select — only over REAL, currently-visible contacts ──
  const selectable = canDelete && hasRealContacts;
  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const selectedInView = useMemo(() => filteredIds.filter((id) => selected.has(id)), [filteredIds, selected]);
  const allSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
  const someSelected = selectedInView.length > 0;
  const toggleOne = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  const handleBulkDelete = async () => {
    await Promise.all(selectedInView.map((id) => deleteContact(id)));
    setSelected(new Set());
    setShowBulkDelete(false);
  };

  const ViewToggle = ({ className }: { className?: string }) => (
    <div className={cn("items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm", className)}>
      <button
        type="button"
        onClick={() => setView("list")}
        title="List View"
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition",
          view === "list" ? "bg-[#4361EE] text-white" : "text-zinc-400 hover:bg-muted hover:text-zinc-700",
        )}
      >
        <ListIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setView("card")}
        title="Card View"
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition",
          view === "card" ? "bg-[#4361EE] text-white" : "text-zinc-400 hover:bg-muted hover:text-zinc-700",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Contacts"
        subtitle="People and professionals connected to your leads and deals."
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle className="hidden sm:flex" />
            {!viewAsReadOnly && (
              <Can permission="manage_customers">
                <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowAddModal(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Contact
                </Button>
              </Can>
            )}
          </div>
        }
      />

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Converted (default) vs All scope — a Sales Agent sees only their
              own converted contacts; owners see all with agent differentiation. */}
          <SegmentedTabs
            size="sm"
            value={scope}
            onChange={(v) => setScope(v as "converted" | "all")}
            options={[
              { label: canSeeAllContacts ? "Converted" : "My Converted", value: "converted" },
              { label: "All", value: "all" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-80">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search contacts..."
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <ViewToggle className="flex sm:hidden" />
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full">
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
        </div>
      </div>

      {/* Bulk selection bar */}
      {selectable && someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-xs font-semibold text-[#4361EE]">
            {selectedInView.length} selected
          </span>
          <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-1 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* ---- CARD VIEW ---- */}
      {view === "card" && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((contact, i) => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i }}
              className="group rounded-2xl border border-border bg-card p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {selectable && (
                    <Checkbox checked={selected.has(contact.id)} onChange={() => toggleOne(contact.id)} aria-label={`Select ${contact.name}`} />
                  )}
                  <Avatar name={contact.name} size={40} />
                  <div>
                    <p className="font-semibold text-zinc-900">{contact.name}</p>
                    <p className="text-[11px] text-muted-foreground">{contact.role || "—"}</p>
                  </div>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", TAG_CONFIG[contact.tag].color)}>
                  {TAG_CONFIG[contact.tag].label}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-[12px]">
                {contact.company && (
                  <div className="flex items-center gap-2 text-zinc-600">
                    <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                    {contact.company}
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2 text-zinc-600">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    {contact.email}
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-zinc-600">
                    <Phone className="h-3.5 w-3.5 text-zinc-400" />
                    {contact.phone}
                  </div>
                )}
                {contact.location && (
                  <div className="flex items-center gap-2 text-zinc-600">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                    {contact.location}
                  </div>
                )}
              </div>

              {contact.agentName && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-violet-700">
                  <Avatar name={contact.agentName} size={18} />
                  <span className="font-medium">{contact.agentName}</span>
                  {contact.revenue > 0 && <span className="ml-auto font-semibold text-emerald-700">{formatINR(contact.revenue)}</span>}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{contact.deals} deals</span>
                  <span>·</span>
                  <span>{contact.lastContact}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 transition"><Phone className="h-3.5 w-3.5" /></button>
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-sky-50 hover:text-sky-600 transition"><Mail className="h-3.5 w-3.5" /></button>
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-green-50 hover:text-green-600 transition"><MessageSquare className="h-3.5 w-3.5" /></button>
                  {canDelete && hasRealContacts && (
                    <button
                      onClick={() => setConfirmDeleteId(contact.id)}
                      title="Delete contact"
                      className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ---- LIST / TABLE VIEW ---- */}
      {view === "list" && filtered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead className="bg-muted/60">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {selectable && (
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={toggleAll}
                        aria-label="Select all contacts"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Sales Agent</th>
                  <th className="px-4 py-3">Source Lead</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-center">Deals</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id} className={cn("group border-t border-border transition hover:bg-muted/30", selected.has(contact.id) && "bg-[#EEF1FD]/60")}>
                    {selectable && (
                      <td className="px-4 py-3">
                        <Checkbox checked={selected.has(contact.id)} onChange={() => toggleOne(contact.id)} aria-label={`Select ${contact.name}`} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name} size={34} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900">{contact.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{contact.role || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {contact.agentName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={contact.agentName} size={22} /> <span className="truncate">{contact.agentName}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {contact.sourceLeadNo
                        ? <span className="font-medium text-[#4361EE]">{contact.sourceLeadNo}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600">
                      {contact.phone || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {contact.revenue > 0 ? formatINR(contact.revenue) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-zinc-700">{contact.deals}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", TAG_CONFIG[contact.tag].color)}>
                        {TAG_CONFIG[contact.tag].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 transition"><Phone className="h-3.5 w-3.5" /></button>
                        <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-sky-50 hover:text-sky-600 transition"><Mail className="h-3.5 w-3.5" /></button>
                        <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-green-50 hover:text-green-600 transition"><MessageSquare className="h-3.5 w-3.5" /></button>
                        {canDelete && hasRealContacts && (
                          <button
                            onClick={() => setConfirmDeleteId(contact.id)}
                            title="Delete contact"
                            className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="font-semibold">No contacts found</p>
          <p className="text-sm text-muted-foreground">
            {query ? "Try a different search term." : "Contacts appear here as you capture leads or add them manually."}
          </p>
        </div>
      )}

      {/* Add Contact Modal */}
      <AddContactModal open={showAddModal} onClose={() => setShowAddModal(false)} />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete contact?"
        description={
          deletingContact
            ? `${deletingContact.name} will be removed from your contacts. This does not delete any linked lead or customer.`
            : "This contact will be removed."
        }
        confirmLabel="Delete Contact"
      />

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedInView.length} contact${selectedInView.length !== 1 ? "s" : ""}?`}
        description="The selected contacts will be removed. This does not delete any linked lead or customer records."
        confirmLabel={`Delete ${selectedInView.length} Contact${selectedInView.length !== 1 ? "s" : ""}`}
      />
    </div>
  );
}
