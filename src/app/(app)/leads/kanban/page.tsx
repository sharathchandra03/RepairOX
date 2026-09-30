"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Kanban (PERSONAL visual sales workspace).

   ONE LEAD = ONE VISUAL CARD.  ONE COLUMN = ONE PERSONAL WORKFLOW GROUP.

   This is NOT a second Lead Status system. The Lead (useLeads().leads) is the
   single source of truth. The board/columns/card-placement are a PERSONAL,
   user-scoped visualization layer (useLeadKanban, persisted per user). Dragging
   a card changes ONLY the personal placement/order — it NEVER changes Lead
   Status / Priority / Owner / Follow-up. Card data is read live from the
   canonical lead, so a lead edit anywhere reflects here automatically.

   Visibility respects the existing Lead permissions + store scope:
   useLeads().leads is already RLS-scoped; this page further scopes to the
   signed-in user's own/assigned leads unless they hold a see-all key, and to
   the active store selection.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import {
  Plus, Search, List, LayoutGrid, Map as MapIcon, Inbox, LayoutDashboard,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/common/can";
import { CAP, allow } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useSession } from "@/lib/use-session";
import { useLeadKanban } from "@/hooks/use-lead-kanban";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { StoreMultiSelect } from "@/components/common/store-multi-select";
import { kanbanColor, noteColorOf, type KanbanColumn, type NoteColor } from "@/lib/lead-kanban";
import { LeadKanbanCard } from "@/components/leads/kanban/lead-kanban-card";
import { BoardSelector, BoardSettingsMenu, NewBoardDrawer } from "@/components/leads/kanban/board-controls";
import { ManageColumnsDrawer } from "@/components/leads/kanban/manage-columns-drawer";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { openFollowUpRowState, type Lead } from "@/lib/leads-data";

