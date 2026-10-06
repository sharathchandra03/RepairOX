"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { List, LayoutGrid, Map as MapIcon, MapPinOff, ChevronDown, Building2, Check, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TableSearch } from "@/components/common/table-utility-bar";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { RequireCapability } from "@/components/common/require-capability";
import { Dropdown } from "@/components/ui/dropdown";
import { CAP } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useStoreContext } from "@/lib/store-context";
import { useSession } from "@/lib/use-session";
import { statusColor, type MappableLead } from "@/components/leads/map/lead-map";
import {
  loadCityScopes,
  allCitiesBboxOf,
  type CityScope,
  type Bbox,
} from "@/lib/geo/city-scopes";
import type { Lead } from "@/lib/leads-data";

/* The Leaflet map touches `window`, so it is loaded client-only (no SSR). It
   also keeps Leaflet off the bundle for every other page. */
const LeadMap = dynamic(() => import("@/components/leads/map/lead-map").then((m) => m.LeadMap), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[560px] place-items-center rounded-2xl border-2 border-zinc-200 bg-muted/20 text-sm text-muted-foreground shadow-card">
      Loading map…
    </div>
  ),
});

/* Normalize a configurable status into a stable key for coloring + a readable
   label. Mirrors the substring approach used by `statusTone` (lead-pills). */
function statusKeyOf(status: string): string {
  const s = (status || "").toLowerCase();
  if (/not\s*qualif/.test(s)) return "not-qualified";
  if (/qualif/.test(s)) return "qualified";
  if (/follow/.test(s)) return "follow-up";
  if (/propos|quot/.test(s)) return "proposal";
  if (/won|convert/.test(s)) return "won";
  if (/lost|dead|reject/.test(s)) return "lost";
  if (/contact/.test(s)) return "contacted";
  if (/new|open|fresh/.test(s)) return "new";
  return "new";
}

