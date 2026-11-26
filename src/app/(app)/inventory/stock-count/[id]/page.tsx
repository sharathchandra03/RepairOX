"use client";
/* View Stock Audit — full page (View-record standard). Counters enter quantities (optionally blind),
   a reviewer approves, and ONLY approval corrects stock. Rules: lib/stock-audit.ts, migration 0128. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck, EyeOff, History, ListChecks, Lock, ScanLine, StickyNote } from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { PinnedRail } from "@/components/common/pinned-rail";
import { NoPermission } from "@/components/common/no-permission";
import { TableSearch } from "@/components/common/table-utility-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { toast } from "@/components/ui/toaster";
import { ExportMenu } from "@/components/inventory/export-menu";
import { ToneChip, fmtDate } from "@/components/inventory/doc-ui";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { usePermissions } from "@/lib/permissions-context";
import { useStockAudit } from "@/lib/use-stock-audit";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, type DocLine, type Tone } from "@/lib/inventory-ops";
import {
  AUDIT_KIND_LABEL, LINE_STATE_LABEL, VARIANCE_REASONS, auditMeta, canApproveAudit, canMoveTo, isCounted, isHighLine, lineFromItem,
  lineState, lineVariance, sheetRows, submitBlockers, summarize, systemHidden, varianceValue, type LineState,
} from "@/lib/stock-audit";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import { cn, formatINR } from "@/lib/utils";

const meta = DOC_META.stock_count;
const STATE_TONE: Record<LineState, Tone> = { not_counted: "neutral", matched: "success", short: "danger", excess: "info", recount: "warning" };
type Filter = "all" | "not_counted" | "differences" | "matched" | "recount";
type Closing = "reject" | "cancel" | "recount" | null;
const textArea = "mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

export default function StockAuditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const myId = currentUser?.id;
  const { getDoc, ready } = useInventoryOps();
  const { inventory, canViewCost } = useInventoryScope();
  const audit = useStockAudit();
  const doc = getDoc(decodeURIComponent(id));

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState("");
  const [editing, setEditing] = useState<DocLine | null>(null);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState<Closing>(null);
  const [note, setNote] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const hiddenSystem = doc ? systemHidden(doc, can) : false;
  const canSee = allow(can, CAP.stockAudit.view);
  const canCount = allow(can, [...CAP.stockAudit.count, ...CAP.stockAudit.create]);
  const canExport = allow(can, CAP.stockAudit.export);
  const canStartRecount = allow(can, CAP.stockAudit.create);

  const lines = useMemo(() => doc?.lines ?? [], [doc]);
  const sum = useMemo(() => summarize(lines), [lines]);
  const m = doc ? auditMeta(doc) : null;
  const itemById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);
  const costOf = (itemId: string) => itemById.get(itemId)?.costPrice ?? 0;
  const value = useMemo(() => (canViewCost && !hiddenSystem ? varianceValue(lines, (i) => itemById.get(i)?.costPrice ?? 0) : null), [canViewCost, hiddenSystem, lines, itemById]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      const st = lineState(l);
      const okFilter = filter === "all" || (filter === "not_counted" && st === "not_counted") || (filter === "recount" && st === "recount")
        || (filter === "differences" && (st === "short" || st === "excess")) || (filter === "matched" && st === "matched");
      return okFilter && (!q || `${l.name} ${l.itemId} ${l.category ?? ""} ${l.location ?? ""} ${itemById.get(l.itemId)?.barcode ?? ""}`.toLowerCase().includes(q));
    });
  }, [lines, filter, query, itemById]);

  useEffect(() => { if (doc?.status === "draft" && canCount) scanRef.current?.focus(); }, [doc?.status, canCount, editing]);

  if (!doc || !m) {
    return (
      <div className="space-y-4">
        <BackPill href={meta.route} label="Back to Stock Audits" />
        <p className="py-16 text-center text-muted-foreground">{ready ? "This audit doesn't exist or you don't have access to it." : "Loading…"}</p>
      </div>
    );
  }
  if (!canSee) return <NoPermission title="You don't have access to Stock Audit" />;

  const status = meta.statuses[doc.status];
  const counting = doc.status === "draft";
  const submitted = doc.status === "submitted";
  const approveCheck = canApproveAudit(doc, can, myId);
  const canReview = submitted && canMoveTo(can, "submitted", "draft");
  const canReject = submitted && canMoveTo(can, "submitted", "rejected");
  const canCancel = (counting || submitted) && canMoveTo(can, doc.status, "cancelled");
  const canSubmit = counting && canMoveTo(can, "draft", "submitted");
  const blockers = submitBlockers(lines, m.blind);
  const flaggedCount = flags.size;

  function openScan() {
    const q = scan.trim().toLowerCase();
    if (!q) return;
    const hit = lines.find((l) => {
      const it = itemById.get(l.itemId);
      return [l.itemId, it?.barcode, it?.itemCode, it?.serviceCode].some((x) => (x ?? "").toLowerCase() === q);
    }) ?? lines.filter((l) => `${l.name} ${l.itemId}`.toLowerCase().includes(q))[0];
    if (!hit) { toast.error(`“${scan}” is not part of this audit`); return; }
    setScan(""); setEditing(hit);
  }
  async function run(fn: () => Promise<boolean>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    try { if (await fn()) after?.(); } finally { setBusy(false); }
  }
  async function exportSheet(format: "xlsx" | "csv") {
    const { headers, rows } = sheetRows(doc!, { showSystem: !hiddenSystem, showCost: canViewCost, costOf });
    const name = `${doc!.id}-count-sheet`;
    if (format === "xlsx") await downloadXLSX(`${name}.xlsx`, headers, rows, "Count sheet"); else downloadCSV(`${name}.csv`, toCSV(headers, rows));
  }
  async function startRecountAudit() {
    const diff = lines.filter((l) => lineState(l) === "short" || lineState(l) === "excess");
    const fresh = diff.flatMap((l) => { const it = itemById.get(l.itemId); return it ? [lineFromItem(it)] : []; });
    await run(async () => {
      const d = await audit.createAudit({ kind: "recount", blind: m!.blind, scope: `Recount of ${doc!.id}`, notes: `Items that differed in ${doc!.id}`, lines: fresh, recountOf: doc!.id });
      if (d) router.push(`/inventory/stock-count/${d.id}`);
      return !!d;
    });
  }
  function toggleFlag(itemId: string) { setFlags((p) => { const n = new Set(p); if (n.has(itemId)) n.delete(itemId); else n.add(itemId); return n; }); }

  const columns: InvColumn<DocLine>[] = [
    ...(submitted && canReview ? [{ key: "flag", header: "Recount", align: "center" as const, render: (l: DocLine) => (
      <span onClick={(e) => e.stopPropagation()}><Checkbox checked={flags.has(l.itemId)} onChange={() => toggleFlag(l.itemId)} aria-label={`Recount ${l.name}`} /></span>
    ) }] : []),
    { key: "item", header: "Item / SKU", grow: true, render: (l) => (
      <div className="min-w-0" title={l.name}>
        <p className="truncate font-semibold">{l.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{l.itemId}{l.category ? ` · ${l.category}` : ""}{l.location ? ` · ${l.location}` : ""}</p>
        {l.recount && l.recountNote && <p className="truncate text-[11.5px] font-medium text-amber-700" title={l.recountNote}>Recount: {l.recountNote}</p>}
      </div>
    ) },
    { key: "sys", header: "System qty", align: "right", render: (l) => hiddenSystem ? <span className="text-muted-foreground" title="Hidden during a blind count">•••</span> : <span className="font-bold tabular-nums">{l.system ?? 0}</span> },
    { key: "cnt", header: "Counted", align: "right", render: (l) => isCounted(l) ? <span className="tabular-nums">{l.counted}</span> : <span className="text-muted-foreground">—</span> },
    { key: "diff", header: "Difference", align: "right", render: (l) => {
      if (hiddenSystem || !isCounted(l)) return <span className="text-muted-foreground">—</span>;
      const v = lineVariance(l);
      return <span className={cn("font-bold tabular-nums", v < 0 ? "text-rose-600" : v > 0 ? "text-sky-700" : "text-emerald-600")}>{v > 0 ? `+${v}` : v}{isHighLine(l) && <span title="High variance" className="ml-1 text-amber-600">!</span>}</span>;
    } },
    { key: "reason", header: "Reason", max: 190, render: (l) => <span className="block truncate text-muted-foreground" title={[l.reason, l.comment].filter(Boolean).join(" · ")}>{l.reason || l.comment || "—"}</span> },
    { key: "by", header: "Counted by", max: 140, render: (l) => <div className="min-w-0"><p className="truncate">{l.countedBy || "—"}</p>{l.countedAt && <p className="text-[11px] text-muted-foreground">{fmtDate(l.countedAt)}</p>}</div> },
    { key: "state", header: "Status", align: "center", min: 118, render: (l) => {
      const st = lineState(l);
      const masked = hiddenSystem && (st === "matched" || st === "short" || st === "excess");
      return <ToneChip tone={masked ? "info" : STATE_TONE[st]} label={masked ? "Counted" : LINE_STATE_LABEL[st]} />;
    } },
    ...(counting && canCount ? [{ key: "act", header: "Action", align: "center" as const, render: (l: DocLine) => (
      <Button size="sm" variant={isCounted(l) ? "outline" : "primary"} onClick={(e) => { e.stopPropagation(); setEditing(l); }}>{isCounted(l) ? "Recount" : "Count"}</Button>
    ) }] : []),
  ];

  const filterOptions: { value: Filter; label: string }[] = hiddenSystem
    ? [{ value: "all", label: `All (${sum.total})` }, { value: "not_counted", label: `Not counted (${sum.notCounted})` }, ...(sum.recount ? [{ value: "recount" as Filter, label: `Recount (${sum.recount})` }] : [])]
    : [{ value: "all", label: `All (${sum.total})` }, { value: "not_counted", label: `Not counted (${sum.notCounted})` }, { value: "differences", label: `Differences (${sum.short + sum.excess})` }, { value: "matched", label: `Matched (${sum.matched})` }, ...(sum.recount ? [{ value: "recount" as Filter, label: `Recount (${sum.recount})` }] : [])];

  return (
    <div className="space-y-6">
      <BackPill href={meta.route} label="Back to Stock Audits" />
      <DetailHero>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]"><ClipboardCheck className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{AUDIT_KIND_LABEL[m.kind]}</p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{doc.id}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="w-48"><ToneChip tone={status?.tone ?? "neutral"} label={status?.label ?? doc.status} /></span>
                <span className="text-[13px] text-muted-foreground">Scope: <b className="text-foreground">{m.scope || "—"}</b></span>
                {m.blind && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200"><EyeOff className="h-3 w-3" />Blind count</span>}
                {sum.high && !hiddenSystem && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">High variance</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canExport && <ExportMenu onExport={exportSheet} label="Count sheet" />}
            {canSubmit && <Button disabled={busy || blockers.length > 0} title={blockers[0]} onClick={() => run(() => audit.submit(doc))}>Submit for approval</Button>}
            {submitted && canReview && <Button variant="outline" disabled={busy} onClick={() => { if (!flaggedCount) { toast.error("Tick the items to recount first."); return; } setNote(""); setClosing("recount"); }}>Request recount{flaggedCount ? ` (${flaggedCount})` : ""}</Button>}
            {submitted && <Button disabled={busy || !approveCheck.ok} title={approveCheck.reason} onClick={() => { setNote(""); setConfirmApprove(true); }}>Approve &amp; correct stock</Button>}
            {canReject && <Button variant="destructive" disabled={busy} onClick={() => { setNote(""); setClosing("reject"); }}>Reject</Button>}
            {canCancel && <Button variant="outline" disabled={busy} onClick={() => { setNote(""); setClosing("cancel"); }}>Cancel audit</Button>}
            {doc.status === "rejected" && canStartRecount && sum.short + sum.excess > 0 && <Button variant="outline" disabled={busy} onClick={startRecountAudit}>Start recount audit</Button>}
          </div>
        </div>
        {submitted && !approveCheck.ok && canMoveTo(can, "submitted", "approved") && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-amber-700"><Lock className="h-3.5 w-3.5" />{approveCheck.reason}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Items counted" value={`${sum.counted} / ${sum.total}`} />
          {hiddenSystem ? (
            <>
              <SummaryCard label="Not counted" value={sum.notCounted} tone={sum.notCounted ? "text-amber-600" : undefined} />
              <SummaryCard label="Counted units" value={sum.countedUnits} />
            </>
          ) : (
            <>
              <SummaryCard label="Matched" value={sum.matched} tone="text-emerald-600" />
              <SummaryCard label="Short" value={sum.short ? `${sum.short} (−${sum.shortUnits})` : 0} tone={sum.short ? "text-rose-600" : undefined} />
              <SummaryCard label="Excess" value={sum.excess ? `${sum.excess} (+${sum.excessUnits})` : 0} tone={sum.excess ? "text-sky-700" : undefined} />
              <SummaryCard label={value ? "Net value" : "Accuracy"} value={value ? formatINR(value.net) : sum.accuracy === null ? "—" : `${Math.round(sum.accuracy * 100)}%`} />
            </>
          )}
        </div>
      </DetailHero>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection icon={ListChecks} title="Items" accent="blue">
            {counting && canCount && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#4361EE]/25 bg-[#EEF1FD] px-3 py-2">
                <ScanLine className="h-4 w-4 shrink-0 text-[#4361EE]" />
                <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openScan(); } }}
                  placeholder="Scan a barcode or type a SKU, then press Enter" aria-label="Scan or enter SKU"
                  className="h-[34px] flex-1 rounded-lg border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
                <Button size="sm" variant="outline" onClick={openScan}>Open</Button>
              </div>
            )}
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <StatusTabs<Filter> value={filter} onChange={setFilter} options={filterOptions} />
              <TableSearch value={query} onChange={setQuery} placeholder="Search this audit by item, SKU, category or location…" animatedPrefix="Search by " animatedWords={["item name", "SKU", "category", "location"]} className="w-full sm:w-72" />
            </div>
            <InvTable flow columns={columns} rows={visible} rowKey={(l) => l.itemId} itemLabel="item" resetKey={`${filter}|${query}`}
              onRowClick={counting && canCount ? (l) => setEditing(l) : undefined}
              rowTint={(l) => (l.recount ? "bg-amber-50/40" : submitted && flags.has(l.itemId) ? "bg-amber-50/40" : undefined)}
              emptyTitle="No items match" emptyHint="Change the filter or search." />
            {counting && canCount && blockers.length > 0 && <p className="mt-3 text-[12.5px] text-muted-foreground">{blockers.join(" ")} Submit becomes available when every item is counted.</p>}
          </DetailSection>
        </div>

        <PinnedRail>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit details</h3>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Started by</dt><dd className="font-medium">{doc.createdBy || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Started</dt><dd className="font-medium">{fmtDate(doc.createdAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last updated</dt><dd className="font-medium">{fmtDate(doc.updatedAt)}</dd></div>
              {m.recountOf && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recount of</dt><dd><Link className="font-semibold text-[#4361EE] hover:underline" href={`/inventory/stock-count/${m.recountOf}`}>{m.recountOf}</Link></dd></div>}
              {m.selfReviewed && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-700">Approved by the same person who counted (owner).</div>}
            </dl>
            {m.notes && <p className="mt-3 flex gap-2 rounded-xl bg-muted/40 px-3 py-2 text-[12.5px]"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{m.notes}</p>}
            <p className="mt-3 text-[11.5px] text-muted-foreground">Stock changes only when this audit is approved. The system quantity is saved at the moment each item is counted, so sales and receipts made while counting do not distort the result.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" />Activity</h3>
            <ol className="mt-3 space-y-3">
              {[...m.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4361EE]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{meta.statuses[h.status]?.label ?? h.status}{h.self && <span className="ml-1.5 text-[11px] text-amber-700">(own count)</span>}</p>
                    <p className="text-[11.5px] text-muted-foreground">{h.by || "—"} · {fmtDate(h.at)}</p>
                    {h.note && <p className="mt-0.5 text-[12.5px]">{h.note}</p>}
                  </div>
                </li>
              ))}
              {m.history.length === 0 && <li className="text-[12.5px] text-muted-foreground">No activity recorded yet.</li>}
            </ol>
          </div>
        </PinnedRail>
      </div>

      <CountDialog
        key={editing?.itemId ?? "none"}
        line={editing}
        hideSystem={hiddenSystem}
        blind={m.blind}
        onClose={() => setEditing(null)}
        onSave={async (qty, reason, n) => { const ok = await audit.countLine(doc, editing!.itemId, qty, reason, n); if (ok) setEditing(null); return ok; }}
      />

      <ConfirmDialog
        open={confirmApprove}
        title={`Approve ${doc.id}?`}
        description={`${sum.short + sum.excess} item${sum.short + sum.excess === 1 ? "" : "s"} will change: ${sum.shortUnits ? `−${sum.shortUnits} short` : "0 short"}, ${sum.excessUnits ? `+${sum.excessUnits} excess` : "0 excess"}${value ? ` (net ${formatINR(value.net)})` : ""}. Stock is corrected and logged in the movement ledger. This cannot be undone.`}
        confirmLabel="Approve & correct stock"
        danger={false}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => { setConfirmApprove(false); void run(() => audit.approve(doc, "")); }}
      />

      <RoxCenteredForm
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing === "recount" ? "Request a recount" : closing === "reject" ? "Reject this audit" : "Cancel this audit"}
        subtitle={closing === "recount" ? `${flaggedCount} item${flaggedCount === 1 ? "" : "s"} go back to the counter. The audit returns to Counting.` : "No stock is changed."}
        icon={ClipboardCheck}
        width="max-w-md"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setClosing(null)}>Back</Button>
          <Button variant={closing === "recount" ? "primary" : "destructive"} disabled={busy || (closing !== "recount" && !note.trim())}
            onClick={() => run(async () => {
              if (closing === "recount") return audit.requestRecount(doc, Object.fromEntries([...flags].map((f) => [f, note.trim()])));
              return audit.close(doc, closing === "reject" ? "rejected" : "cancelled", note);
            }, () => { setClosing(null); setFlags(new Set()); })}>
            {closing === "recount" ? "Send for recount" : closing === "reject" ? "Reject audit" : "Cancel audit"}
          </Button></div>}
      >
        <Label>{closing === "recount" ? "Note for the counter (optional)" : "Reason *"}</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={textArea} placeholder={closing === "recount" ? "e.g. Please check the second shelf" : "Why?"} />
      </RoxCenteredForm>
    </div>
  );
}

/* ── Count editor (centered dialog) ─────────────────────────────────────── */
function CountDialog({ line, hideSystem, blind, onClose, onSave }: {
  line: DocLine | null; hideSystem: boolean; blind: boolean; onClose: () => void;
  onSave: (qty: number, reason: string, note: string) => Promise<boolean>;
}) {
  const { inventory } = useInventoryScope();
  const live = line ? inventory.find((i) => i.id === line.itemId) : undefined;
  const [qty, setQty] = useState(line && isCounted(line) ? String(line.counted) : "");
  const [reason, setReason] = useState(line?.reason ?? "");
  const [note, setNote] = useState(line?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const system = live ? live.currentStock : line?.system ?? 0;
  const n = qty.trim() === "" ? NaN : Number(qty);
  const valid = Number.isInteger(n) && n >= 0;
  const diff = valid ? n - system : 0;
  const needReason = !blind && valid && diff !== 0;
  const can = valid && (!needReason || reason.trim() !== "") && !saving;
  async function save() { if (!can) return; setSaving(true); try { await onSave(n, reason, note); } finally { setSaving(false); } }
  return (
    <RoxCenteredForm
      open={!!line}
      onClose={onClose}
      title="Update physical count"
      subtitle={line ? `Selected item · ${line.itemId}` : ""}
      icon={ScanLine}
      width="max-w-lg"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!can}>{saving ? "Saving…" : "Save count"}</Button></div>}
    >
      {line && (
        <div className="space-y-4">
          <div>
            <p className="text-[15px] font-bold">{line.name}</p>
            <p className="text-[12.5px] text-muted-foreground">{[line.brand, line.category, line.location].filter(Boolean).join(" / ")}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[12px] text-muted-foreground">Available in system</p><p className="text-2xl font-extrabold tabular-nums">{hideSystem ? "•••" : system}</p></div>
            <div><p className="text-[12px] text-muted-foreground">Physical count</p><p className="text-2xl font-extrabold tabular-nums">{valid ? n : "—"}</p></div>
          </div>
          <div>
            <Label>Enter actual quantity counted</Label>
            <input autoFocus type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
              className="mt-1.5 h-[40px] w-full rounded-xl border border-input bg-card px-3 text-[15px] tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
          {!hideSystem && (
            <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3">
              <div>
                <p className="text-[14px] font-bold">Stock difference</p>
                <p className="text-[12.5px] text-muted-foreground">{!valid ? "Enter the quantity" : diff === 0 ? "Perfect match, no correction needed" : diff < 0 ? `${-diff} short` : `${diff} excess`}</p>
              </div>
              <span className={cn("text-2xl font-extrabold tabular-nums", !valid || diff === 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-sky-700")}>{valid ? (diff > 0 ? `+${diff}` : diff) : "—"}</span>
            </div>
          )}
          {needReason && (
            <div>
              <Label>Reason for the difference *</Label>
              <Select className="mt-1.5 h-[34px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Select a reason" options={VARIANCE_REASONS.map((r) => ({ label: r, value: r }))} />
            </div>
          )}
          <div>
            <Label>Remarks (optional)</Label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textArea} placeholder="Anything the reviewer should know" />
          </div>
          <p className="text-[11.5px] text-muted-foreground">Saving only records your count. Stock changes after a reviewer approves the audit.</p>
        </div>
      )}
    </RoxCenteredForm>
  );
}
