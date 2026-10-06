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
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, pointerWithin,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useLeadStoreMode } from "@/lib/lead-store-mode";
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
  const { leads, openFollowUpsByLead, canSeeAllLeads, viewAsReadOnly } = useLeads();
  const { can } = usePermissions();
  const { id: currentUserId } = useSession();
  const { stores, isAllShops, getStore, activeStoreId } = useStoreContext();
  const leadMode = useLeadStoreMode();

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

  /* ── Drag state ──────────────────────────────────────────────────────────
     dnd-kit drives placement. We keep a LIVE copy of each column's visible card
     ids (`liveColumns`) so cards move between columns on-the-fly during a drag;
     the final placement is committed to kanban.moveCard on drop. Collision uses
     `pointerWithin`, so the column/card under the ACTUAL CURSOR is the target —
     no "drag further" offset, correct in both directions. */
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [liveColumns, setLiveColumns] = useState<Record<string, string[]> | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollCleanupRef = useRef<(() => void) | null>(null);

  const sensors = useSensors(
    // A small distance so a click still opens the lead (no accidental drag).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  /* Auto-scroll the board container when the pointer nears the left/right edge
     during a drag — lets you reach far columns without releasing. */
  const startAutoScroll = useCallback((container: HTMLDivElement) => {
    const EDGE = 90;
    const MAX_SPEED = 18;
    let lastX = 0;
    const trackX = (e: MouseEvent | TouchEvent) => {
      lastX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    };
    window.addEventListener("mousemove", trackX, { passive: true });
    window.addEventListener("touchmove", trackX, { passive: true });
    const tick = () => {
      const rect = container.getBoundingClientRect();
      const distFromLeft = lastX - rect.left;
      const distFromRight = rect.right - lastX;
      let delta = 0;
      if (lastX > 0 && distFromLeft < EDGE) delta = -MAX_SPEED * (1 - Math.max(0, distFromLeft) / EDGE);
      else if (lastX > 0 && distFromRight < EDGE) delta = MAX_SPEED * (1 - Math.max(0, distFromRight) / EDGE);
      if (delta !== 0) container.scrollLeft += delta;
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", trackX);
      window.removeEventListener("touchmove", trackX);
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    };
  }, []);

  // Which column currently holds a given lead id, within the live snapshot.
  const findColumnOf = useCallback((cols: Record<string, string[]>, leadId: string): string | null => {
    for (const [colId, ids] of Object.entries(cols)) if (ids.includes(leadId)) return colId;
    return null;
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveLeadId(id);
    // Seed the live snapshot from the current visible column views.
    const snapshot: Record<string, string[]> = {};
    for (const { col, visible } of columnViews) snapshot[col.id] = visible.map((l) => l.id);
    setLiveColumns(snapshot);
    if (boardScrollRef.current) autoScrollCleanupRef.current = startAutoScroll(boardScrollRef.current);
  }, [columnViews, startAutoScroll]);

  // While dragging, move the card between columns live so the user sees it land
  // under the cursor immediately (and so empty columns accept it).
  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setLiveColumns((prev) => {
      if (!prev) return prev;
      const fromCol = findColumnOf(prev, activeId);
      if (!fromCol) return prev;
      // `over` is either a column droppable (id = columnId) or a card (id = leadId).
      const toCol = prev[overId] !== undefined ? overId : findColumnOf(prev, overId);
      if (!toCol) return prev;
      if (fromCol === toCol) return prev; // same-column reorder handled on dragEnd

      const next: Record<string, string[]> = { ...prev };
      next[fromCol] = next[fromCol].filter((x) => x !== activeId);
      const toArr = [...next[toCol]];
      // Insert at the position of the card we're hovering (or end if over column).
      const overIdx = toArr.indexOf(overId);
      const insertAt = overIdx >= 0 ? overIdx : toArr.length;
      toArr.splice(insertAt, 0, activeId);
      next[toCol] = toArr;
      return next;
    });
  }, [findColumnOf]);

  /* ── Drag end — commit placement. PERSONAL only, no business change. ── */
  const handleDragEnd = useCallback((e: DragEndEvent) => {
    if (autoScrollCleanupRef.current) { autoScrollCleanupRef.current(); autoScrollCleanupRef.current = null; }
    const { active, over } = e;
    setActiveLeadId(null);

    // Owner "view as agent" read-only lens: never commit a placement change.
    if (viewAsReadOnly) { setLiveColumns(null); return; }

    setLiveColumns((prev) => {
      if (!prev || !over) return null;
      const activeId = String(active.id);
      const overId = String(over.id);
      const fromCol = findColumnOf(prev, activeId);
      const toCol = prev[overId] !== undefined ? overId : findColumnOf(prev, overId);
      if (!fromCol || !toCol) return null;

      let targetArr = prev[toCol];
      // Same-column reorder: move within the array to the hovered card's slot.
      if (fromCol === toCol) {
        const oldIdx = targetArr.indexOf(activeId);
        const overIdx = overId === toCol ? targetArr.length - 1 : targetArr.indexOf(overId);
        if (oldIdx !== overIdx && overIdx >= 0) targetArr = arrayMove(targetArr, oldIdx, overIdx);
      }
      const finalIndex = Math.max(0, targetArr.indexOf(activeId));
      // Commit to the persistent personal board.
      kanban.moveCard(activeId, toCol, finalIndex);
      return null; // drop the live snapshot; derived columnViews take over
    });
  }, [findColumnOf, kanban, viewAsReadOnly]);

  const handleDragCancel = useCallback(() => {
    if (autoScrollCleanupRef.current) { autoScrollCleanupRef.current(); autoScrollCleanupRef.current = null; }
    setActiveLeadId(null);
    setLiveColumns(null);
  }, []);

  const activeLead = activeLeadId ? leadById.get(activeLeadId) ?? null : null;

  const openLead = useCallback((lead: Lead) => setDetailLead(lead), []);
  const liveDetailLead = detailLead ? leads.find((l) => l.id === detailLead.id) ?? null : null;

  // Store filter is only meaningful in Multi-Store Lead mode.
  const showStoreCol = isAllShops && stores.length > 1 && leadMode.isMulti;

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
                {!viewAsReadOnly && (
                  <BoardSettingsMenu
                    board={activeBoard}
                    kanban={kanban}
                    onManageColumns={() => setShowManageColumns(true)}
                  />
                )}
              </>
            )}
            {/* View switch — List / Kanban / Map (matches the list page toolbar). */}
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></span>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><MapIcon className="h-3.5 w-3.5" /></Link>
            </div>
            {!viewAsReadOnly && (
              <Can permission={CAP.lead.create}>
                <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Lead
                </Button>
              </Can>
            )}
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

      {/* Kanban board — THEMED CANVAS driven by the active board's color.
          @dnd-kit DndContext with pointerWithin collision: the column/card under
          the ACTUAL CURSOR is the drop target — correct in both directions, no
          "drag further" offset. DragOverlay renders the cursor-following ghost. */}
      {!activeBoard ? (
        <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
          Loading your board…
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className={cn("relative mb-1 min-h-0 flex-1 rounded-2xl border", theme.canvas, theme.edge)}
            ref={boardScrollRef}
            style={{ overflowX: "auto", overflowY: "hidden" }}
          >
            <div className="flex h-full min-h-0 gap-4 p-4" style={{ minWidth: "max-content" }}>
              {columnViews
                .filter(({ col }) => columnFilter === null || col.id === columnFilter)
                .map(({ col, visible }) => {
                  // During a drag, use the LIVE snapshot so cards appear in the
                  // column they're currently hovering; otherwise the derived view.
                  const ids = liveColumns ? (liveColumns[col.id] ?? []) : visible.map((l) => l.id);
                  const colLeads = ids.map((id) => leadById.get(id)).filter((l): l is Lead => !!l);
                  return (
                    <KanbanColumnView
                      key={col.id}
                      col={col}
                      leads={colLeads}
                      activeLeadId={activeLeadId}
                      openFollowUpsByLead={openFollowUpsByLead}
                      getStore={getStore}
                      showStore={showStoreCol}
                      noteColorOf={(leadId) => (activeBoard ? noteColorOf(activeBoard, leadId) : "default")}
                      onChangeNote={viewAsReadOnly ? undefined : (leadId, color) => kanban.setCardNoteColor(leadId, color)}
                      onOpen={openLead}
                      onCall={canCall ? callLead : undefined}
                      onEmail={canCall ? emailLead : undefined}
                      onWhatsApp={canCall ? waLead : undefined}
                      onAddLead={() => setShowCreate(true)}
                      canCreate={allow(can, CAP.lead.create) && !viewAsReadOnly}
                      searching={!!query.trim()}
                    />
                  );
                })}
            </div>
          </div>

          {/* Ghost — follows the cursor, never affects collision detection. */}
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
            {activeLead ? (
              <div
                style={{
                  width: 286,
                  transform: "rotate(3deg)",
                  filter: "drop-shadow(0 12px 30px rgba(67,97,238,0.28)) drop-shadow(0 3px 10px rgba(0,0,0,0.16))",
                  cursor: "grabbing",
                }}
              >
                <LeadKanbanCard
                  lead={activeLead}
                  openFollowUp={openFollowUpsByLead.get(activeLead.id)}
                  store={showStoreCol ? getStore(activeLead.branchId) : null}
                  showStore={showStoreCol}
                  dragging
                  note={activeBoard ? noteColorOf(activeBoard, activeLead.id) : "default"}
                  onOpen={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
        readOnly={viewAsReadOnly}
      />
    </div>
  );
}

/* ─── One sortable card ──────────────────────────────────────────────────── */

function SortableCard({
  lead,
  isActive,
  searching,
  openFollowUp,
  store,
  showStore,
  note,
  onChangeNote,
  onOpen,
  onCall,
  onEmail,
  onWhatsApp,
  readOnly,
}: {
  lead: Lead;
  isActive: boolean;
  searching: boolean;
  openFollowUp: any;
  store: any;
  showStore: boolean;
  note: NoteColor;
  onChangeNote?: (color: NoteColor) => void;
  onOpen: () => void;
  onCall?: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
  readOnly?: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: lead.id,
    // Dragging is disabled while searching (a partial view) AND under the
    // owner read-only "view as agent" lens (never reorder an agent's board).
    disabled: searching || !!readOnly,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // While THIS card is the one being dragged, its original slot shows a dashed
  // indigo placeholder (the real card follows the cursor in the DragOverlay).
  if (isActive) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <div
          aria-hidden
          className="rounded-xl border-2 border-dashed border-[#4361EE]/35 bg-[#EEF1FD]/40"
          style={{ minHeight: 80 }}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      <LeadKanbanCard
        lead={lead}
        openFollowUp={openFollowUp}
        store={store}
        showStore={showStore}
        note={note}
        onChangeNote={onChangeNote}
        onOpen={onOpen}
        onCall={onCall}
        onEmail={onEmail}
        onWhatsApp={onWhatsApp}
      />
    </div>
  );
}

/* ─── One column (droppable + sortable context) ──────────────────────────── */

function KanbanColumnView({
  col,
  leads,
  activeLeadId,
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
  activeLeadId: string | null;
  openFollowUpsByLead: Map<string, any>;
  getStore: (id: string | null | undefined) => any;
  showStore: boolean;
  noteColorOf: (leadId: string) => NoteColor;
  onChangeNote?: (leadId: string, color: NoteColor) => void;
  onOpen: (lead: Lead) => void;
  onCall?: (lead: Lead) => void;
  onEmail?: (lead: Lead) => void;
  onWhatsApp?: (lead: Lead) => void;
  onAddLead: () => void;
  canCreate: boolean;
  searching: boolean;
}) {
  // No note-color handler ⇒ owner read-only lens ⇒ dragging is disabled too.
  const readOnly = !onChangeNote;
  const tone = kanbanColor(col.color);
  // The whole column body is a droppable (so cards can be dropped into empty
  // columns too). id = the column id; cards are the sortable items.
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const itemIds = leads.map((l) => l.id);

  return (
    <div
      className={cn(
        "flex h-full w-[286px] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm backdrop-blur-sm transition-colors",
        isOver ? "border-[#4361EE]/50 bg-white/85" : cn(tone.soft, tone.edge),
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

      {/* Cards — droppable area + sortable context */}
      <div
        ref={setNodeRef}
        className="flex-1 min-h-0 space-y-2.5 overflow-y-auto px-3 py-3 rox-rail-scroll"
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {leads.length === 0 && (
            <div className={cn(
              "grid place-items-center rounded-xl border border-dashed py-8 text-center transition-colors",
              isOver ? "border-[#4361EE]/40 bg-[#EEF1FD]/30" : "border-zinc-200",
            )}>
              <Inbox className="mb-1.5 h-5 w-5 text-zinc-300" />
              <p className="text-[11px] text-zinc-400">{searching ? "No matching leads" : "No leads in this workflow"}</p>
            </div>
          )}
          {leads.map((lead) => (
            <SortableCard
              key={lead.id}
              lead={lead}
              isActive={activeLeadId === lead.id}
              searching={searching}
              openFollowUp={openFollowUpsByLead.get(lead.id)}
              store={showStore ? getStore(lead.branchId) : null}
              showStore={showStore}
              note={noteColorOf(lead.id)}
              readOnly={readOnly}
              onChangeNote={onChangeNote ? (c) => onChangeNote(lead.id, c) : undefined}
              onOpen={() => onOpen(lead)}
              onCall={onCall ? () => onCall(lead) : undefined}
              onEmail={onEmail ? () => onEmail(lead) : undefined}
              onWhatsApp={onWhatsApp ? () => onWhatsApp(lead) : undefined}
            />
          ))}
        </SortableContext>
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
  );
}
