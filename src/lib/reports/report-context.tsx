"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Global Reporting Context
   ──────────────────────────────────────────────────────────────────────────
   Single source of truth for which reporting scope is active. Every report
   component (cockpit, builder, comparison, filters, saved, export) consumes
   this context so the scope is consistent across all pages within Reports.

   Bidirectional sync with the app-level workspace:
   • When the user switches the application module → scope updates here.
   • When the user switches scope inside Reports → the app workspace updates.

   The mapping is:
     WorkspaceId "shop"       ↔  ReportModuleId "shop"
     WorkspaceId "leads"      ↔  ReportModuleId "sales"
     WorkspaceId "operations" ↔  ReportModuleId "field"
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { ReportModuleId } from "./types";
import type { WorkspaceId } from "@/lib/permissions";

/* ─── Mapping helpers ────────────────────────────────────────────────────── */

export function workspaceToModule(ws: WorkspaceId): ReportModuleId {
  switch (ws) {
    case "shop": return "shop";
    case "leads": return "sales";
    case "operations": return "field";
    default: return "shop";
  }
}

export function moduleToWorkspace(mod: ReportModuleId): WorkspaceId {
  switch (mod) {
    case "shop": return "shop";
    case "sales": return "leads";
    case "field": return "operations";
    default: return "shop";
  }
}

/* ─── Module metadata ────────────────────────────────────────────────────── */

export interface ReportModuleMeta {
  id: ReportModuleId;
  label: string;
  reportTitle: string;
  description: string;
}

export const REPORT_MODULE_META: Record<ReportModuleId, ReportModuleMeta> = {
  shop: {
    id: "shop",
    label: "Shop Management",
    reportTitle: "Shop Reports",
    description: "Tickets, invoices, inventory, expenses and collections — your complete shop intelligence cockpit.",
  },
  sales: {
    id: "sales",
    label: "Sales Management",
    reportTitle: "Sales Reports",
    description: "Pipeline, leads, deals, campaigns and revenue — your complete sales intelligence cockpit.",
  },
  field: {
    id: "field",
    label: "Field Management",
    reportTitle: "Field Reports",
    description: "On-site visits, routes, van stock and technician performance — your complete field intelligence cockpit.",
  },
};

/* ─── Context definition ─────────────────────────────────────────────────── */

interface ReportContextValue {
  /** Currently active reporting scope. */
  moduleScope: ReportModuleId;
  /** Switch the reporting scope. Also triggers workspace sync via callback. */
  setModuleScope: (mod: ReportModuleId) => void;
  /** Metadata for the active scope. */
  meta: ReportModuleMeta;
}

const ReportContext = createContext<ReportContextValue | null>(null);

/* ─── Provider ───────────────────────────────────────────────────────────── */

export function ReportContextProvider({
  children,
  initialScope = "shop",
  externalScope,
  onScopeChange,
}: {
  children: ReactNode;
  /** The initial scope derived from the active workspace when Reports loads. */
  initialScope?: ReportModuleId;
  /** When provided, the context syncs to this value (driven by the app shell). */
  externalScope?: ReportModuleId;
  /** Called when the user switches scope inside Reports — lets the shell sync workspace. */
  onScopeChange?: (mod: ReportModuleId) => void;
}) {
  const [moduleScope, setModuleScopeRaw] = useState<ReportModuleId>(externalScope ?? initialScope);

  // Sync from external (workspace changed outside Reports).
  // Only update if the external scope differs from current internal state.
  const prevExternal = useRef(externalScope);
  if (externalScope !== undefined && externalScope !== prevExternal.current) {
    prevExternal.current = externalScope;
    if (externalScope !== moduleScope) {
      setModuleScopeRaw(externalScope);
    }
  }

  const setModuleScope = useCallback(
    (mod: ReportModuleId) => {
      setModuleScopeRaw(mod);
      onScopeChange?.(mod);
    },
    [onScopeChange]
  );

  const meta = REPORT_MODULE_META[moduleScope];

  return (
    <ReportContext.Provider value={{ moduleScope, setModuleScope, meta }}>
      {children}
    </ReportContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useReportContext(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) {
    throw new Error("useReportContext must be used within a ReportContextProvider");
  }
  return ctx;
}