/* Text used to match a lead against the search query (structured fields). */
function leadSearchText(lead: Lead): string {
  return [lead.leadNo, lead.name, lead.number, lead.email, lead.device, lead.region, lead.location, lead.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const ALL_CITIES = "__all__";

function MapViewContent() {
  const { leads, canSeeAllLeads } = useLeads();
  const { id: currentUserId } = useSession();
  const { activeStoreId } = useStoreContext();
  const leadMode = useLeadStoreMode();

  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  // City scopes — the SAME admin-managed list the Lead form's picker uses.
  const [cities, setCities] = useState<CityScope[]>([]);
  const [cityId, setCityId] = useState<string>(ALL_CITIES);
  useEffect(() => {
    setCities(loadCityScopes());
  }, []);

  const selectedCity = cityId === ALL_CITIES ? null : cities.find((c) => c.id === cityId) ?? null;
  const bbox: Bbox = useMemo(
    () => (selectedCity ? selectedCity.bbox : allCitiesBboxOf(cities)),
    [selectedCity, cities],
  );

  // Live resolution counts reported by the map.
  const [resInfo, setResInfo] = useState({ plotted: 0, geocoding: false, unresolved: 0 });

  /* ── Scope the leads exactly like the Kanban/List views ── */
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (!canSeeAllLeads && currentUserId) {
        const mine =
          l.assignedTo === currentUserId ||
          l.createdBy === currentUserId ||
          l.followUpAgentId === currentUserId;
        if (!mine) return false;
      }
      if (activeStoreId && l.branchId && l.branchId !== activeStoreId) return false;
      if (!matchesStoreSelection(l.branchId, storeFilter)) return false;
      if (q && !leadSearchText(l).includes(q)) return false;
      return true;
    });
  }, [leads, canSeeAllLeads, currentUserId, activeStoreId, storeFilter, query]);

  /* Build the mappable set. A lead is placeable when it has a saved pin OR any
     free-text location/region we can geocode. */
  const mappable = useMemo<MappableLead[]>(() => {
    return scoped
      .map((l) => {
        const geocodeText = [l.location, l.region].filter(Boolean).join(", ").trim();
        const hasPin = l.locationLat != null && l.locationLng != null;
        if (!hasPin && !geocodeText) return null;
        return {
          id: l.id,
          name: l.name || l.leadNo,
          place: l.location || l.region || "",
          geocodeText,
          value: l.estimate ?? l.expectedValue ?? null,
          statusKey: statusKeyOf(l.status),
          statusLabel: l.status || "New",
          lat: l.locationLat,
          lng: l.locationLng,
        } as MappableLead;
      })
      .filter((x): x is MappableLead => x !== null);
  }, [scoped]);

  const noLocation = scoped.length - mappable.length;

  /* ── By region (derived from REAL lead data) ── */
  const byRegion = useMemo(() => {
    const map = new Map<string, { leads: number; value: number }>();
    for (const l of scoped) {
      const key = (l.region || l.location || "Unknown").trim() || "Unknown";
      const entry = map.get(key) ?? { leads: 0, value: 0 };
      entry.leads += 1;
      entry.value += l.estimate ?? l.expectedValue ?? 0;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([city, v]) => ({ city, ...v }))
      .sort((a, b) => b.leads - a.leads || b.value - a.value);
  }, [scoped]);

  /* ── Status legend (statuses actually present on mappable leads) ── */
  const statusLegend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of mappable) if (!seen.has(l.statusKey)) seen.set(l.statusKey, l.statusLabel);
    return Array.from(seen.entries());
  }, [mappable]);

  const cityLabel = selectedCity?.label ?? "All cities";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Map View"
        subtitle="Leads plotted geographically to spot coverage gaps and hot zones."
        actions={
          <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
            <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="List View"><List className="h-3.5 w-3.5" /></Link>
            <Link href="/leads/kanban" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></Link>
            <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="Map View"><MapIcon className="h-3.5 w-3.5" /></Link>
          </div>
        }
      />

      {/* Utility bar — City → Store → Search (right-aligned). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <CitySelect cities={cities} value={cityId} label={cityLabel} onChange={setCityId} />
          {leadMode.isMulti && <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />}
          <TableSearch value={query} onChange={setQuery} placeholder="Search leads…" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Real Leaflet / OpenStreetMap map */}
        <div className="space-y-2">
          <LeadMap leads={mappable} city={selectedCity} bbox={bbox} onResolved={setResInfo} />

          {/* Honest resolution line. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPinned className="h-3.5 w-3.5 text-[#4361EE]" />
              <strong className="font-semibold text-zinc-700">{resInfo.plotted}</strong> of {mappable.length} placed
            </span>
            {resInfo.geocoding && <span className="text-[#4361EE]">resolving addresses…</span>}
            {resInfo.unresolved > 0 && !resInfo.geocoding && (
              <span>{resInfo.unresolved} address{resInfo.unresolved === 1 ? "" : "es"} couldn’t be located</span>
            )}
            {noLocation > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MapPinOff className="h-3.5 w-3.5" />
                {noLocation} lead{noLocation === 1 ? "" : "s"} with no location
              </span>
            )}
          </div>
        </div>

        {/* Sidebar — derived from real data */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By Region</p>
              <span className="text-[10px] font-medium text-muted-foreground">{byRegion.length} total</span>
            </div>
            {byRegion.length === 0 ? (
              <p className="mt-3 text-[12px] text-muted-foreground">No leads in scope.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {byRegion.slice(0, 10).map((city, i) => (
                  <li key={city.city} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">{i + 1}</span>
                      <span className="truncate text-[12.5px] font-medium text-zinc-800">{city.city}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[12px] font-semibold tnum">{city.leads}</span>
                      {city.value > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground tnum">{formatINR(city.value)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {statusLegend.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {statusLegend.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2 text-[12px]">
                    <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: statusColor(key) }} />
                    <span className="truncate capitalize text-zinc-700">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-card">
              <p className="text-2xl font-bold tnum text-zinc-900">{resInfo.plotted}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Plotted</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-card">
              <p className="text-2xl font-bold tnum text-zinc-900">{byRegion.length}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Regions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── City selector — reuses the lead-form city scopes ────────────────────── */
function CitySelect({
  cities,
  value,
  label,
  onChange,
}: {
  cities: CityScope[];
  value: string;
  label: string;
  onChange: (id: string) => void;
}) {
  return (
    <Dropdown
      align="left"
      width="w-56"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-[34px] min-w-[150px] items-center gap-2 rounded-xl border bg-card px-3 text-[13px] font-medium transition-colors",
            open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-[#4361EE]/30 hover:border-[#4361EE]/50",
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-[#4361EE]" />
          <span className="flex-1 truncate text-left text-zinc-800">{label}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-[320px] overflow-y-auto p-1">
          <CityRow label="All cities" active={value === ALL_CITIES} onClick={() => { onChange(ALL_CITIES); close(); }} />
          {cities.length > 0 && <div className="my-1 border-t border-border" />}
          {cities.map((c) => (
            <CityRow key={c.id} label={c.label} active={value === c.id} onClick={() => { onChange(c.id); close(); }} />
          ))}
          {cities.length === 0 && (
            <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
              No cities configured. Add target cities from the Lead form’s location picker.
            </p>
          )}
        </div>
      )}
    </Dropdown>
  );
}

function CityRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
        active ? "bg-[#EEF1FD] text-[#4361EE]" : "text-foreground hover:bg-[#EEF1FD]",
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0 text-[#4361EE]" />}
    </button>
  );
}

export default function MapViewPage() {
  return (
    <RequireCapability anyOf={CAP.lead.view}>
      <MapViewContent />
    </RequireCapability>
  );
}
