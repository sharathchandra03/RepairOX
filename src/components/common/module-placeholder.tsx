"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Can } from "@/components/common/can";
import type { PermissionKey } from "@/lib/permissions";

export function ModulePlaceholder({
  title,
  subtitle,
  eyebrow,
  preview,
  permission = "create",
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  preview: { label: string; value: string }[];
  /** Permission required to see "Set up module" — this is a configure/create
   *  action, so it defaults to the generic `create` capability. */
  permission?: PermissionKey;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={
          <Can permission={permission}>
            <Button variant="soft" size="md" className="rounded-full"><Sparkles className="h-4 w-4" /> Set up module</Button>
          </Can>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {preview.map((p, i) => (
          <motion.div
            key={p.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{p.label}</p>
            <p className="font-display mt-2 text-3xl font-extrabold tracking-tight">{p.value}</p>
            <div className="mt-4 h-1 w-full rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${20 + i * 25}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full brand-gradient"
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Skeleton table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Recent activity</p>
          <Button variant="outline" size="sm">View all</Button>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-xl" />
                <div className="space-y-1.5">
                  <div className="skeleton h-3 w-40" />
                  <div className="skeleton h-3 w-24" />
                </div>
              </div>
              <div className="skeleton h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
