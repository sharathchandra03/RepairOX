"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Lead Intelligence Search — full results page.

   Reached from the Lead Management header search ("View all results") or
   directly via /leads/search?q=...&type=.... Supports entity filtering,
   Lead Status / Contact Status / Agent / Store / Region / Source / Date range
   / Active-History and server-side pagination (never loads the whole table).
   ────────────────────────────────────────────────────────────────────────── */
import { BackPill, BackLink } from "@/components/common/back-pill";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, AlertTriangle, ShieldAlert, UserPlus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { ActiveFiltersBar, RoxFilterPanelHeader } from "@/components/ui/rox-filter";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { StoreMultiSelect } from "@/components/common/store-multi-select";
import { useStoreContext } from "@/lib/store-context";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  rpcLeadSearch, customerHref, EMPTY_SEARCH, MIN_QUERY_LENGTH, newLeadForCustomerHref,
  type LeadSearchEntity, type LeadSearchActive, type LeadSearchResponse,
} from "@/lib/lead-search";
import {
  CustomerHitBody, LeadHitBody, ContactHitBody, FollowUpHitBody,
} from "@/components/leads/search/lead-search-parts";
import { CustomerActions } from "@/components/leads/search/hit-actions";
import { LeadQuickView } from "@/components/leads/search/lead-quick-view";

const ENTITY_OPTIONS: { label: string; value: LeadSearchEntity }[] = [
  { label: "All", value: "all" },
  { label: "Customers", value: "customers" },
  { label: "Leads", value: "leads" },
  { label: "Contacts", value: "contacts" },
  { label: "Follow-ups", value: "followups" },
];

const PAGE_SIZE = 20;

