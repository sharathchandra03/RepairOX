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

  const options = useMemo(() => {
    const staff = staffByRole(team, roleIds);
    const needle = q.trim().toLowerCase();
    return needle ? staff.filter((s) => s.name.toLowerCase().includes(needle) || (s.branch || "").toLowerCase().includes(needle)) : staff;
  }, [team, roleIds, q]);

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
              {active && <Check className="h-4 w-4 text-[#4361EE]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
