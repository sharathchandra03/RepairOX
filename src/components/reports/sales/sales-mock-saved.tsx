"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Sales Management · Saved Reports (UI preview)
   ──────────────────────────────────────────────────────────────────────────
   Same card grid + detail pane as Shop's SavedReportsPanel, showing static
   sample reports. Wire to the real saved-reports store once Sales engine is
   connected.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Star, Pin, Pencil, FileSpreadsheet, Printer, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Panel } from "../report-ui";
import { ModulePreviewBanner } from "../module-preview-banner";
import { EmptyState } from "../empty-state";
import { salesSavedReports } from "./mock-data";

type FilterMode = "all" | "recent" | "pinned";

const FILTER_COPY: Record<FilterMode, { title: string; empty: string }> = {
  all: { title: "Report Library", empty: "No saved reports yet. Build one to start your library." },
  recent: { title: "Recently Used", empty: "Reports you open will show up here, most recent first." },
  pinned: { title: "Pinned Reports", empty: "Pin a report from its toolbar to keep it here for quick access." },
};

export function SalesMockSaved({ filterMode = "all" }: { filterMode?: FilterMode }) {
  const [selectedId, setSelectedId] = useState<string | null>(salesSavedReports[0]?.id ?? null);

  const filtered = useMemo(() => {
    if (filterMode === "pinned") return salesSavedReports.filter((r) => r.pinned);
    if (filterMode === "recent") return salesSavedReports.slice(0, 3);
    return salesSavedReports;
  }, [filterMode]);

  const selected = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;
  const copy = FILTER_COPY[filterMode];

  return (
    <div className="space-y-4">
      <ModulePreviewBanner moduleLabel="Sales Management" />

      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-border bg-card p-8 shadow-card">
          <EmptyState icon="inbox" title={copy.empty} detail="Build a custom report to get started." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Report list */}
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {copy.title}
            </p>
            {filtered.map((r) => {
              const active = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    active
                      ? "border-[#4361EE]/50 bg-[#EEF1FD] shadow-card"
                      : "border-border bg-card hover:bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-foreground">{r.name}</span>
                    <div className="flex items-center gap-1">
                      {r.pinned && <Pin className="h-3 w-3 text-[#4361EE]" />}
                      {r.scheduled && <Calendar className="h-3 w-3 text-emerald-600" />}
                    </div>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{r.description}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <Panel
              title={selected.name}
              subtitle={selected.description}
              actions={
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" disabled>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button size="sm" disabled>
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                </div>
              }
            >
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
                  <Star className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-4 text-[13px] font-semibold text-foreground">Report preview</p>
                <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                  Once the Sales data engine is connected, this report will render live charts and tables here.
                  The complete UI is ready — only the data source connection is pending.
                </p>
                <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {selected.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[#3347D6]">
                      <Pin className="h-3 w-3" /> Pinned
                    </span>
                  )}
                  {selected.scheduled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      <Calendar className="h-3 w-3" /> {selected.scheduled}
                    </span>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
