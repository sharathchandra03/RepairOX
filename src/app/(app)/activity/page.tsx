"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, SlidersHorizontal, CalendarDays, User, Layers, X, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useActivityLog, ALL_MODULES, timeGroup, type ActivityEntry,
  type ActivityModule, type ActivitySeverity,
} from "@/lib/activity-log";
import { ActivityTimeline, ActivityDetailDrawer } from "@/components/activity/activity-log-ui";

const PAGE_SIZE = 25;
const GROUP_ORDER = ["Today", "Yesterday", "Earlier This Week", "Earlier This Month", "Older"];

type DateRange = "all" | "today" | "yesterday" | "7days" | "30days";
const DATE_LABEL: Record<DateRange, string> = {
  all: "All Time", today: "Today", yesterday: "Yesterday", "7days": "Last 7 Days", "30days": "Last 30 Days",
};

export default function ActivityLogPage() {
  const activities = useActivityLog();

  const [moduleFilter, setModuleFilter] = useState<ActivityModule | "all">("all");
  const [severity, setSeverity] = useState<ActivitySeverity | "all">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);

  // Distinct actors for the User filter
  const users = useMemo(() => Array.from(new Set(activities.map((a) => a.actor))).sort(), [activities]);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();
    const q = search.trim().toLowerCase();

    return activities.filter((a) => {
      if (moduleFilter !== "all" && a.module !== moduleFilter) return false;
      if (severity !== "all" && a.severity !== severity) return false;
      if (userFilter !== "all" && a.actor !== userFilter) return false;
      if (dateRange !== "all") {
        switch (dateRange) {
          case "today": if (a.ts < ts) return false; break;
          case "yesterday": if (!(a.ts >= ts - 86_400_000 && a.ts < ts)) return false; break;
          case "7days": if (a.ts < ts - 7 * 86_400_000) return false; break;
          case "30days": if (a.ts < ts - 30 * 86_400_000) return false; break;
        }
      }
      if (q) {
        const hay = `${a.action} ${a.description} ${a.reference ?? ""} ${a.actor} ${a.module}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities, moduleFilter, severity, userFilter, dateRange, search]);

  // Reset pagination whenever filters change
  useEffect(() => { setVisible(PAGE_SIZE); }, [moduleFilter, severity, userFilter, dateRange, search]);

  const page = filtered.slice(0, visible);

  // Group the visible slice into ordered chronological buckets
  const groups = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of page) {
      const g = timeGroup(e.ts);
      (map.get(g) ?? map.set(g, []).get(g)!).push(e);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, entries: map.get(g)! }));
  }, [page]);

  const hasActiveFilters = moduleFilter !== "all" || severity !== "all" || userFilter !== "all" || dateRange !== "all" || search.trim() !== "";
  function clearFilters() {
    setModuleFilter("all"); setSeverity("all"); setUserFilter("all"); setDateRange("all"); setSearch("");
  }

  const chip = "inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[12px] font-medium transition";
  const chipIdle = "border-border text-zinc-600 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#B3BFF6]/50";
  const chipActive = "border-[#4361EE] text-[#4361EE] bg-indigo-50";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit Trail"
        title="Activity Log"
        subtitle="A complete, centralized record of every important action across RepairOX."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities…"
            className="h-[34px] w-56 rounded-full border border-border bg-card pl-9 pr-3 text-[12px] outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#B3BFF6]/40"
          />
        </div>

        {/* Module */}
        <Dropdown align="left" width="w-48" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn(chip, moduleFilter !== "all" ? chipActive : chipIdle)}>
            <Layers className="h-3.5 w-3.5" /> {moduleFilter === "all" ? "All Modules" : moduleFilter}
          </button>
        )}>
          {(close) => (<>
            <MenuLabel>Module</MenuLabel>
            <MenuItem onClick={() => { setModuleFilter("all"); close(); }} className={cn(moduleFilter === "all" && "bg-muted font-semibold")}>All Modules</MenuItem>
            {ALL_MODULES.map((m) => (
              <MenuItem key={m} onClick={() => { setModuleFilter(m); close(); }} className={cn(moduleFilter === m && "bg-muted font-semibold")}>{m}</MenuItem>
            ))}
          </>)}
        </Dropdown>

        {/* User */}
        <Dropdown align="left" width="w-52" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn(chip, userFilter !== "all" ? chipActive : chipIdle)}>
            <User className="h-3.5 w-3.5" /> {userFilter === "all" ? "All Users" : userFilter}
          </button>
        )}>
          {(close) => (<>
            <MenuLabel>Performed by</MenuLabel>
            <MenuItem onClick={() => { setUserFilter("all"); close(); }} className={cn(userFilter === "all" && "bg-muted font-semibold")}>All Users</MenuItem>
            {users.map((u) => (
              <MenuItem key={u} onClick={() => { setUserFilter(u); close(); }} className={cn(userFilter === u && "bg-muted font-semibold")}>{u}</MenuItem>
            ))}
          </>)}
        </Dropdown>

        {/* Date range */}
        <Dropdown align="left" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className={cn(chip, dateRange !== "all" ? chipActive : chipIdle)}>
            <CalendarDays className="h-3.5 w-3.5" /> {DATE_LABEL[dateRange]}
          </button>
        )}>
          {(close) => (<>
            <MenuLabel>Date range</MenuLabel>
            {(Object.keys(DATE_LABEL) as DateRange[]).map((d) => (
              <MenuItem key={d} onClick={() => { setDateRange(d); close(); }} className={cn(dateRange === d && "bg-muted font-semibold")}>{DATE_LABEL[d]}</MenuItem>
            ))}
          </>)}
        </Dropdown>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50 transition">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <SegmentedTabs
            size="sm"
            value={severity}
            onChange={(v) => setSeverity(v as ActivitySeverity | "all")}
            options={[
              { label: "All", value: "all" },
              { label: "Success", value: "success" },
              { label: "Info", value: "info" },
              { label: "Warning", value: "warning" },
              { label: "Critical", value: "critical" },
              { label: "Neutral", value: "neutral" },
            ]}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "activity" : "activities"}
          </p>
          <p className="text-[11px] text-muted-foreground">Newest first</p>
        </div>

        {groups.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <ScrollText className="h-7 w-7 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No activities match your filters</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-[12px] font-semibold text-[#4361EE] hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="p-3 sm:p-4">
            {groups.map((g) => (
              <div key={g.label} className="mb-4 last:mb-0">
                <p className="sticky top-0 z-[1] bg-card/95 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 backdrop-blur">
                  {g.label}
                </p>
                <ActivityTimeline entries={g.entries} onSelect={setSelected} />
              </div>
            ))}

            {filtered.length > visible && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Load more ({filtered.length - visible} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ActivityDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
