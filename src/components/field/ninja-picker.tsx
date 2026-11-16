"use client";

/* Searchable staff picker for assigning a Field Manager or Ninja to a job.
   Shows the person's branch + their current active field-job load so the
   Field Manager can balance work. Reuses the Employee/User master (no separate
   ninja database). */

import { useMemo, useState } from "react";
import { Search, Check, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useField } from "@/lib/field-context";
import { staffByRole, activeJobCountFor } from "@/lib/field-linking";
import { useNinjaAvailability } from "@/hooks/use-ninja-availability";
import { AVAIL_CHIP, AVAIL_DOT, describeAvailability } from "@/lib/field-availability";

export function StaffPicker({
  roleIds, valueId, onPick, placeholder = "Search staff…", showLoad = false,
}: {
  roleIds: string[];
  valueId: string;
  onPick: (id: string, name: string) => void;
  placeholder?: string;
  showLoad?: boolean;
}) {
  const { team } = usePermissions();
  const { jobs } = useField();
  const [q, setQ] = useState("");

  const isNinja = roleIds.includes("ninja");
  const all = useMemo(() => staffByRole(team, roleIds), [team, roleIds]);
  const { map: avail } = useNinjaAvailability(all.map((s) => s.id), isNinja);
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? all.filter((s) => s.name.toLowerCase().includes(needle) || (s.branch || "").toLowerCase().includes(needle)) : all;
    if (!isNinja || avail.size === 0) return list;
    // Best to assign first: Available → booked → on a job → in trip → on break → off duty.
    return [...list].sort((a, b) => (describeAvailability(avail.get(a.id))?.rank ?? 9) - (describeAvailability(avail.get(b.id))?.rank ?? 9) || a.name.localeCompare(b.name));
  }, [all, q, isNinja, avail]);
  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm focus:border-[#4361EE] focus:outline-none"
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {options.length === 0 && (
          <p className="px-2 py-3 text-center text-[12px] text-zinc-400">No matching staff. Add them under Employees with the right role.</p>
        )}
        {options.map((s) => {
          const active = s.id === valueId;
          const load = showLoad ? activeJobCountFor(s.id, jobs) : 0;
          const av = isNinja ? describeAvailability(avail.get(s.id)) : null;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id, s.name)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition",
                active ? "border-[#4361EE] bg-[#EEF1FD]" : "border-transparent hover:bg-muted/50",
              )}
            >
              <Avatar name={s.name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-zinc-900">{s.name}</p>
                <p className="truncate text-[11px] text-zinc-500">{s.branch || "—"}{showLoad ? ` · ${load} active` : ""}</p>
              </div>
              {av ? (
                <span title={av.detail} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset", AVAIL_CHIP[av.tone])}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", AVAIL_DOT[av.tone])} />{av.label}
                </span>
              ) : null}
              {active && <Check className="h-4 w-4 text-[#4361EE]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
