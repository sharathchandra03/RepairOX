"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Filter, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { tickets, STATUS_LABEL, STATUS_TONE, TicketStatus } from "@/lib/mock-data";
import { formatINR, cn } from "@/lib/utils";

const FILTERS: { label: string; value: TicketStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Received", value: "received" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Repairing", value: "repairing" },
  { label: "QC", value: "qc" },
  { label: "Completed", value: "completed" },
  { label: "Delivered", value: "delivered" },
];

export default function TicketsPage() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      tickets.filter((t) => {
        const okStatus = filter === "all" || t.status === filter;
        const okQ = !q || `${t.id} ${t.customer} ${t.model} ${t.issue}`.toLowerCase().includes(q.toLowerCase());
        return okStatus && okQ;
      }),
    [filter, q]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Tickets"
        subtitle="Every repair job in one searchable, status-aware list."
        actions={
          <>
            <Button variant="outline" size="md" className="rounded-full"><Filter className="h-4 w-4" /> Filter</Button>
            <Can permission="export_reports">
              <Button variant="outline" size="md" className="rounded-full"><Download className="h-4 w-4" /> Export</Button>
            </Can>
            <Can permission="manage_repair_jobs">
              <Link href="/tickets/new">
                <Button size="md" className="rounded-full"><Plus className="h-4 w-4" /> New Ticket</Button>
              </Link>
            </Can>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ label: f.label, value: f.value as string }))}
          size="sm"
        />
        <div className="lg:w-80">
          <Input
            value={q}
            onChange={(e: any) => setQ(e.target.value)}
            placeholder="Search by ID, customer, model…"
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Ticket</th>
              <th className="py-3">Customer</th>
              <th className="py-3">Device</th>
              <th className="py-3">Issue</th>
              <th className="py-3">Tech</th>
              <th className="py-3">Status</th>
              <th className="py-3 text-right pr-5">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => (
              <motion.tr
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i }}
                className="group cursor-pointer border-t border-border transition hover:bg-muted/40"
              >
                <td className="px-5 py-3 font-semibold">{t.id}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={t.customer} size={28} />
                    <span>{t.customer}</span>
                  </div>
                </td>
                <td className="py-3 text-muted-foreground">{t.model}</td>
                <td className="py-3 text-muted-foreground">{t.issue}</td>
                <td className="py-3">{t.technician}</td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
                <td className="py-3 pr-5 text-right font-semibold tnum">{formatINR(t.amount)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <EmptyRow />}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {list.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            className="rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={t.customer} size={32} />
                <div>
                  <p className="text-sm font-semibold">{t.customer}</p>
                  <p className="text-[11px] text-muted-foreground">{t.id} · {t.model}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <p className="mt-3 text-sm">{t.issue}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Tech · {t.technician}</span>
              <span className="font-semibold tnum text-foreground">{formatINR(t.amount)}</span>
            </div>
          </motion.div>
        ))}
        {list.length === 0 && <EmptyRow />}
      </div>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">🔍</div>
      <p className="font-semibold">No tickets match your filters</p>
      <p className="text-sm text-muted-foreground">Try a different status or clear your search.</p>
    </div>
  );
}
