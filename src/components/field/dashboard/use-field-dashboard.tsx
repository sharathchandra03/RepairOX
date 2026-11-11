"use client";
/* RepairOX — shared plumbing for the five Field dashboards.
   ONE data hook + ONE registry, so every dashboard (and the hub) agrees on what
   is available to the current user and computes from the same predicates. */
import { useMemo } from "react";
import { Store, Building2, Users, CalendarRange, CalendarDays } from "lucide-react";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { resolveFieldRow } from "@/lib/field-resolve";
import { tripValue } from "@/lib/field-table";
import type { FieldJob } from "@/lib/field-data";
import type { AggregateCtx } from "@/lib/field-dashboard";

export type DashboardId = "multi-store" | "single-store" | "fe-team" | "store-master" | "fe-master";

export interface DashboardDef {
  id: DashboardId;
  name: string;
  short: string;
  purpose: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "violet" | "amber" | "teal" | "emerald";
}

export const DASHBOARDS: DashboardDef[] = [
  { id: "multi-store", name: "Multi-Store Dashboard", short: "Multi-Store", href: "/field/dashboard/multi-store", Icon: Store, tone: "sky",
    purpose: "Compare every store: business, assigned and completed On-Site, Pickup and Drop trips." },
  { id: "single-store", name: "Single-Store Dashboard", short: "Single Store", href: "/field/dashboard/single-store", Icon: Building2, tone: "teal",
    purpose: "Your store's business and On-Site, Pickup and Drop performance." },
  { id: "fe-team", name: "FE Team Dashboard", short: "FE Team", href: "/field/dashboard/fe-team", Icon: Users, tone: "violet",
    purpose: "How each Field Engineer is performing: business, assigned and completed trips." },
  { id: "store-master", name: "Store Master Dashboard", short: "Store Master", href: "/field/dashboard/store-master", Icon: CalendarRange, tone: "amber",
    purpose: "Month-by-month trips and business for every store, with the On-Site / Pickup / Drop breakup." },
  { id: "fe-master", name: "FE Master Dashboard", short: "FE Master", href: "/field/dashboard/fe-master", Icon: CalendarDays, tone: "emerald",
    purpose: "Month-by-month trips and business for every Field Engineer." },
];

export function useFieldDashboard() {
  const { jobs, hydrated } = useField();
  const { tickets, invoices, customers } = useStore();
  const { stores, isAllShops } = useStoreContext();
  const { can } = usePermissions();
  const multiStore = isAllShops && stores.length > 1;
  const canTeam = allow(can, CAP.field.viewAll);
  const src = useMemo(() => ({ tickets, invoices, customers }), [tickets, invoices, customers]);

  const ctx: AggregateCtx = useMemo(() => ({
    finalizedInvoiceOf: (j: FieldJob) => {
      const r = resolveFieldRow(j, src);
      const v = tripValue(r);
      return v.finalized != null && r.invoice ? { id: String((r.invoice as { id: string }).id), total: v.finalized } : null;
    },
    storeKeyOf: (j: FieldJob) => {
      const s = stores.find((x) => x.id === j.branchId) ?? stores.find((x) => x.name === j.branch);
      return { key: s?.id || j.branchId || j.branch || "unknown", label: s?.name || j.branch || "Unknown store" };
    },
  }), [src, stores]);

  /** Which dashboards this user can open right now (permission + store mode). */
  const available = useMemo(() => DASHBOARDS.filter((d) => {
    if (d.id === "multi-store") return multiStore;
    if (d.id === "single-store") return !multiStore;
    if (d.id === "fe-team" || d.id === "fe-master") return canTeam;
    return true;
  }), [multiStore, canTeam]);

  return { jobs, hydrated, ctx, stores, multiStore, canTeam, available };
}
