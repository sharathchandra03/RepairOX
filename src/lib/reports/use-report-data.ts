"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Unified dataset hook
   ──────────────────────────────────────────────────────────────────────────
   Composes every live business store into a single reactive dataset. This is
   the ONLY place the reporting layer reaches into the app's stores, so every
   figure downstream is guaranteed to be computed from real, current data
   (Supabase in production, localStorage in local/demo mode) — never hardcoded.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useExpenses } from "@/lib/expense-store";
import { useDailyLedger } from "@/lib/daily-ledger-service";
import { useLedger } from "@/lib/accounting-service";
import { usePermissions } from "@/lib/permissions-context";
import type { ReportDataset } from "./types";

export function useReportData(): ReportDataset {
  const store = useStore();
  const expenses = useExpenses();
  const ledger = useDailyLedger();
  const accounting = useLedger();
  const { team } = usePermissions();

  const ledgerSummaries = useMemo(
    () => ledger.getAllDailySummaries(),
    // getAllDailySummaries reads the module singleton; re-run when tx/sessions change.
    [ledger.transactions, ledger.sessions] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return useMemo<ReportDataset>(
    () => ({
      tickets: store.tickets,
      invoices: store.invoices,
      walkIns: store.walkIns,
      inventory: store.inventory,
      customers: store.customers,
      brands: store.brands,
      deviceModels: store.deviceModels,
      team,
      expenses,
      ledgerTx: ledger.transactions,
      ledgerEntries: accounting.entries,
      ledgerSummaries,
      hydrated: store.hydrated,
    }),
    [
      store.tickets, store.invoices, store.walkIns, store.inventory, store.customers,
      store.brands, store.deviceModels, store.hydrated,
      team, expenses, ledger.transactions, accounting.entries, ledgerSummaries,
    ]
  );
}
