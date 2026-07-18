"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, Plus, Building2, MapPin, Users, TrendingUp, ExternalLink, MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  industry: string;
  location: string;
  contacts: number;
  deals: number;
  revenue: number;
  status: "active" | "prospect" | "inactive";
}

const STATUS_STYLE = {
  active:   "bg-emerald-50 text-emerald-700 ring-emerald-200",
  prospect: "bg-violet-50 text-violet-700 ring-violet-200",
  inactive: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const COMPANIES: Company[] = [
  { id: "CO-001", name: "TechNova Pvt Ltd",    industry: "Technology",   location: "Bengaluru", contacts: 4, deals: 3, revenue: 325000, status: "active" },
  { id: "CO-002", name: "DesignHub Co",        industry: "Design",       location: "Mumbai",    contacts: 2, deals: 1, revenue: 56000,  status: "prospect" },
  { id: "CO-003", name: "GreenLeaf Org",       industry: "Education",    location: "Delhi",     contacts: 3, deals: 2, revenue: 145000, status: "active" },
  { id: "CO-004", name: "CloudSync Solutions",  industry: "SaaS",         location: "Chennai",   contacts: 2, deals: 1, revenue: 80000,  status: "prospect" },
  { id: "CO-005", name: "NexaCore Labs",        industry: "R&D",          location: "Ahmedabad", contacts: 5, deals: 4, revenue: 520000, status: "active" },
  { id: "CO-006", name: "PixelCraft Studio",    industry: "Design",       location: "Bengaluru", contacts: 3, deals: 2, revenue: 190000, status: "active" },
  { id: "CO-007", name: "SwiftServe Inc",       industry: "Logistics",    location: "Hyderabad", contacts: 2, deals: 1, revenue: 65000,  status: "prospect" },
  { id: "CO-008", name: "BuildRight Infra",     industry: "Construction", location: "Pune",      contacts: 1, deals: 0, revenue: 0,      status: "inactive" },
];

export default function CompaniesPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => COMPANIES.filter((c) =>
      !query || `${c.name} ${c.industry} ${c.location}`.toLowerCase().includes(query.toLowerCase())
    ),
    [query]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Companies"
        subtitle="Organisations in your pipeline with linked contacts and deals."
        actions={
          <Can permission="manage_customers">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Company
            </Button>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-80">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search companies..."
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((company, i) => (
          <motion.div
            key={company.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            className="group rounded-2xl border border-border bg-card p-5 shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-900">{company.name}</p>
                  <p className="text-[11px] text-muted-foreground">{company.industry}</p>
                </div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize", STATUS_STYLE[company.status])}>
                {company.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-zinc-50 p-2.5 text-center">
                <p className="text-lg font-bold tnum">{company.contacts}</p>
                <p className="text-[10px] text-muted-foreground">Contacts</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2.5 text-center">
                <p className="text-lg font-bold tnum">{company.deals}</p>
                <p className="text-[10px] text-muted-foreground">Deals</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-2.5 text-center">
                <p className="text-lg font-bold tnum">{company.revenue > 0 ? `${Math.round(company.revenue / 1000)}K` : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Revenue</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" /> {company.location}
              </div>
              <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 opacity-0 transition hover:bg-muted hover:text-zinc-700 group-hover:opacity-100">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
