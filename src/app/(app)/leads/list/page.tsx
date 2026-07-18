"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search, Filter, Plus, Phone, Mail, MessageSquare,
  ChevronDown, MoreHorizontal, ArrowUpDown, Download,
  Star, Clock, User, LayoutGrid, List, Map,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

/* ── Mock Data ── */
type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "follow_up" | "won" | "lost";
type LeadPriority = "hot" | "warm" | "cold";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  value: number;
  owner: string;
  lastActivity: string;
  followUp: string;
  score: number;
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:        { label: "New",       color: "bg-sky-50 text-sky-700 ring-sky-200" },
  contacted:  { label: "Contacted", color: "bg-violet-50 text-violet-700 ring-violet-200" },
  qualified:  { label: "Qualified", color: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  proposal:   { label: "Proposal",  color: "bg-amber-50 text-amber-700 ring-amber-200" },
  follow_up:  { label: "Follow Up", color: "bg-orange-50 text-orange-700 ring-orange-200" },
  won:        { label: "Won",       color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  lost:       { label: "Lost",      color: "bg-zinc-100 text-zinc-500 ring-zinc-200" },
};

const PRIORITY_CONFIG: Record<LeadPriority, { label: string; color: string }> = {
  hot:  { label: "Hot",  color: "text-rose-600" },
  warm: { label: "Warm", color: "text-amber-600" },
  cold: { label: "Cold", color: "text-sky-600" },
};

const LEADS: Lead[] = [
  { id: "LD-001", name: "Aarav Mehta",    email: "aarav@gmail.com",    phone: "+91 98765 43210", company: "TechNova Pvt Ltd",   source: "Google",    status: "new",       priority: "hot",  value: 22500, owner: "Kalai S.",    lastActivity: "2h ago",  followUp: "Today",    score: 92 },
  { id: "LD-002", name: "Bina Soni",      email: "bina@outlook.com",   phone: "+91 87654 32109", company: "DesignHub Co",       source: "Meta",      status: "contacted", priority: "warm", value: 18000, owner: "Manoj S.",    lastActivity: "5h ago",  followUp: "Tomorrow", score: 78 },
  { id: "LD-003", name: "Chetan Bhatt",   email: "chetan@yahoo.com",   phone: "+91 76543 21098", company: "",                    source: "Walk-In",   status: "qualified", priority: "hot",  value: 45000, owner: "Kalai S.",    lastActivity: "1d ago",  followUp: "Today",    score: 85 },
  { id: "LD-004", name: "Diya Sen",       email: "diya@company.in",    phone: "+91 65432 10987", company: "GreenLeaf Org",       source: "Reference", status: "proposal",  priority: "warm", value: 12000, owner: "Ritesh Kumar",lastActivity: "3h ago",  followUp: "Jul 20",   score: 72 },
  { id: "LD-005", name: "Eshan Roy",      email: "eshan@work.com",     phone: "+91 54321 09876", company: "CloudSync Solutions", source: "YouTube",   status: "follow_up", priority: "cold", value: 8500,  owner: "Manoj S.",    lastActivity: "2d ago",  followUp: "Jul 22",   score: 55 },
  { id: "LD-006", name: "Falguni Patel",  email: "falguni@biz.in",     phone: "+91 43210 98765", company: "NexaCore Labs",       source: "Google",    status: "won",       priority: "hot",  value: 35000, owner: "Kalai S.",    lastActivity: "4h ago",  followUp: "—",        score: 95 },
  { id: "LD-007", name: "Gaurav Pillai",  email: "gaurav@studio.co",   phone: "+91 32109 87654", company: "",                    source: "Meta",      status: "new",       priority: "warm", value: 9800,  owner: "Ritesh Kumar",lastActivity: "30m ago", followUp: "Today",    score: 68 },
  { id: "LD-008", name: "Heena Kapoor",   email: "heena@mail.com",     phone: "+91 21098 76543", company: "PixelCraft Studio",   source: "Reference", status: "contacted", priority: "hot",  value: 28000, owner: "Manoj S.",    lastActivity: "1h ago",  followUp: "Tomorrow", score: 88 },
  { id: "LD-009", name: "Ishaan Verma",   email: "ishaan@firm.in",     phone: "+91 10987 65432", company: "BuildRight Infra",    source: "Walk-In",   status: "lost",      priority: "cold", value: 15000, owner: "Kalai S.",    lastActivity: "5d ago",  followUp: "—",        score: 32 },
  { id: "LD-010", name: "Jaya Iyer",      email: "jaya@services.com",  phone: "+91 99887 76655", company: "SwiftServe Inc",      source: "Google",    status: "qualified", priority: "warm", value: 19500, owner: "Ritesh Kumar",lastActivity: "6h ago",  followUp: "Jul 21",   score: 74 },
];

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Qualified", value: "qualified" },
  { label: "Proposal", value: "proposal" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
];

export default function LeadsListPage() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);

  const filtered = useMemo(() =>
    LEADS.filter((l) => {
      const matchStatus = filter === "all" || l.status === filter;
      const matchQuery = !query || `${l.name} ${l.email} ${l.company} ${l.id}`.toLowerCase().includes(query.toLowerCase());
      return matchStatus && matchQuery;
    }),
    [filter, query]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        subtitle="All leads in your pipeline — search, filter, and take action."
        actions={
          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/kanban" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><Map className="h-3.5 w-3.5" /></Link>
            </div>
            <Can permission="manage_sales">
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowAddForm(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* Filters row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          value={filter}
          onChange={setFilter}
          options={STATUS_FILTERS.map((f) => ({ label: f.label, value: f.value }))}
          size="sm"
        />
        <div className="flex items-center gap-2">
          <div className="w-full lg:w-72">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search by name, email, company..."
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full">
            <Filter className="h-3.5 w-3.5" /> Filters
          </Button>
          <Can permission="export_reports">
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </Can>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-[#B3BFF6] bg-[#EEF1FD] px-4 py-2.5"
        >
          <span className="text-[12px] font-semibold text-[#4361EE]">{selected.size} selected</span>
          <div className="h-4 w-px bg-[#B3BFF6]" />
          <button className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-white transition">Assign</button>
          <button className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-white transition">Move Stage</button>
          <button className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-white transition">Export</button>
          <button className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition">Delete</button>
          <div className="flex-1" />
          <button onClick={() => setSelected(new Set())} className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700">Clear</button>
        </motion.div>
      )}

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-10">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]" />
              </th>
              <th className="px-2 py-3">Lead</th>
              <th className="py-3">Company</th>
              <th className="py-3">Status</th>
              <th className="py-3">Priority</th>
              <th className="py-3">Value</th>
              <th className="py-3">Owner</th>
              <th className="py-3">Follow-up</th>
              <th className="py-3">Score</th>
              <th className="py-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead, i) => (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * i }}
                className="group cursor-pointer border-t border-border transition hover:bg-muted/30"
              >
                <td className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]" />
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={lead.name} size={32} />
                    <div>
                      <p className="font-semibold text-zinc-900">{lead.name}</p>
                      <p className="text-[11px] text-muted-foreground">{lead.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  <span className="text-zinc-700">{lead.company || "—"}</span>
                </td>
                <td className="py-3">
                  <InlineStatusSelect leadId={lead.id} current={lead.status} />
                </td>
                <td className="py-3">
                  <span className={cn("flex items-center gap-1 text-[11px] font-semibold", PRIORITY_CONFIG[lead.priority].color)}>
                    <Star className="h-3 w-3" fill="currentColor" />
                    {PRIORITY_CONFIG[lead.priority].label}
                  </span>
                </td>
                <td className="py-3">
                  <span className="font-semibold tnum">{formatINR(lead.value)}</span>
                </td>
                <td className="py-3">
                  <span className="text-zinc-600">{lead.owner}</span>
                </td>
                <td className="py-3">
                  <span className={cn("flex items-center gap-1 text-[11px]", lead.followUp === "Today" ? "font-semibold text-rose-600" : "text-zinc-500")}>
                    <Clock className="h-3 w-3" />
                    {lead.followUp}
                  </span>
                </td>
                <td className="py-3">
                  <span className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ring-1 ring-inset",
                    lead.score >= 80 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                    lead.score >= 60 ? "bg-amber-50 text-amber-700 ring-amber-200" :
                    "bg-zinc-50 text-zinc-600 ring-zinc-200"
                  )}>
                    {lead.score}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 transition" title="Call">
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-sky-50 hover:text-sky-600 transition" title="Email">
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-green-50 hover:text-green-600 transition" title="WhatsApp">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700 transition" title="More">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <User className="h-6 w-6" />
            </div>
            <p className="font-semibold">No leads match your filters</p>
            <p className="text-sm text-muted-foreground">Try a different status or clear your search.</p>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.map((lead, i) => (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            className="rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.name} size={36} />
                <div>
                  <p className="font-semibold">{lead.name}</p>
                  <p className="text-[11px] text-muted-foreground">{lead.company || lead.source}</p>
                </div>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", STATUS_CONFIG[lead.status].color)}>
                {STATUS_CONFIG[lead.status].label}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="font-semibold tnum">{formatINR(lead.value)}</span>
              <span className={cn("flex items-center gap-1", PRIORITY_CONFIG[lead.priority].color)}>
                <Star className="h-3 w-3" fill="currentColor" /> {PRIORITY_CONFIG[lead.priority].label}
              </span>
              <span className={cn("flex items-center gap-1", lead.followUp === "Today" ? "text-rose-600 font-semibold" : "text-zinc-500")}>
                <Clock className="h-3 w-3" /> {lead.followUp}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-[11px] text-muted-foreground">{lead.owner} · {lead.lastActivity}</span>
              <div className="flex items-center gap-1">
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-emerald-600"><Phone className="h-3.5 w-3.5" /></button>
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-sky-600"><Mail className="h-3.5 w-3.5" /></button>
                <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-green-600"><MessageSquare className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <p className="text-[12px] text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {LEADS.length} leads
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" className="bg-[#4361EE] text-white border-[#4361EE]">1</Button>
          <Button variant="outline" size="sm">2</Button>
          <Button variant="outline" size="sm">Next</Button>
        </div>
      </div>

      {/* Add Lead Slide-over */}
      {showAddForm && <AddLeadForm onClose={() => setShowAddForm(false)} />}
    </div>
  );
}

/* ── Add Lead Slide-over Form ── */
function AddLeadForm({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-foreground/40" onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-bold">Add Lead</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
            <Plus className="h-4 w-4 rotate-45" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">General Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">First Name</label><input className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" placeholder="Aarav" /></div>
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Last Name <span className="text-rose-500">*</span></label><input className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" placeholder="Mehta" /></div>
            </div>
            <div className="mt-3 space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Company</label><input className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" placeholder="TechNova Pvt Ltd" /></div>
            <div className="mt-3 space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Owner <span className="text-rose-500">*</span></label><input className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" defaultValue="Kalai S." /></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Source</label><select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition"><option>Google Ads</option><option>Meta Ads</option><option>Walk-In</option><option>Reference</option><option>YouTube</option><option>Website</option></select></div>
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Pipeline Stage</label><select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition"><option>New</option><option>Contacted</option><option>Qualified</option><option>Proposal</option></select></div>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Communication</p>
            <div className="space-y-3">
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Email</label><input type="email" className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" placeholder="aarav@company.in" /></div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-zinc-700">Phone</label>
                <div className="flex gap-2">
                  <span className="flex h-9 shrink-0 items-center rounded-xl border border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">+91</span>
                  <input type="tel" className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition" placeholder="98765 43210" />
                </div>
              </div>
              <button className="text-[12px] font-medium text-[#4361EE] hover:underline">+ Add another phone</button>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deal</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Estimated Value</label><div className="flex"><span className="flex h-9 items-center rounded-l-xl border border-r-0 border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">₹</span><input type="number" className="h-9 w-full rounded-r-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition" placeholder="0" /></div></div>
              <div className="space-y-1.5"><label className="text-[12px] font-medium text-zinc-700">Priority</label><select className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-[#4361EE] transition"><option>Hot</option><option>Warm</option><option>Cold</option></select></div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Save Lead</Button>
        </div>
      </motion.aside>
    </>
  );
}

/* ── Inline Status Dropdown ── */
function InlineStatusSelect({ leadId, current }: { leadId: string; current: LeadStatus }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition hover:ring-2", STATUS_CONFIG[status].color)}
      >
        {STATUS_CONFIG[status].label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-36 rounded-xl border border-border bg-card py-1 shadow-xl">
            {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); setStatus(s); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition hover:bg-muted",
                  s === status && "bg-muted font-semibold"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", STATUS_CONFIG[s].color.split(" ")[0].replace("bg-", "bg-"))} />
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