export default function LeadSearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const { optionsFor, salesAgents } = useLeads();
  const { stores, isAllShops } = useStoreContext();
  const canSearch = allow(can, CAP.lead.search);

  const [query, setQuery] = useState(params.get("q") || "");
  const [entity, setEntity] = useState<LeadSearchEntity>((params.get("type") as LeadSearchEntity) || "all");
  const [status, setStatus] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [agentId, setAgentId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [source, setSource] = useState("");
  const [active, setActive] = useState<LeadSearchActive>("all");
  const [sort, setSort] = useState<"relevance" | "recent">("relevance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeMode, setRangeMode] = useState<"all" | "custom">("all");

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LeadSearchResponse>(EMPTY_SEARCH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [quickLeadId, setQuickLeadId] = useState<string | null>(null);

  const q = query.trim();
  const hasQuery = q.length >= MIN_QUERY_LENGTH;
  const branchId = branchIds.length === 1 ? branchIds[0] : "";

  useEffect(() => { setPage(1); }, [query, entity, status, contactStatus, agentId, branchId, region, source, active, from, to, sort]);

  useEffect(() => {
    if (!canSearch) { setForbidden(true); return; }
    if (!hasQuery) { setResult(EMPTY_SEARCH); setError(""); return; }
    let alive = true;
    setLoading(true);
    setError("");
    const offset = (page - 1) * PAGE_SIZE;
    rpcLeadSearch({
      query: q, entity, limit: PAGE_SIZE, offset,
      status: status || undefined, contactStatus: contactStatus || undefined,
      agentId: agentId || undefined, branchId: branchId || undefined,
      region: region || undefined, source: source || undefined,
      from: from || undefined, to: to || undefined, active, sort,
    })
      .then((r) => { if (!alive) return; if (r.forbidden) setForbidden(true); else setResult(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Search failed"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, entity, status, contactStatus, agentId, branchId, region, source, active, from, to, sort, page, canSearch]);

  const total =
    entity === "leads" ? result.leads.total
    : entity === "customers" ? result.customers.total
    : entity === "contacts" ? result.contacts.total
    : entity === "followups" ? result.followups.total
    : result.leads.total + result.customers.total + result.contacts.total + result.followups.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const regionOptions = optionsFor("region");
  const sourceOptions = optionsFor("source");
  const statusOptions = optionsFor("status");
  const contactStatusOptions = optionsFor("contactStatus");

  const appliedFilters = useMemo(() => {
    const chips: { id: string; label: string; value: string; onClear: () => void }[] = [];
    if (status) chips.push({ id: "status", label: "Status", value: status, onClear: () => setStatus("") });
    if (contactStatus) chips.push({ id: "cs", label: "Contact Status", value: contactStatus, onClear: () => setContactStatus("") });
    if (agentId) chips.push({ id: "agent", label: "Agent", value: salesAgents.find((a) => a.id === agentId)?.name || agentId, onClear: () => setAgentId("") });
    if (region) chips.push({ id: "region", label: "Region", value: region, onClear: () => setRegion("") });
    if (source) chips.push({ id: "source", label: "Source", value: source, onClear: () => setSource("") });
    if (active !== "all") chips.push({ id: "active", label: "Active/History", value: active === "active" ? "Active" : "History", onClear: () => setActive("all") });
    if (from || to) chips.push({ id: "range", label: "Date", value: `${from || "…"} → ${to || "…"}`, onClear: () => { setFrom(""); setTo(""); setRangeMode("all"); } });
    return chips;
  }, [status, contactStatus, agentId, region, source, active, from, to, salesAgents]);

  const createLeadHref = useMemo(() => {
    const isPhone = /^[+0-9()\s.-]{6,}$/.test(q);
    const isEmail = q.includes("@");
    const p = new URLSearchParams({ action: "new" });
    if (isPhone) p.set("phone", q); else if (isEmail) p.set("email", q); else if (q) p.set("name", q);
    return `/leads/list?${p.toString()}`;
  }, [q]);

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-14 text-center shadow-card">
        <ShieldAlert className="h-9 w-9 text-amber-500" />
        <p className="text-sm font-semibold text-foreground">Lead search isn&rsquo;t enabled for your role</p>
        <p className="text-[12.5px] text-muted-foreground">Ask an administrator to grant Lead Intelligence Search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LeadQuickView leadId={quickLeadId} onClose={() => setQuickLeadId(null)} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <BackPill href="/leads/list" label="Back to Leads" className="mb-2" />
          <h1 className="text-lg font-bold text-foreground">Lead Intelligence Search</h1>
          <p className="text-[12.5px] text-muted-foreground">Search customers, leads, CRM contacts and follow-ups across your permitted records.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <RoxFilterPanelHeader title="Search & filters" onClose={() => router.push("/leads/list")} />
        <div className="mt-3 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers, mobile, email, Lead ID, device..."
              className="h-10 pl-9"
              autoFocus
            />
          </div>

          <SegmentedTabs size="sm" value={entity} onChange={(v) => setEntity(v as LeadSearchEntity)} options={ENTITY_OPTIONS.filter((o) => o.value !== "customers" || allow(can, CAP.lead.customerHistory))} />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Lead Status" className="h-[34px] min-w-[150px]"
              options={[{ label: "Any status", value: "" }, ...statusOptions.map((o) => ({ label: o.value, value: o.value }))]} />
            <Select value={contactStatus} onChange={(e) => setContactStatus(e.target.value)} placeholder="Contact Status" className="h-[34px] min-w-[160px]"
              options={[{ label: "Any contact status", value: "" }, ...contactStatusOptions.map((o) => ({ label: o.value, value: o.value }))]} />
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Assigned Agent" className="h-[34px] min-w-[160px]"
              options={[{ label: "Any agent", value: "" }, ...salesAgents.map((a) => ({ label: a.name, value: a.id }))]} />
            <Select value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region" className="h-[34px] min-w-[130px]"
              options={[{ label: "Any region", value: "" }, ...regionOptions.map((o) => ({ label: o.value, value: o.value }))]} />
            <Select value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className="h-[34px] min-w-[130px]"
              options={[{ label: "Any source", value: "" }, ...sourceOptions.map((o) => ({ label: o.value, value: o.value }))]} />
            {isAllShops && stores.length > 1 && (
              <StoreMultiSelect value={branchIds} onChange={setBranchIds} width="min-w-[150px]" />
            )}
            <Select value={active} onChange={(e) => setActive(e.target.value as LeadSearchActive)} placeholder="Active / History" className="h-[34px] min-w-[140px]"
              options={[{ label: "Active & History", value: "all" }, { label: "Active only", value: "active" }, { label: "History only", value: "history" }]} />
            <Select value={sort} onChange={(e) => setSort(e.target.value as "relevance" | "recent")} className="h-[34px] min-w-[150px]"
              options={[{ label: "Sort: Relevance", value: "relevance" }, { label: "Sort: Most recent activity", value: "recent" }]} />
            <SegmentedTabs size="sm" value={rangeMode} onChange={(v) => { setRangeMode(v as "all" | "custom"); if (v === "all") { setFrom(""); setTo(""); } }}
              options={[{ label: "All dates", value: "all" }, { label: "Custom", value: "custom" }]} />
            <DateRangePicker open={rangeMode === "custom"} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          </div>

          {appliedFilters.length > 0 && (
            <ActiveFiltersBar filters={appliedFilters} onClearAll={() => { setStatus(""); setContactStatus(""); setAgentId(""); setRegion(""); setSource(""); setActive("all"); setFrom(""); setTo(""); setRangeMode("all"); }} />
          )}
        </div>
      </div>

      {!hasQuery && (
        <div className="rounded-2xl border border-border bg-card p-14 text-center shadow-card">
          <Search className="mx-auto h-9 w-9 text-zinc-300" />
          <p className="mt-2 text-sm font-medium text-foreground">Type at least {MIN_QUERY_LENGTH} characters to search.</p>
        </div>
      )}

      {hasQuery && error && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-14 text-center shadow-card">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <p className="text-sm font-semibold text-foreground">Search failed</p>
          <p className="text-[12.5px] text-muted-foreground">{error}</p>
        </div>
      )}

      {hasQuery && !error && loading && total === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-14 text-muted-foreground shadow-card">
          <Loader2 className="h-5 w-5 animate-spin" /> Searching…
        </div>
      )}

      {hasQuery && !error && !loading && total === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-14 text-center shadow-card">
          <Search className="h-9 w-9 text-zinc-300" />
          <p className="text-sm font-semibold text-foreground">No existing customer or Lead found.</p>
          <p className="text-[12.5px] text-muted-foreground">Try a different search term, or create a new lead with this information.</p>
          <Button onClick={() => router.push(createLeadHref)} className="gap-1.5 bg-[#4361EE] text-white hover:bg-[#3450D8]">
            <UserPlus className="h-4 w-4" /> Create Lead
          </Button>
        </div>
      )}

      {hasQuery && !error && total > 0 && (
        <>
          <div className="space-y-3">
            {(entity === "all" || entity === "customers") && result.customers.rows.length > 0 && (
              <ResultSection title="Customers" count={result.customers.total}>
                {result.customers.rows.map((item) => (
                  <ResultRow key={item.id} href={customerHref(item.id)}>
                    <CustomerHitBody item={item} query={q} />
                    <div className="mt-2 pl-11"><CustomerActions item={item} /></div>
                  </ResultRow>
                ))}
              </ResultSection>
            )}
            {(entity === "all" || entity === "leads") && result.leads.rows.length > 0 && (
              <ResultSection title="Leads" count={result.leads.total}>
                {result.leads.rows.map((item) => (
                  <ResultRow key={item.id} onOpen={() => setQuickLeadId(item.id)}>
                    <LeadHitBody item={item} query={q} />
                  </ResultRow>
                ))}
              </ResultSection>
            )}
            {(entity === "all" || entity === "contacts") && result.contacts.rows.length > 0 && (
              <ResultSection title="CRM Contacts" count={result.contacts.total}>
                {result.contacts.rows.map((item) => (
                  <ResultRow key={item.id} href={item.customer_id ? customerHref(item.customer_id) : "/leads/contacts"}>
                    <ContactHitBody item={item} query={q} />
                  </ResultRow>
                ))}
              </ResultSection>
            )}
            {(entity === "all" || entity === "followups") && result.followups.rows.length > 0 && (
              <ResultSection title="Follow-ups" count={result.followups.total}>
                {result.followups.rows.map((item) => (
                  <ResultRow key={item.id} onOpen={() => setQuickLeadId(item.lead_id)}>
                    <FollowUpHitBody item={item} query={q} />
                  </ResultRow>
                ))}
              </ResultSection>
            )}
          </div>
          {entity !== "all" && totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} itemLabel="result" />
          )}
        </>
      )}
    </div>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-zinc-50/70 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</span>
        <span className="text-[11px] text-zinc-400">{count} result{count === 1 ? "" : "s"}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function ResultRow({ href, onOpen, children }: { href?: string; onOpen?: () => void; children: React.ReactNode }) {
  const router = useRouter();
  const open = () => { if (onOpen) onOpen(); else if (href) router.push(href); };
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); }}
      className="w-full cursor-pointer px-4 py-3 text-left transition hover:bg-zinc-50"
    >
      {children}
    </div>
  );
}
