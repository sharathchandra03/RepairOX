"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management "Agents" pill (Agent scope selector).

   A Lead-Management-SPECIFIC context control that sits beside the global Store
   selector. It lets an authorized owner scope the Agent Performance area into
   ALL AGENTS (the comparison table) or a SINGLE Sales Agent (their individual
   report) — the agent analogue of the "All Shops" store selector.

   IMPORTANT boundaries:
     • It is NOT a global navigation control. It ONLY renders inside the Lead
       Management workspace (activeWorkspace === "leads").
     • It does NOT change global store selection. Agent scope and Store scope
       are two independent dimensions.
     • It renders ONLY for owner-level users who may view ALL agents'
       performance (CAP.lead.performanceAll). Ordinary Sales Agents, Technicians,
       Reception, etc. never see it — they get their own individual dashboard
       from the nav item instead.
   ────────────────────────────────────────────────────────────────────────── */

import { useRouter, usePathname } from "next/navigation";
import { Users, ChevronDown, Check, Trophy } from "lucide-react";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useLeads } from "@/lib/leads-context";
import { agentsForStore } from "@/lib/sales-agents";
import { allow } from "@/lib/capabilities";
import { CAP } from "@/lib/capabilities";
import type { WorkspaceId } from "@/lib/permissions";

const PERF_ROOT = "/leads/intelligence/agents";

export function AgentScopeSelector({ activeWorkspace }: { activeWorkspace: WorkspaceId }) {
  const router = useRouter();
  const pathname = usePathname();
  const { can } = usePermissions();
  const { activeStoreId } = useStoreContext();
  const { salesAgents, salesAgentsReady } = useLeads();

  // Lead-Management-only control. Never a global pill.
  if (activeWorkspace !== "leads") return null;

  // Owner-level only: must be able to view ALL agents' performance.
  if (!allow(can, CAP.lead.performanceAll)) return null;

  // Only eligible Sales Agents authorized for the active store (org-wide in
  // All Shops). Uses the SAME store-scoped directory the pickers use.
  const agents = agentsForStore(salesAgents, activeStoreId ?? undefined);

  // Which agent (if any) is currently scoped, read from the URL.
  const onPerf = pathname === PERF_ROOT || pathname.startsWith(PERF_ROOT + "/");
  const selectedId = onPerf && pathname.startsWith(PERF_ROOT + "/")
    ? decodeURIComponent(pathname.slice(PERF_ROOT.length + 1).split("/")[0])
    : "";
  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) : undefined;

  const label = !onPerf
    ? "Agents"
    : selectedAgent
    ? selectedAgent.name
    : "All Agents";

  return (
    <Dropdown
      align="left"
      width="w-72"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-label="Agent intelligence scope"
          className={cn(
            "hidden md:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95",
            onPerf ? "bg-[#EEF1FD] text-[#3A4DBB]" : "bg-[#F5F7FF] text-[#3A4DBB]",
            open ? "border-[#B3BFF6]" : "border-[#E5E9F8] hover:border-[#B3BFF6]",
          )}
        >
          <Users className="h-3.5 w-3.5" />
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Agent Intelligence</MenuLabel>

          {/* All Agents — the owner comparison table. */}
          <MenuItem
            onClick={() => { router.push(PERF_ROOT); close(); }}
            className={onPerf && !selectedId ? "bg-[#EEF1FD]" : ""}
          >
            <span className="flex flex-1 items-center justify-between">
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#4361EE]" />
                <span>
                  <span className="block font-semibold">All Agents</span>
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    Ranked performance comparison
                  </span>
                </span>
              </span>
              {onPerf && !selectedId && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
            </span>
          </MenuItem>

          <div className="my-1 h-px bg-border" />

          <div className="max-h-[280px] overflow-y-auto">
            {!salesAgentsReady ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">Loading agents…</div>
            ) : agents.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                No Sales Agents in this store scope.
              </div>
            ) : (
              agents.map((a) => {
                const selected = selectedId === a.id;
                return (
                  <MenuItem
                    key={a.id}
                    onClick={() => { router.push(`${PERF_ROOT}/${encodeURIComponent(a.id)}`); close(); }}
                    className={selected ? "bg-[#EEF1FD]" : ""}
                  >
                    <span className="flex flex-1 items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                          {a.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <span className="block font-semibold">{a.name}</span>
                          <span className="block text-[11px] font-normal text-muted-foreground">{a.roleLabel}</span>
                        </span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                    </span>
                  </MenuItem>
                );
              })
            )}
          </div>
        </>
      )}
    </Dropdown>
  );
}
