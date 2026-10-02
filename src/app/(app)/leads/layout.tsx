"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management module layout.

   Owns the OWNER "View as agent" read-only scope for the WHOLE module (Option A
   — NOT impersonation). A Sales Agent only has the Lead module, so an owner who
   picks an agent from the Agents selector gets a faithful, read-only view of
   that agent's entire Lead workspace — list, kanban, map, contacts, deals,
   quotations, follow-ups, reports/intelligence — all scoped to that agent and
   all locked. The owner's signed-in session identity NEVER changes.

   Why this lives in the layout (not a page):
     • It mounts once for /leads/** and persists across in-module navigation, so
       the scope + the ONE read-only banner survive moving between pages.
     • The scope itself lives in LeadsProvider (session-persisted), so a hard
       refresh on any sub-page restores it; this layout just syncs the URL
       deep-link (?viewAs=) and clears the scope when the owner truly leaves the
       module (layout unmount).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, X } from "lucide-react";
import { useLeads } from "@/lib/leads-context";

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const { viewAsAgentId, viewAsReadOnly, setViewAsAgent, salesAgents } = useLeads();

  /* Deep-link / entry support: /leads/...?viewAs=<agentUserId> enters the
     read-only scope. The context ignores it for a user without cross-agent
     authority, so this is safe to call unconditionally. We only call setter
     when the param is present and differs — bare in-module navigation (no
     param) must NOT clear an already-active scope. */
  const viewAsParam = searchParams.get("viewAs") || "";
  useEffect(() => {
    if (viewAsParam && viewAsParam !== viewAsAgentId) setViewAsAgent(viewAsParam);
  }, [viewAsParam, viewAsAgentId, setViewAsAgent]);

  /* Clear the scope when the owner LEAVES the Lead module entirely (this layout
     unmounts). In-module navigation keeps the layout mounted, so the scope
     persists exactly where it should. */
  useEffect(() => {
    return () => setViewAsAgent("");
  }, [setViewAsAgent]);

  const agentName = salesAgents.find((a) => a.id === viewAsAgentId)?.name;

  return (
    <>
      {/* ONE persistent read-only banner for the whole module. */}
      {viewAsReadOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B3BFF6] bg-[#EEF1FD]/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#4361EE]/10 text-[#4361EE]"><Eye className="h-4 w-4" /></span>
            <div className="min-w-0 text-[12.5px]">
              <p className="font-semibold text-[#2B3B9E]">
                Viewing {agentName || "this agent"}&rsquo;s workspace · read-only
              </p>
              <p className="text-[#4361EE]/80">
                You&rsquo;re seeing exactly what this Sales Agent sees across their Lead workspace. Your account, role and session are unchanged — no edits are possible here.
              </p>
            </div>
          </div>
          {/* Exit returns the owner to their own view. Links to the module root
              WITHOUT ?viewAs= and clears the session scope immediately. */}
          <Link
            href="/leads/list"
            onClick={() => setViewAsAgent("")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#B3BFF6] bg-card px-3 py-1.5 text-[12px] font-semibold text-[#3A4DBB] transition hover:bg-[#EEF1FD]"
          >
            <X className="h-3.5 w-3.5" /> Exit view
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
