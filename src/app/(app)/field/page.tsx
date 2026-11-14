"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Management → Pickup & Drop workspace.

   Built on the SAME data-grid stack as the Lead Table: shared hooks
   (useColumnOrder / useFrozenColumns via useGridLayout), Customize + Freeze
   menus, WorkspaceCollapseBar + useWorkspaceCollapsed, bounded dual-axis scroll
   container with a sticky header and frozen Trip ID / View anchors, detached
   <Pagination>. Preferences are keyed "field_table" — never "lead_table".

   Business logic is Field-specific and the EXISTING status engine is kept:
   Status = FieldJobStatus (guarded transitions); Action of Trip is derived,
   read-only (lib/field-table.ts). Trips are created from Lead routing or the
   New Field Assignment form.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Truck, Search, Filter, MapPin, Clock, AlertTriangle, CheckCircle2, Package, PackageCheck,
  RotateCcw, Plus, TrendingUp, Download, ChevronDown, FileSpreadsheet, FileText, LayoutDashboard,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";
import { RoxFilterPanelHeader, ActiveFilterChip } from "@/components/ui/rox-filter";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { WorkspaceCollapseBar } from "@/components/common/workspace-collapse-bar";
import { CustomizeColumnsMenu } from "@/components/common/customize-columns-menu";
import { FreezeColumnsMenu } from "@/components/common/freeze-columns-menu";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { CAP, allow } from "@/lib/capabilities";
import { useField, FIELD_OPEN_EVENT } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext, type StoreBranch } from "@/lib/store-context";
import { useWorkspaceCollapsed } from "@/hooks/use-workspace-collapsed";
import { useGridLayout, mergeFrozen } from "@/hooks/use-grid-layout";
import { FieldAssignmentForm } from "@/components/field/field-assignment-form";
import { FieldGroupKpis, type GroupKpi } from "@/components/field/field-group-kpis";
import { STRIP } from "@/components/field/field-table-parts";
import { fieldGridColumns, renderFieldCell, FIELD_LEFT_COLS, FIELD_STOP_COLS } from "@/components/field/field-grid-cells";
import { staffByRole } from "@/lib/field-linking";
import { isWalkInInDateRange } from "@/lib/walk-in-data";
import {
  jobMatchesQueue, isDelayed, isPickupLeg, isDropLeg, normaliseLeadType, classifySource,
  FIELD_STATUS_LABEL, FIELD_LEAD_TYPES, FIELD_SOURCE_LABEL, FIELD_DATE_RANGES,
  type FieldQueue, type FieldJob, type FieldJobStatus, type FieldDateRange, type FieldSource,
} from "@/lib/field-data";
import { resolveFieldRow, formatInvoiceAmount, type FieldResolveSources } from "@/lib/field-resolve";
import { fieldTripAction, matchesFieldSearch, latestTripComment, tripValue, TRIP_ACTION_LABELS } from "@/lib/field-table";
import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";
import { tripDevicesOf } from "@/lib/field-devices";
import { tripGroupOf, TRIP_GROUP_LABEL, type TripGroup } from "@/lib/field-dashboard";
import { ATTENTION_DEFS, attentionMatches } from "@/lib/field-overview";

const PAGE_SIZES = [10, 20, 50, 100];
/* Extra left breathing room for specific columns (header + cells together). */
const COL_PAD: Record<string, string> = { contact: "pl-[86px]" };
/* Whole-column nudge in px (header + cells together, width unchanged). */
const COL_SHIFT_X: Record<string, number | undefined> = { action: 20, assignBy: 15 };
const shifted = (key: string, p: { className: string; style?: React.CSSProperties }) =>
  COL_SHIFT_X[key] ? { ...p, style: { ...p.style, transform: `translateX(${COL_SHIFT_X[key]}px)` } } : p;