/* Text used to match a lead against the search query (structured fields). */
function leadSearchText(lead: Lead): string {
  return [
    lead.leadNo, lead.name, lead.number, lead.email, lead.device, lead.issue,
    lead.source, lead.assignedToName, lead.region,
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function KanbanPage() {
  const { leads, openFollowUpsByLead, canSeeAllLeads } = useLeads();
  const { can } = usePermissions();
  const { id: currentUserId } = useSession();
  const { stores, isAllShops, getStore, activeStoreId } = useStoreContext();

  const kanban = useLeadKanban(currentUserId);
  const { activeBoard } = kanban;

  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [columnFilter, setColumnFilter] = useState<string | null>(null); // null = All
  const [showCreate, setShowCreate] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [showManageColumns, setShowManageColumns] = useState(false);

  const canCall = allow(can, CAP.lead.view);

  /* ── The leads this personal Kanban should show ──
     useLeads().leads is ALREADY visibility-scoped (RLS mirror). We further scope
     to the signed-in user's own/assigned leads UNLESS they hold a see-all key —
     the personal Kanban is a personal daily workspace, not an org board. Store
     scope (active store) + the optional multi-store filter also apply. */
  const myLeads = useMemo(() => {
    return leads.filter((l) => {
      // Own-scope for non-see-all users (a personal workspace).
      if (!canSeeAllLeads && currentUserId) {
        const mine = l.assignedTo === currentUserId || l.createdBy === currentUserId || l.followUpAgentId === currentUserId;
        if (!mine) return false;
      }
      // Active store context (single-store users are already pinned).
      if (activeStoreId && l.branchId && l.branchId !== activeStoreId) return false;
      // Optional multi-store filter (All Shops view).
      if (!matchesStoreSelection(l.branchId, storeFilter)) return false;
      return true;
    });
  }, [leads, canSeeAllLeads, currentUserId, activeStoreId, storeFilter]);

  const myLeadIds = useMemo(() => myLeads.map((l) => l.id), [myLeads]);
  const leadById = useMemo(() => new Map(myLeads.map((l) => [l.id, l])), [myLeads]);

  /* ── Reconcile the active board against the authorized lead set ──
     Auto-places new/unplaced authorized leads into the first column and prunes
     placements for leads that left scope. Runs when the visible set changes. */
  const reconcileRef = useRef(kanban.reconcile);
  reconcileRef.current = kanban.reconcile;
  const idsKey = useMemo(() => myLeadIds.slice().sort().join("|"), [myLeadIds]);
  useEffect(() => {
    if (!kanban.hydrated || !activeBoard) return;
    reconcileRef.current(myLeadIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, activeBoard?.id, kanban.hydrated]);

  /* ── Search predicate ── */
  const matchesSearch = useCallback((lead: Lead) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return leadSearchText(lead).includes(q);
  }, [query]);

  /* ── Derived column view models (canonical lead data per placement) ── */
  const columnViews = useMemo(() => {
    if (!activeBoard) return [];
    return activeBoard.columns.map((col) => {
      const cards = col.cardIds
        .map((id) => leadById.get(id))
        .filter((l): l is Lead => !!l);
      const visible = cards.filter(matchesSearch);
      const pipeline = cards.reduce((sum, l) => sum + (l.estimate ?? 0), 0);
      return { col, cards, visible, pipeline };
    });
  }, [activeBoard, leadById, matchesSearch]);

  /* Board-level summary (current personal board). */
  const boardSummary = useMemo(() => {
    let total = 0, pipeline = 0, overdue = 0;
    for (const { cards } of columnViews) {
      for (const l of cards) {
        total += 1;
        pipeline += l.estimate ?? 0;
        if (openFollowUpRowState(openFollowUpsByLead.get(l.id)) === "overdue") overdue += 1;
      }
    }
    return { total, pipeline, overdue };
  }, [columnViews, openFollowUpsByLead]);

  /* ── Drag end — PERSONAL placement only. No business-logic change. ── */
  const onDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    // draggableId is the leadId. Map the visible drop index to the real index
    // within the destination column's full cardIds (search may hide some).
    kanban.moveCard(draggableId, destination.droppableId, destination.index);
  }, [kanban]);

  const openLead = useCallback((lead: Lead) => setDetailLead(lead), []);
  const liveDetailLead = detailLead ? leads.find((l) => l.id === detailLead.id) ?? null : null;

  const showStoreCol = isAllShops && stores.length > 1;

  // Whole-board CANVAS theme, driven by the ACTIVE board's color (A+C). Gives
  // the Kanban a unique, board-specific identity while keeping cards readable.
  const theme = kanbanColor(activeBoard?.color);

  /* Quick-action handlers reuse existing channels (tel/mailto/wa.me) only. */
  const callLead = (l: Lead) => { if (l.number) window.open(`tel:${l.number}`); };
  const emailLead = (l: Lead) => { if (l.email) window.open(`mailto:${l.email}`); };
  const waLead = (l: Lead) => { if (l.number) window.open(`https://wa.me/${l.number.replace(/[^0-9]/g, "")}`, "_blank"); };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-5">
      <PageHeader
        className="shrink-0"
        eyebrow="Sales"
        title={activeBoard?.name ?? "Kanban"}
        subtitle="Organize your leads visually across your personal workflow."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeBoard && (
              <>
                <BoardSelector
                  boards={kanban.boards}
                  activeBoard={activeBoard}
                  onSelect={kanban.setActiveBoard}
                  onNewBoard={() => setShowNewBoard(true)}
                />
                <BoardSettingsMenu
                  board={activeBoard}
                  kanban={kanban}
                  onManageColumns={() => setShowManageColumns(true)}
                />
              </>
            )}
            {/* View switch — List / Kanban / Map (matches the list page toolbar). */}
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></span>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><MapIcon className="h-3.5 w-3.5" /></Link>
            </div>
            <Can permission={CAP.lead.create}>
              <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* Utility row — general Store filter + Search (Store → Search order). */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Board summary — subtle, operational (not a duplicate dashboard). */}
        <div className="flex items-center gap-3 text-[12px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><LayoutDashboard className="h-3.5 w-3.5" /> <span className="font-semibold text-zinc-700 tnum">{boardSummary.total}</span> cards</span>
          <span className="text-zinc-300">·</span>
          <span>Pipeline <span className="font-semibold text-zinc-700 tnum">{formatINR(boardSummary.pipeline)}</span></span>
          {boardSummary.overdue > 0 && (
            <>
              <span className="text-zinc-300">·</span>
              <span className="font-semibold text-[#B42318] tnum">{boardSummary.overdue} overdue</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {showStoreCol && (
            <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />
          )}
          <div className="w-full sm:w-72">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search ID, name, number, email, device…"
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>

      {/* Dynamic top filter strip — reflects the CURRENT board's columns, with
          each column's configured color + live count. Clicking focuses that
          column; "All" shows the whole board. */}
      {activeBoard && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setColumnFilter(null)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm transition",
              columnFilter === null ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border bg-card text-zinc-700 hover:border-zinc-300",
            )}
          >
            All
            <span className="tnum text-zinc-400">{boardSummary.total}</span>
          </button>
          {columnViews.map(({ col, cards, pipeline }) => {
            const tone = kanbanColor(col.color);
            const selected = columnFilter === col.id;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => setColumnFilter(selected ? null : col.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm transition",
                  selected ? "border-transparent ring-2 " + tone.ring : "border-border hover:border-zinc-300",
                  selected ? tone.chip : "bg-card text-zinc-700",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
                <span className="max-w-[140px] truncate">{col.name}</span>
                <span className="tnum opacity-60">{cards.length}</span>
                {pipeline > 0 && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="tnum font-semibold">{formatINR(pipeline)}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Kanban board — wrapped in a THEMED CANVAS driven by the active board's
          color, so the whole Kanban has a unique, board-specific identity. */}
      {!activeBoard ? (
        <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
          Loading your board…
        </div>
      ) : (
        <div className={cn("relative mb-1 min-h-0 flex-1 overflow-hidden rounded-2xl border", theme.canvas, theme.edge)}>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full min-h-0 gap-4 overflow-x-auto p-4">
              {columnViews
                .filter(({ col }) => columnFilter === null || col.id === columnFilter)
                .map(({ col, visible }) => (
                  <KanbanColumnView
                    key={col.id}
                    col={col}
                    leads={visible}
                    openFollowUpsByLead={openFollowUpsByLead}
                    getStore={getStore}
                    showStore={showStoreCol}
                    noteColorOf={(leadId) => (activeBoard ? noteColorOf(activeBoard, leadId) : "default")}
                    onChangeNote={(leadId, color) => kanban.setCardNoteColor(leadId, color)}
                    onOpen={openLead}
                    onCall={canCall ? callLead : undefined}
                    onEmail={canCall ? emailLead : undefined}
                    onWhatsApp={canCall ? waLead : undefined}
                    onAddLead={() => setShowCreate(true)}
                    canCreate={allow(can, CAP.lead.create)}
                    searching={!!query.trim()}
                  />
                ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {/* Add Lead — reuses the canonical Lead Form. New lead auto-places via reconcile. */}
      {showCreate && (
        <LeadCaptureFlow open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}

      {/* Board / column management */}
      <NewBoardDrawer open={showNewBoard} onClose={() => setShowNewBoard(false)} onCreate={kanban.createBoard} />
      {activeBoard && (
        <ManageColumnsDrawer
          open={showManageColumns}
          onClose={() => setShowManageColumns(false)}
          board={activeBoard}
          kanban={kanban}
          cardCount={(columnId) => {
            const cv = columnViews.find((c) => c.col.id === columnId);
            return cv ? cv.cards.length : 0;
          }}
        />
      )}

      {/* Canonical Lead Detail — same source of truth as the Lead Table. */}
      <LeadDetailDrawer
        lead={liveDetailLead}
        open={!!liveDetailLead}
        onClose={() => setDetailLead(null)}
        onEdit={(l) => setDetailLead(l)}
        onDelete={() => setDetailLead(null)}
      />
    </div>
  );
}

/* ─── One column (droppable) ─────────────────────────────────────────────── */

function KanbanColumnView({
  col,
  leads,
  openFollowUpsByLead,
  getStore,
  showStore,
  noteColorOf,
  onChangeNote,
  onOpen,
  onCall,
  onEmail,
  onWhatsApp,
  onAddLead,
  canCreate,
  searching,
}: {
  col: KanbanColumn;
  leads: Lead[];
  openFollowUpsByLead: Map<string, any>;
  getStore: (id: string | null | undefined) => any;
  showStore: boolean;
  noteColorOf: (leadId: string) => NoteColor;
  onChangeNote: (leadId: string, color: NoteColor) => void;
  onOpen: (lead: Lead) => void;
  onCall?: (lead: Lead) => void;
  onEmail?: (lead: Lead) => void;
  onWhatsApp?: (lead: Lead) => void;
  onAddLead: () => void;
  canCreate: boolean;
  searching: boolean;
}) {
  const tone = kanbanColor(col.color);
  return (
    <Droppable droppableId={col.id}>
      {(provided, snapshot) => (
        <div
          className={cn(
            "flex h-full w-[286px] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm backdrop-blur-sm transition-colors",
            // Each column carries a light tint of its OWN dedicated color; the
            // white cards inside pop against it. Drag-over = brand blue.
            snapshot.isDraggingOver ? "border-[#4361EE]/40 bg-white/85" : cn(tone.soft, tone.edge),
          )}
        >
          {/* Column accent bar */}
          <div className={cn("h-1 w-full shrink-0", tone.bar)} />
          {/* Column header */}
          <div className="flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />
              <span className="truncate text-[12px] font-semibold text-zinc-800">{col.name}</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-zinc-200/80 px-1 text-[10px] font-bold text-zinc-600">
                {col.cardIds.length}
              </span>
            </div>
          </div>

          {/* Cards */}
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 min-h-0 space-y-2.5 overflow-y-auto px-3 py-3 rox-rail-scroll"
          >
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="grid place-items-center rounded-xl border border-dashed border-zinc-200 py-8 text-center">
                <Inbox className="mb-1.5 h-5 w-5 text-zinc-300" />
                <p className="text-[11px] text-zinc-400">{searching ? "No matching leads" : "No leads in this workflow"}</p>
              </div>
            )}
            {leads.map((lead, ci) => (
              // While a search is active, dragging is disabled so a filtered
              // (partial) view can never accidentally reorder/reassign cards.
              <Draggable key={lead.id} draggableId={lead.id} index={ci} isDragDisabled={searching}>
                {(prov, snap) => (
                  <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                    <LeadKanbanCard
                      lead={lead}
                      openFollowUp={openFollowUpsByLead.get(lead.id)}
                      store={showStore ? getStore(lead.branchId) : null}
                      showStore={showStore}
                      dragging={snap.isDragging}
                      note={noteColorOf(lead.id)}
                      onChangeNote={(c) => onChangeNote(lead.id, c)}
                      onOpen={() => onOpen(lead)}
                      onCall={onCall ? () => onCall(lead) : undefined}
                      onEmail={onEmail ? () => onEmail(lead) : undefined}
                      onWhatsApp={onWhatsApp ? () => onWhatsApp(lead) : undefined}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>

          {/* Add lead */}
          {canCreate && (
            <button
              type="button"
              onClick={onAddLead}
              className="m-3 mt-0 flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-white/50 py-2.5 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-white hover:text-zinc-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add lead
            </button>
          )}
        </div>
      )}
    </Droppable>
  );
}
