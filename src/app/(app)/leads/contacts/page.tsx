"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, Plus, Phone, Mail, MessageSquare, Building2,
  Filter, MapPin, LayoutGrid, List as ListIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { AddContactModal } from "@/components/leads/add-contact-modal";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
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
}

const TAG_CONFIG = {
  customer: { label: "Customer", color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  prospect: { label: "Prospect", color: "bg-violet-50 text-violet-700 ring-violet-200" },
  partner:  { label: "Partner",  color: "bg-sky-50 text-sky-700 ring-sky-200" },
};

/* Demo fallback — shown ONLY when there are no real saved contacts yet
   (fresh account / un-migrated DB), mirroring the Companies page pattern. */
const DEMO_CONTACTS: ContactRow[] = [
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
  const { contacts, leads } = useLeads();
  const { companies } = useStore();
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [view, setView] = useState<ViewMode>("list");

  /* Map the REAL saved contacts (from lead capture + Add Contact) into the
     page's display shape. Every value is derived from actual data — deals is
     the real count of leads linked to this contact, last activity comes from
     the contact record, and the tag reflects Customer-Master promotion. */
  const rows = useMemo<ContactRow[]>(() => {
    if (contacts.length === 0) return DEMO_CONTACTS;

    // deals per contact = number of leads that reference it (contactId).
    const dealsByContact = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.contactId) continue;
      dealsByContact.set(lead.contactId, (dealsByContact.get(lead.contactId) ?? 0) + 1);
    }
    const companyName = (id?: string) =>
      id ? companies.find((c) => c.id === id)?.name ?? "" : "";

    return contacts.map((c) => ({
      id: c.id,
      name: c.fullName || `${c.firstName} ${c.lastName ?? ""}`.trim(),
      email: c.email ?? "",
      phone: c.mobile || c.phone || "",
      company: companyName(c.companyId),
      role: c.designation || c.role || "",
      location: c.city || c.address || "",
      lastContact: relativeTime(c.lastContactAt || c.updatedAt),
      deals: dealsByContact.get(c.id) ?? 0,
      // customerId set = promoted to Customer Master; otherwise a prospect.
      tag: c.customerId ? "customer" : "prospect",
    }));
  }, [contacts, leads, companies]);

  const filtered = useMemo(
    () => rows.filter((c) =>
      !query || `${c.name} ${c.email} ${c.company} ${c.location}`.toLowerCase().includes(query.toLowerCase())
    ),
    [query, rows]
  );

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
            <Can permission="manage_customers">
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowAddModal(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Contact
              </Button>
            </Can>
          </div>
        }
      />

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-80">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search contacts..."
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle className="flex sm:hidden" />
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full">
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
        </div>
      </div>

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
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-center">Deals</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id} className="group border-t border-border transition hover:bg-muted/30">
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
                      {contact.company || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {contact.email || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600">
                      {contact.phone || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {contact.location || <span className="text-muted-foreground">—</span>}
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
    </div>
  );
}