export default function FieldPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, role, team, currentUser } = usePermissions();
  const { id: currentUserId } = useSession();
  const { jobs, events, hydrated, filters, setFilters, clearFilters, getJob, transition } = useField();
  const { tickets, invoices, customers } = useStore();
  const { isAllShops, stores } = useStoreContext();
  const multiStore = isAllShops && stores.length > 1;

  const storeForJob = useCallback((j: FieldJob): StoreBranch | null => {
    if (j.branchId) { const m = stores.find((s) => s.id === j.branchId); if (m) return m; }
    const name = j.branch?.trim();
    if (!name) return null;
    return stores.find((s) => s.name === name)
      ?? { id: name, organizationId: null, name, code: null, address: null, isActive: true, environment: "live" };
  }, [stores]);
  const branchIdOf = useCallback((j: FieldJob) => j.branchId || stores.find((s) => s.name === j.branch)?.id || "", [stores]);

  const resolveSrc: FieldResolveSources = useMemo(() => ({ tickets, invoices, customers }), [tickets, invoices, customers]);

  const [queue, setQueue] = useState<FieldQueue>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<FieldDateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  // Dashboard drill-down filters (same predicates as lib/field-dashboard.ts).
  const [groupFilter, setGroupFilter] = useState<TripGroup | "">("");
  const [hideCancelled, setHideCancelled] = useState(false);
  // Drill-down from dashboards: sales agent (lead owner) / lead source — distinct from the Field Engineer.
  const [salesFilter, setSalesFilter] = useState("");
  const [srcFilter, setSrcFilter] = useState("");
  // "Needs attention" drill-down (same predicate that produced the overview count).
  const [attn, setAttn] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isNinja = role?.id === "ninja";
  const canEditStatus = allow(can, CAP.field.updateStatus);
  const canViewLocation = allow(can, CAP.field.viewLocation);

  /* ── Grid: shared layout hook (order / freeze / display / offsets / height) ── */
  const workspace = useWorkspaceCollapsed("field_table", currentUser?.id);
  const controlsCollapsed = workspace.collapsed;
  // Entering Pickup & Drop starts in work mode (filters collapsed). Once per entry;
  // the user can still expand and it stays expanded while they're on the page.
  const autoCollapsed = useRef(false);
  useEffect(() => {
    if (currentUser?.id && workspace.hydrated && !autoCollapsed.current) { autoCollapsed.current = true; workspace.setCollapsed(true); }
  }, [workspace.hydrated, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseColumns = useMemo(() => fieldGridColumns(multiStore), [multiStore]);
  const grid = useGridLayout({
    tableKey: "field_table", userId: currentUser?.id, columns: baseColumns,
    remeasureOn: [hydrated, controlsCollapsed, showFilters],
  });

  /* Role scoping: a Ninja only sees trips assigned to them. */
  const scopedJobs = useMemo(
    () => (isNinja && currentUserId ? jobs.filter((j) => j.ninjaId === currentUserId || j.dropNinjaId === currentUserId) : jobs),
    [jobs, isNinja, currentUserId],
  );

  const matchesFilters = useMemo(() => (j: FieldJob): boolean => {
    if (filters.query) {
      const r = resolveFieldRow(j, resolveSrc);
      if (!matchesFieldSearch(filters.query, j, r, { storeName: storeForJob(j)?.name })) return false;
    }
    if (filters.status && j.status !== filters.status) return false;
    if (!matchesStoreSelection(branchIdOf(j), storeFilter)) return false;
    if (filters.ninjaId && j.ninjaId !== filters.ninjaId && j.dropNinjaId !== filters.ninjaId) return false;
    if (filters.fieldManagerId && j.fieldManagerId !== filters.fieldManagerId) return false;
    if (filters.leg === "pickup" && !isPickupLeg(j.status)) return false;
    if (filters.leg === "drop" && !isDropLeg(j.status)) return false;
    if (filters.delayed && !isDelayed(j)) return false;
    if (filters.hasTicket === "yes" && !j.linkedTicketId) return false;
    if (filters.hasTicket === "no" && j.linkedTicketId) return false;
    if (filters.leadType && normaliseLeadType(j.leadType) !== filters.leadType) return false;
    if (filters.source && classifySource(j.source) !== filters.source) return false;
    if (actionFilter && fieldTripAction(j).label !== actionFilter) return false;
    if (groupFilter && tripGroupOf(j) !== groupFilter) return false;
    if (hideCancelled && j.status === "cancelled") return false;
    if (salesFilter && (j.salesPersonId || `n:${(j.salesPersonName || "").toLowerCase()}`) !== salesFilter && !(salesFilter === "none" && !j.salesPersonId && !j.salesPersonName)) return false;
    if (srcFilter && ((j.source || "").trim().toLowerCase() || "unknown") !== srcFilter) return false;
    if (attn && !attentionMatches(attn, j)) return false;
    const refDate = j.pickupDate || j.dropDate || j.createdAt.slice(0, 10);
    if (!isWalkInInDateRange(refDate, dateRange as any, customFrom, customTo)) return false;
    return true;
  }, [filters, dateRange, customFrom, customTo, resolveSrc, storeFilter, actionFilter, groupFilter, hideCancelled, salesFilter, srcFilter, attn, storeForJob, branchIdOf]);

  const filteredBase = useMemo(() => scopedJobs.filter(matchesFilters), [scopedJobs, matchesFilters]);
  const filtered = useMemo(() => {
    const now = new Date();
    return filteredBase.filter((j) => jobMatchesQueue(j, queue, now));
  }, [filteredBase, queue]);

  useEffect(() => { setPage(1); }, [queue, filters, pageSize, dateRange, customFrom, customTo, storeFilter, actionFilter, groupFilter, hideCancelled, salesFilter, srcFilter, attn]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);

  /* Counts come from the SAME queue matchers the table uses, so a card's number
     always equals the rows you get when you click it. Combined cards count
     DISTINCT trips (a trip that is both unassigned and delayed counts once). */
  const kq = useMemo(() => {
    const now = new Date();
    const n = (q: FieldQueue) => scopedJobs.filter((j) => jobMatchesQueue(j, q, now)).length;
    const total = scopedJobs.filter((j) => j.status !== "cancelled").length;
    return {
      total,
      visits: n("today_visits"), pickups: n("today_pickup"), drops: n("today_drop"),
      needs: n("needs_action"), pending: n("pending_assignment"), delayed: n("delayed"),
      inStore: n("in_store"), atStore: n("at_store"), ready: n("ready_for_drop"),
      completed: n("completed"),
    };
  }, [scopedJobs]);

  const pick = (q: FieldQueue) => () => setQueue((cur) => (cur === q ? "all" : q));
  const groupKpis: GroupKpi[] = [
    {
      key: "today", label: "Today", icon: Truck, tone: "sky", primary: kq.visits, description: "Visits scheduled today",
      progress: kq.total ? kq.visits / kq.total : 0, active: queue === "today_visits", onClick: pick("today_visits"),
      support: [
        { label: "Today's Pickups", value: kq.pickups, onClick: pick("today_pickup"), active: queue === "today_pickup" },
        { label: "Today's Drops", value: kq.drops, onClick: pick("today_drop"), active: queue === "today_drop" },
      ],
    },
    {
      key: "needs", label: "Needs action", icon: AlertTriangle, tone: "rose", primary: kq.needs, description: "Unassigned or delayed trips",
      urgent: kq.delayed > 0, progress: kq.needs ? kq.delayed / kq.needs : 0, progressAlert: kq.delayed > 0,
      active: queue === "needs_action", onClick: pick("needs_action"),
      support: [
        { label: "Pending Assignment", value: kq.pending, onClick: pick("pending_assignment"), active: queue === "pending_assignment" },
        { label: "Delayed", value: kq.delayed, onClick: pick("delayed"), active: queue === "delayed", alert: kq.delayed > 0 },
      ],
    },
    {
      key: "store", label: "In store", icon: Package, tone: "amber", primary: kq.inStore, description: "Devices at the store",
      progress: kq.total ? kq.inStore / kq.total : 0, active: queue === "in_store", onClick: pick("in_store"),
      support: [
        { label: "At Store", value: kq.atStore, onClick: pick("at_store"), active: queue === "at_store" },
        { label: "Ready for Drop", value: kq.ready, onClick: pick("ready_for_drop"), active: queue === "ready_for_drop" },
      ],
    },
    {
      key: "done", label: "Completed", icon: CheckCircle2, tone: "emerald", primary: kq.completed, description: "Trips completed",
      progress: kq.total ? kq.completed / kq.total : 0, active: queue === "completed", onClick: pick("completed"),
      support: [
        { label: "All trips", value: kq.total, onClick: () => setQueue("all"), active: queue === "all" },
        { label: "Completion rate", value: kq.total ? `${Math.round((kq.completed / kq.total) * 100)}%` : "—" },
      ],
    },
  ];

  const stripCount = useMemo(() => {
    const now = new Date();
    const map: Record<string, number> = {};
    for (const s of STRIP) map[s.value] = filteredBase.filter((j) => jobMatchesQueue(j, s.value, now)).length;
    return map;
  }, [filteredBase]);

  /* Old deep links (/field?job=<id>, e.g. stored notifications) → the full page. */
  useEffect(() => {
    const id = searchParams.get("job");
    if (id) router.replace(`/field/${id}`);
  }, [searchParams, router]);
  /* Header search "View all" while already on this page: apply the new query. */
  const qParam = searchParams.get("q");
  useEffect(() => { if (qParam) setFilters((f) => (f.query === qParam ? f : { ...f, query: qParam })); }, [qParam]);
  /* Drill-down from the Field dashboards: /field?store=&fe=&group=&range=custom&from=&to=&excl=cancelled */
  useEffect(() => {
    const qText = searchParams.get("q");
    const sales = searchParams.get("sales"), src = searchParams.get("src");
    const store = searchParams.get("store"), fe = searchParams.get("fe"), group = searchParams.get("group");
    const from = searchParams.get("from"), to = searchParams.get("to");
    const q = searchParams.get("queue"), a = searchParams.get("attn");
    if (searchParams.get("new") === "1") setFormOpen(true);
    if (q && STRIP.some((x) => x.value === q)) setQueue(q as FieldQueue);
    if (a && ATTENTION_DEFS.some((d) => d.key === a)) setAttn(a);
    if (!qText && !store && !fe && !sales && !src && !group && !from && !to && !searchParams.get("excl")) return;
    if (store) setStoreFilter([store]);
    if (fe) setFilters((f) => ({ ...f, ninjaId: fe }));
    if (qText) setFilters((f) => ({ ...f, query: qText }));
    if (sales) setSalesFilter(sales);
    if (src) setSrcFilter(src);
    if (group === "onsite" || group === "pickup" || group === "drop") setGroupFilter(group);
    if (from || to) { setCustomFrom(from ?? ""); setCustomTo(to ?? ""); setDateRange("custom"); }
    if (searchParams.get("excl") === "cancelled") setHideCancelled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* View Assignment is a dedicated full page (same as View Lead) — never a drawer. */
  const openTrip = useCallback((j: FieldJob) => router.push(`/field/${j.id}`), [router]);
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) router.push(`/field/${id}`);
    };
    window.addEventListener(FIELD_OPEN_EVENT, handler);
    return () => window.removeEventListener(FIELD_OPEN_EVENT, handler);
  }, [router]);

  const managers = useMemo(() => staffByRole(team, ["field_manager", "shop_owner_branch_manager"]), [team]);
  const engineers = useMemo(() => {
    const base = staffByRole(team, ["ninja", "field_manager", "technician", "senior_technician"]);
    const known = new Set(base.map((b) => b.id));
    const extra = jobs.filter((j) => j.ninjaId && !known.has(j.ninjaId)).map((j) => ({ id: j.ninjaId, name: j.ninjaName || "Former engineer" }));
    const seen = new Set<string>();
    return [...base.map((b) => ({ id: b.id, name: b.name })), ...extra].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  }, [team, jobs]);

  /* ── Applied filters (each individually removable — Design System §3g) ── */
  const chips: { label: string; value: string; onClear: () => void }[] = [];
  if (queue !== "all") chips.push({ label: "View", value: STRIP.find((s) => s.value === queue)?.label ?? queue, onClear: () => setQueue("all") });
  if (filters.status) chips.push({ label: "Status", value: FIELD_STATUS_LABEL[filters.status as FieldJobStatus], onClear: () => setFilters((f) => ({ ...f, status: "" })) });
  if (filters.leadType) chips.push({ label: "Type", value: FIELD_LEAD_TYPES.find((t) => t.value === filters.leadType)?.label ?? filters.leadType, onClear: () => setFilters((f) => ({ ...f, leadType: "" as any })) });
  if (attn) chips.push({ label: "Needs attention", value: ATTENTION_DEFS.find((d) => d.key === attn)?.label ?? attn, onClear: () => setAttn("") });
  if (groupFilter) chips.push({ label: "Trip group", value: TRIP_GROUP_LABEL[groupFilter], onClear: () => setGroupFilter("") });
  if (salesFilter) chips.push({ label: "Sales agent", value: jobs.find((j) => j.salesPersonId === salesFilter)?.salesPersonName || (salesFilter === "none" ? "None" : "Sales agent"), onClear: () => setSalesFilter("") });
  if (srcFilter) chips.push({ label: "Source", value: srcFilter, onClear: () => setSrcFilter("") });
  if (hideCancelled) chips.push({ label: "Cancelled", value: "excluded", onClear: () => setHideCancelled(false) });
  if (actionFilter) chips.push({ label: "Action", value: actionFilter, onClear: () => setActionFilter("") });
  if (filters.ninjaId) chips.push({ label: "Ninja", value: engineers.find((e) => e.id === filters.ninjaId)?.name ?? "Ninja", onClear: () => setFilters((f) => ({ ...f, ninjaId: "" })) });
  if (filters.source) chips.push({ label: "Source", value: FIELD_SOURCE_LABEL[filters.source as FieldSource], onClear: () => setFilters((f) => ({ ...f, source: "" as any })) });
  if (filters.fieldManagerId) chips.push({ label: "Field Manager", value: managers.find((m) => m.id === filters.fieldManagerId)?.name ?? "Manager", onClear: () => setFilters((f) => ({ ...f, fieldManagerId: "" })) });
  if (filters.leg) chips.push({ label: "Leg", value: filters.leg === "pickup" ? "Pickup" : "Drop", onClear: () => setFilters((f) => ({ ...f, leg: "" as any })) });
  if (filters.hasTicket) chips.push({ label: "Ticket", value: filters.hasTicket === "yes" ? "Has ticket" : "No ticket", onClear: () => setFilters((f) => ({ ...f, hasTicket: "" as any })) });
  if (filters.delayed) chips.push({ label: "Delayed", value: "only", onClear: () => setFilters((f) => ({ ...f, delayed: false })) });
  if (storeFilter.length > 0) chips.push({ label: "Stores", value: `${storeFilter.length} selected`, onClear: () => setStoreFilter([]) });
  if (dateRange !== "all") chips.push({ label: "Date", value: FIELD_DATE_RANGES.find((d) => d.value === dateRange)?.label ?? dateRange, onClear: () => setDateRange("all") });

  const resetAll = () => { clearFilters(); setQueue("all"); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setStoreFilter([]); setActionFilter(""); setGroupFilter(""); setHideCancelled(false); setAttn(""); };

  /* ── Selection (select-all spans the filtered set) ── */
  const filteredIds = useMemo(() => filtered.map((j) => j.id), [filtered]);
  const selectedInView = filteredIds.filter((id) => selected.has(id));
  const allSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
  const someSelected = selectedInView.length > 0;
  const toggleAll = () => setSelected((p) => { const n = new Set(p); if (allSelected) filteredIds.forEach((i) => n.delete(i)); else filteredIds.forEach((i) => n.add(i)); return n; });
  const toggleOne = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Export (Excel primary + CSV; ONE row-builder) ── */
  const exportRows = useCallback((list: FieldJob[]) => {
    const headers = ["Trip ID", "Lead ID", "Scheduled Date", "Time", "Source", "Assign By", "Type of Trip", "Action of Trip", "Customer", "Mobile", "Email", "Device", "Issue", "IMEI/Serial", "Address", "PIN", "Maps Link", "Ninja", "Latest Comment", "Store", "Ticket", "Invoice", "Status", "Finalized Invoice Value"];
    const rows = list.map((j) => {
      const r = resolveFieldRow(j, resolveSrc);
      const v = tripValue(r);
      return [
        j.jobNo, j.leadNo, j.pickupDate || j.dropDate, j.pickupTime || j.dropTime, j.source, j.createdByName || j.salesPersonName,
        FIELD_LEAD_TYPES.find((t) => t.value === normaliseLeadType(j.leadType))?.label ?? "", fieldTripAction(j).label,
        r.customerName, r.contact, r.email,
        tripDevicesOf(j).map((x) => x.label).filter(Boolean).join(" | ") || r.model,
        tripDevicesOf(j).map((x) => x.issue).filter(Boolean).join(" | ") || j.issue,
        tripDevicesOf(j).map((x) => x.imei).filter(Boolean).join(" | ") || (j.imei ?? ""), canViewLocation ? j.pickupAddress : "", canViewLocation ? j.pincode ?? "" : "",
        canViewLocation ? j.locationMapsUrl ?? "" : "", j.ninjaName, latestTripComment(j, events), storeForJob(j)?.name ?? j.branch,
        r.ticketNo, r.invoiceId, FIELD_STATUS_LABEL[j.status], v.finalized ?? "",
      ] as (string | number | undefined)[];
    });
    return { headers, rows };
  }, [resolveSrc, events, storeForJob, canViewLocation]);
  const exportList = someSelected ? filtered.filter((j) => selected.has(j.id)) : filtered;
  const doExcel = () => { const { headers, rows } = exportRows(exportList); void downloadXLSX("pickup-drop-trips.xlsx", headers, rows, "Trips"); };
  const doCsv = () => { const { headers, rows } = exportRows(exportList); downloadCSV("pickup-drop-trips.csv", toCSV(headers, rows)); };

  // Date + Store are visible controls in the toolbar; everything else lives in the Filters panel.
  const panelChips = chips.filter((c) => c.label !== "Date" && c.label !== "Stores");
  const filterCount = panelChips.length;
  const collapsedIndicators = (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <span className="rounded-full border border-border bg-card px-2.5 py-1 font-semibold">Filters · {filterCount}</span>
      <span className="rounded-full border border-border bg-card px-2.5 py-1 font-semibold">{FIELD_DATE_RANGES.find((d) => d.value === dateRange)?.label ?? "All"}</span>
    </div>
  );

  return (
    <div className="space-y-5 rox-lock-root">
      <PageHeader
        eyebrow="Field Management · Logistics"
        title="Pickup & Drop"
        subtitle="Pickup & drop operations — from the customer's door to the workbench and back."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={showFilters || filterCount ? "soft" : "outline"} size="sm" className="gap-1.5" aria-expanded={showFilters}
              onClick={() => { if (controlsCollapsed) { workspace.setCollapsed(false); setShowFilters(true); } else setShowFilters((v) => !v); }}>
              <Filter className="h-3.5 w-3.5" /> Filters
              {filterCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">{filterCount}</span>}
            </Button>
            <Can permission={CAP.field.dashboard}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/field/dashboard")}>
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboards
              </Button>
            </Can>
            <Can permission={CAP.field.reports}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/field/reports")}>
                <TrendingUp className="h-3.5 w-3.5" /> Reports
              </Button>
            </Can>
            <Dropdown width="w-52" trigger={({ toggle }) => (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
                <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}>
              {(close) => (
                <>
                  <MenuItem icon={FileSpreadsheet} onClick={() => { doExcel(); close(); }}>Excel (.xlsx)</MenuItem>
                  <MenuItem icon={FileText} onClick={() => { doCsv(); close(); }}>CSV (.csv)</MenuItem>
                </>
              )}
            </Dropdown>
            <Can permission={CAP.field.create}>
              <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Field Assignment
              </Button>
            </Can>
          </div>
        }
      />

      {/* ── COLLAPSIBLE CONTROL AREA (single mechanism; children stay mounted
          so every filter/search/column selection survives a collapse) ── */}
      <AnimatePresence initial={false}>
        {!controlsCollapsed && (
          <motion.div key="field-controls" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="space-y-4 overflow-hidden">
            <div className="pt-0.5"><FieldGroupKpis items={groupKpis} /></div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 lg:flex-nowrap">
              <div className="max-w-full shrink-0 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <SegmentedTabs value={dateRange} onChange={(v) => setDateRange(v as FieldDateRange)}
                  options={FIELD_DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))} size="sm" />
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-1 lg:flex-nowrap">
                <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />
                <div className="w-full min-w-[140px] sm:w-56 lg:w-auto lg:max-w-[320px] lg:flex-1">
                  <Input value={filters.query} onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
                    placeholder="Search trips by ID, lead, customer, phone, device, IMEI, ticket or engineer…"
                    animatedPrefix="Search by " animatedWords={["trip ID", "lead ID", "customer", "phone", "device", "IMEI", "ticket", "engineer"]}
                    iconLeft={<Search className="h-4 w-4" />} />
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <CustomizeColumnsMenu columns={grid.orderedColumns} state={grid.columnOrder} />
                  <FreezeColumnsMenu columns={grid.orderedColumns} state={grid.frozen} independent />
                </div>
                <WorkspaceCollapseBar collapsed={false} onToggle={workspace.toggle} />
              </div>
            </div>

            <DateRangePicker open={dateRange === "custom"} from={customFrom} to={customTo}
              onFromChange={(v) => { setCustomFrom(v); setDateRange("custom"); }}
              onToChange={(v) => { setCustomTo(v); setDateRange("custom"); }} />

            {showFilters && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <RoxFilterPanelHeader title="Filters" onClose={() => setShowFilters(false)} onReset={resetAll} resetLabel="Reset all" showReset={chips.length > 0 || !!filters.query} />
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
                  <FilterGroup title="Progress">
                    <FilterField label="View">
                      <RSelect value={queue} onChange={(v) => setQueue(v as FieldQueue)} menuWidth="w-60"
                        options={STRIP.map((s2) => ({ label: `${s2.label} (${stripCount[s2.value] ?? 0})`, value: s2.value }))} />
                    </FilterField>
                    <FilterField label="Status">
                      <RSelect value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v as FieldJobStatus | "" }))} searchable menuWidth="w-56"
                        options={[{ label: "All statuses", value: "" }, ...(Object.keys(FIELD_STATUS_LABEL) as FieldJobStatus[]).map((s2) => ({ label: FIELD_STATUS_LABEL[s2], value: s2 }))]} />
                    </FilterField>
                    <FilterField label="Action of trip">
                      <RSelect value={actionFilter} onChange={setActionFilter} searchable menuWidth="w-60"
                        options={[{ label: "All actions", value: "" }, ...TRIP_ACTION_LABELS.map((x) => ({ label: x, value: x }))]} />
                    </FilterField>
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3 text-[12px] font-medium text-zinc-700">
                      <Checkbox checked={filters.delayed} onChange={(next) => setFilters((f) => ({ ...f, delayed: next }))} aria-label="Delayed only" /> Delayed only
                    </label>
                  </FilterGroup>
                  <FilterGroup title="Trip">
                    <FilterField label="Type of trip">
                      <RSelect value={filters.leadType} onChange={(v) => setFilters((f) => ({ ...f, leadType: v as any }))} menuWidth="w-52"
                        options={[{ label: "All trip types", value: "" }, ...FIELD_LEAD_TYPES.map((t) => ({ label: t.label, value: t.value }))]} />
                    </FilterField>
                    <FilterField label="Leg">
                      <RSelect value={filters.leg} onChange={(v) => setFilters((f) => ({ ...f, leg: v as any }))}
                        options={[{ label: "Pickup & drop", value: "" }, { label: "Pickup leg", value: "pickup" }, { label: "Drop leg", value: "drop" }]} />
                    </FilterField>
                    <FilterField label="Source">
                      <RSelect value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v as FieldSource | "" }))} menuWidth="w-48"
                        options={[{ label: "All sources", value: "" }, ...(Object.keys(FIELD_SOURCE_LABEL) as FieldSource[]).map((x) => ({ label: FIELD_SOURCE_LABEL[x], value: x }))]} />
                    </FilterField>
                    <FilterField label="Linked ticket">
                      <RSelect value={filters.hasTicket} onChange={(v) => setFilters((f) => ({ ...f, hasTicket: v as any }))}
                        options={[{ label: "Any", value: "" }, { label: "Has ticket", value: "yes" }, { label: "No ticket", value: "no" }]} />
                    </FilterField>
                  </FilterGroup>
                  {!isNinja && (
                    <FilterGroup title="People">
                      <FilterField label="Ninja">
                        <RSelect value={filters.ninjaId} onChange={(v) => setFilters((f) => ({ ...f, ninjaId: v }))} searchable menuWidth="w-56"
                          options={[{ label: "All ninjas", value: "" }, ...engineers.map((n) => ({ label: n.name, value: n.id }))]} />
                      </FilterField>
                      <FilterField label="Field manager">
                        <RSelect value={filters.fieldManagerId} onChange={(v) => setFilters((f) => ({ ...f, fieldManagerId: v }))} searchable menuWidth="w-56"
                          options={[{ label: "All field managers", value: "" }, ...managers.map((m) => ({ label: m.name, value: m.id }))]} />
                      </FilterField>
                    </FilterGroup>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[12px] text-muted-foreground"><strong className="text-foreground tabular-nums">{filtered.length}</strong> of {scopedJobs.length} trips match</span>
                  <Button size="sm" onClick={() => setShowFilters(false)}>Done</Button>
                </div>
              </div>
            )}

            {panelChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {panelChips.map((c, i) => <ActiveFilterChip key={`${c.label}-${i}`} label={c.label} value={c.value} onClear={c.onClear} />)}
                <button onClick={resetAll} className="text-[12px] font-medium text-[#4361EE] hover:underline">Clear all</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar line (always visible): compact indicators + THE collapse pill. */}
      {controlsCollapsed && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{collapsedIndicators}</div>
          <WorkspaceCollapseBar collapsed onToggle={workspace.toggle} />
        </div>
      )}

      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
          <span className="inline-flex items-center rounded-full bg-[#EEF1FD] px-3 py-1.5 text-xs font-semibold text-[#4361EE]">{selectedInView.length} selected</span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={doExcel}><FileSpreadsheet className="h-3.5 w-3.5" /> Export selected</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Desktop data-grid — bounded dual-axis scroll; sticky head; frozen anchors. */}
      <div ref={grid.scrollRef} className="rox-table-card rox-grid-scroll rox-lock-grow hidden overflow-auto shadow-card md:block">
        <table className="w-full table-fixed text-[14px]" style={{ minWidth: grid.tableMinWidth }}>
          <colgroup>{grid.displayColumns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
          <thead className="rox-table-head sticky top-0 z-[6] [&_.rox-frozen]:!bg-[#5368D4] [&_th]:!text-white"
            style={{ background: "#5368D4", color: "#ffffff", borderBottom: "2px solid rgba(255,255,255,0.35)" }}>
            <tr className="text-[12px] font-bold uppercase tracking-wider">
              {grid.displayColumns.map((c) => {
                const align = c.key === "select" ? "text-left" : FIELD_LEFT_COLS.has(c.key) && c.key !== "id" ? "text-left" : "text-center";
                return (
                  <th key={c.key} {...shifted(c.key, mergeFrozen(grid.frozenCellProps(c.key), `px-3 ${COL_PAD[c.key] ?? ""} py-4 ${align}`))}>
                    {c.key === "select" ? (
                      <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} aria-label="Select all trips" />
                    ) : c.key === "action" ? (
                      <span className="inline-flex items-center gap-1">{c.label}</span>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.map((j) => {
              const delayed = isDelayed(j);
              const r = resolveFieldRow(j, resolveSrc);
              const ctx = {
                job: j, r, comment: latestTripComment(j, events), store: storeForJob(j), canEditStatus, canViewLocation,
                selected: selected.has(j.id), onToggle: () => toggleOne(j.id), onOpen: () => openTrip(j),
                onStatus: (next: FieldJobStatus) => void transition(j.id, next), onNavigate: (h: string) => router.push(h),
              };
              return (
                <tr key={j.id} onClick={() => openTrip(j)}
                  style={delayed ? ({ ["--rox-row-tint" as any]: "rgb(255 241 242 / 0.7)" }) : undefined}
                  className={cn("rox-table-row group h-[76px] cursor-pointer align-middle transition",
                    delayed ? "bg-rose-50/70 rox-frozen-tinted" : "hover:bg-muted/40", selected.has(j.id) && "bg-[#EEF1FD]/60")}>
                  {grid.displayColumns.map((c) => {
                    const bodyAlign = FIELD_LEFT_COLS.has(c.key) ? "text-left" : "text-center";
                    return (
                      <td key={c.key} {...shifted(c.key, mergeFrozen(grid.frozenCellProps(c.key), `px-3 ${COL_PAD[c.key] ?? ""} py-4 align-middle ${bodyAlign}`))}
                        onClick={FIELD_STOP_COLS.has(c.key) ? (e) => e.stopPropagation() : undefined}>
                        {c.key === "select"
                          ? <Checkbox checked={selected.has(j.id)} onChange={() => toggleOne(j.id)} aria-label={`Select trip ${j.jobNo}`} />
                          : renderFieldCell(c.key, ctx)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {hydrated && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <EmptyStateCharacter variant="field" />
            <p className="font-semibold">{scopedJobs.length === 0 ? "No trips yet" : "No trips match your filters"}</p>
            <p className="text-sm text-muted-foreground">{scopedJobs.length === 0 ? "Route a Lead to Pickup & Drop or create a Field Assignment." : "Try a different view, filter or date range."}</p>
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading trips…</div>}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((j) => {
          const r = resolveFieldRow(j, resolveSrc);
          const a = fieldTripAction(j);
          return (
            <button key={j.id} onClick={() => openTrip(j)} className={cn("w-full rounded-2xl border border-border bg-card p-4 text-left shadow-card", isDelayed(j) && "border-rose-200 bg-rose-50/40")}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.customerName || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{j.jobNo}{j.leadNo ? ` · ${j.leadNo}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">{FIELD_STATUS_LABEL[j.status]}</span>
              </div>
              <p className="mt-2 text-[12px] text-zinc-600">{a.label} · {r.model || "N/A"}</p>
              {r.invoiceAmount != null && <p className="mt-1 text-[11px] font-semibold text-emerald-700">{formatInvoiceAmount(r.invoiceAmount)}</p>}
            </button>
          );
        })}
      </div>

      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="trip" className="rox-lock-footer -mt-3 !py-0" />

            <FieldAssignmentForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={(j) => router.push(`/field/${j.id}`)} />
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">{title}</p>
      {children}
    </div>
  );
}
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
