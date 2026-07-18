"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, Plus, Phone, Mail, MessageSquare, Building2,
  MoreHorizontal, Filter, MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

interface Contact {
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

const CONTACTS: Contact[] = [
  { id: "C-001", name: "Aarav Mehta",    email: "aarav@technova.in",    phone: "+91 98765 43210", company: "TechNova Pvt Ltd",   role: "Founder",       location: "Bengaluru", lastContact: "2h ago", deals: 3, tag: "customer" },
  { id: "C-002", name: "Bina Soni",      email: "bina@designhub.co",    phone: "+91 87654 32109", company: "DesignHub Co",       role: "CTO",           location: "Mumbai",    lastContact: "1d ago", deals: 1, tag: "prospect" },
  { id: "C-003", name: "Chetan Bhatt",   email: "chetan@gmail.com",     phone: "+91 76543 21098", company: "",                    role: "Individual",    location: "Pune",      lastContact: "3d ago", deals: 0, tag: "prospect" },
  { id: "C-004", name: "Diya Sen",       email: "diya@greenleaf.org",   phone: "+91 65432 10987", company: "GreenLeaf Org",       role: "Operations Mgr",location: "Delhi",     lastContact: "5h ago", deals: 2, tag: "customer" },
  { id: "C-005", name: "Eshan Roy",      email: "eshan@cloudsync.io",   phone: "+91 54321 09876", company: "CloudSync Solutions", role: "IT Director",   location: "Chennai",   lastContact: "2d ago", deals: 1, tag: "partner" },
  { id: "C-006", name: "Falguni Patel",  email: "falguni@nexacore.in",  phone: "+91 43210 98765", company: "NexaCore Labs",       role: "CEO",           location: "Ahmedabad", lastContact: "4h ago", deals: 4, tag: "customer" },
  { id: "C-007", name: "Gaurav Pillai",  email: "gaurav@studio.co",     phone: "+91 32109 87654", company: "",                    role: "Freelancer",    location: "Kochi",     lastContact: "1w ago", deals: 0, tag: "prospect" },
  { id: "C-008", name: "Heena Kapoor",   email: "heena@pixelcraft.io",  phone: "+91 21098 76543", company: "PixelCraft Studio",   role: "Design Lead",   location: "Bengaluru", lastContact: "6h ago", deals: 2, tag: "customer" },
];

export default function ContactsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => CONTACTS.filter((c) =>
      !query || `${c.name} ${c.email} ${c.company} ${c.location}`.toLowerCase().includes(query.toLowerCase())
    ),
    [query]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Contacts"
        subtitle="People and professionals connected to your leads and deals."
        actions={
          <Can permission="manage_customers">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Contact
            </Button>
          </Can>
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
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full">
          <Filter className="h-3.5 w-3.5" /> Filter
        </Button>
      </div>

      {/* Contact Grid */}
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
                  <p className="text-[11px] text-muted-foreground">{contact.role}</p>
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
              <div className="flex items-center gap-2 text-zinc-600">
                <Mail className="h-3.5 w-3.5 text-zinc-400" />
                {contact.email}
              </div>
              <div className="flex items-center gap-2 text-zinc-600">
                <Phone className="h-3.5 w-3.5 text-zinc-400" />
                {contact.phone}
              </div>
              <div className="flex items-center gap-2 text-zinc-600">
                <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                {contact.location}
              </div>
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

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="font-semibold">No contacts found</p>
          <p className="text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      )}
    </div>
  );
}
