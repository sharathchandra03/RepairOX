"use client";

import { motion } from "framer-motion";
import { Plus, MapPin, Users, Wrench, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";

const BRANCHES = [
  { name: "BTM Layout (HQ)", address: "2nd Floor, 100ft Road, Bengaluru 560076", staff: 8, techs: 3, status: "active" as const },
  { name: "Koramangala",     address: "5th Block, 80ft Road, Bengaluru 560095",  staff: 5, techs: 2, status: "active" as const },
  { name: "HSR Layout",      address: "Sector 2, HSR Layout, Bengaluru 560102",   staff: 4, techs: 1, status: "active" as const },
  { name: "Warehouse A",     address: "Whitefield Industrial Area, Bengaluru",    staff: 2, techs: 0, status: "active" as const },
];

export default function BranchesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Branches"
        title="Branches"
        subtitle="Every location RepairOX manages under this organisation."
        actions={
          <Can permission="manage_branches">
            <Button size="md" className="gap-1.5 rounded-full">
              <Plus className="h-4 w-4" /> Add branch
            </Button>
          </Can>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BRANCHES.map((b, i) => (
          <motion.div
            key={b.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                  <MapPin className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold leading-tight">{b.name}</p>
                  <Badge tone="success" dot className="mt-1">Active</Badge>
                </div>
              </div>
              <Can permission="manage_branches">
                <button className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </Can>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-600">{b.address}</p>
            <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {b.staff} staff</span>
              <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> {b.techs} technicians</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
