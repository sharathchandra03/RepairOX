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
import { Users, ChevronDown, Check, Trophy, Eye, LogOut } from "lucide-react";
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
  const { salesAgents, salesAgentsReady, viewAsAgentId, setViewAsAgent, currentUserIsSalesAgent } = useLeads();

  // Lead-Management-only control. Never a global pill.
  if (activeWorkspace !== "leads") return null;

  // Owner-level only: must be able to view ALL agents' performance.
  // A user who is themselves a Sales Agent never gets the cross-agent scope
  // selector, even if their role carries a coarse reporting key — their page is
  // always their own individual workspace.
  if (!allow(can, CAP.lead.performanceAll)) return null;
  if (currentUserIsSalesAgent(activeStoreId)) return null;

  // Only eligible Sales Agents authorized for the active store (org-wide in
  // All Shops). Uses the SAME store-scoped directory the pickers use.
  const agents = agentsForStore(salesAgents, activeStoreId ?? undefined);

  // The ACTIVE scope is the read-only "view as agent" scope (the whole-module
  // lens). It is the source of truth for the selected agent + the pill label.
  // On the Agent-Intelligence routes we also reflect the per-agent report in
  // the URL so the control still reads correctly there.
  const onPerf = pathname === PERF_ROOT || pathname.startsWith(PERF_ROOT + "/");
  const perfAgentId = onPerf && pathname.startsWith(PERF_ROOT + "/")
    ? decodeURIComponent(pathname.slice(PERF_ROOT.length + 1).split("/")[0])
    : "";
  const selectedId = viewAsAgentId || perfAgentId;
  const selectedAgent = selectedId ? agents.find((a) => a.id === selectedId) : undefined;

  // Enter an agent's read-only Lead workspace (Option A — NOT impersonation).
  const enterAgent = (id: string) => {
    setViewAsAgent(id);
    router.push(`/leads/list?viewAs=${encodeURIComponent(id)}`);
  };
  // Leave the view-as scope.
  const exitViewAs = () => setViewAsAgent("");

  const label = viewAsAgentId
    ? (selectedAgent?.name ?? "Agent")
    : !onPerf
    ? "Agents"
    : perfAgentId
    ? (selectedAgent?.name ?? "All Agents")
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
            (onPerf || viewAsAgentId) ? "bg-[#EEF1FD] text-[#3A4DBB]" : "bg-[#F5F7FF] text-[#3A4DBB]",
            open ? "border-[#B3BFF6]" : "border-[#E5E9F8] hover:border-[#B3BFF6]",
          )}
        >
          {/* Eye signals the read-only workspace lens; Users is the default. */}
          {viewAsAgentId ? <Eye className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Agents</MenuLabel>

          {/* All Agents — the owner comparison table. Also EXITS any active
              view-as scope (returns the owner to their own full view). */}
          <MenuItem
            onClick={() => { exitViewAs(); router.push(PERF_ROOT); close(); }}
            className={onPerf && !perfAgentId && !viewAsAgentId ? "bg-[#EEF1FD]" : ""}
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
              {onPerf && !perfAgentId && !viewAsAgentId && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
            </span>
          </MenuItem>

          {/* Exit the read-only lens (only while one is active). */}
          {viewAsAgentId && (
            <MenuItem onClick={() => { exitViewAs(); router.push("/leads/list"); close(); }}>
              <span className="flex items-center gap-2 text-[#3A4DBB]">
                <LogOut className="h-4 w-4" />
                <span className="font-semibold">Exit agent view</span>
              </span>
            </MenuItem>
          )}

          <div className="my-1 h-px bg-border" />

          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            View a Sales Agent&rsquo;s workspace (read-only)
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {!salesAgentsReady ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">Loading agents…</div>
            ) : agents.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                No Sales Agents in this store scope.
              </div>
            ) : (
              agents.map((a) => {
                const selected = viewAsAgentId === a.id;
                return (
                  <MenuItem
                    key={a.id}
                    onClick={() => { enterAgent(a.id); close(); }}
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
                      {selected
                        ? <Check className="h-3.5 w-3.5 text-[#4361EE]" />
                        : <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
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
