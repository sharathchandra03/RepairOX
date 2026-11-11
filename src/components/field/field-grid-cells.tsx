"use client";
/* RepairOX — Field (Pickup & Drop) data-grid: column contract + cell renderers.
   Column order, widths and anchors are defined ONCE here (canonical GridColumn[]);
   per-user order/freeze live in the shared hooks under table_key "field_table". */
import { Eye, Lock, MapPin, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GridColumn } from "@/hooks/use-frozen-columns";
import {
  FIELD_LEAD_TYPE_LABEL, FIELD_LEAD_TYPE_TONE, FIELD_SOURCE_LABEL, FIELD_SOURCE_TONE,
  classifySource, normaliseLeadType, accentColor, isDelayed,
  type FieldJob,
} from "@/lib/field-data";
import { formatInvoiceAmount, type ResolvedFieldRow } from "@/lib/field-resolve";
import { fieldTripAction, tripValue, TRIP_ACTION_TONE_CLASS } from "@/lib/field-table";
import { mapsOpenUrl } from "@/lib/maps-url";
import { tripDevicesOf } from "@/lib/field-devices";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { StatusPill } from "@/components/field/field-table-parts";
import { TripCommentCell } from "@/components/field/trip-comment-cell";
import type { StoreBranch } from "@/lib/store-context";

/** Canonical default order (per the Pickup & Drop spec). Trip ID is the primary
 *  frozen-left anchor; the View/eye column is the frozen-right anchor. */
export function fieldGridColumns(multiStore: boolean): GridColumn[] {
  const cols: GridColumn[] = [
    { key: "select", label: "", width: 44, freezable: false, reorderable: false },
    { key: "id", label: "Trip ID", width: 140, lockedLeft: true },
    { key: "date", label: "Date", width: 112 },
    { key: "source", label: "Source", width: 128 },
    { key: "assignBy", label: "Assign By", width: 148 },
    { key: "type", label: "Type of Trip", width: 140 },
    { key: "action", label: "Action of Trip", width: 188 },
    { key: "contact", label: "Contact Info", width: 314 },
    { key: "device", label: "Device Info", width: 232 },
    { key: "location", label: "Location", width: 250 },
    { key: "fe", label: "Ninjas", width: 164 },
    { key: "comment", label: "Comment", width: 180 },
  ];
  if (multiStore) cols.push({ key: "store", label: "Store", width: 140 });
  cols.push(
    { key: "ticket", label: "Ticket", width: 120 },
    { key: "status", label: "Status", width: 190 },
    { key: "value", label: "Invoice Value", width: 140 },
    { key: "view", label: "View", width: 72, lockedRight: true },
  );
  return cols;
}

/** Columns whose body is multi-line text → left aligned; everything else centred. */
export const FIELD_LEFT_COLS = new Set(["select", "contact", "device", "location", "assignBy", "fe"]);
/** Cells that own interactive controls and must not trigger the row click. */
export const FIELD_STOP_COLS = new Set(["select", "contact", "location", "status", "ticket", "view", "comment"]);

export interface FieldCellCtx {
  job: FieldJob;
  r: ResolvedFieldRow;
  comment: string;
  store: StoreBranch | null;
  canEditStatus: boolean;
  canViewLocation: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onStatus: (next: FieldJob["status"]) => void;
  onNavigate: (href: string) => void;
}

/* Inherits the cell's alignment: left in left-aligned columns, centred in centred ones. */
const Dash = () => <span className="block text-zinc-300">—</span>;

function fmtDate(date: string, time: string) {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  return { day, time };
}

export function renderFieldCell(key: string, c: FieldCellCtx): React.ReactNode {
  const { job: j, r } = c;
  switch (key) {
    case "id":
      return (
        <div className="text-center leading-tight">
          <p className="whitespace-nowrap font-semibold text-foreground tnum">{j.jobNo}</p>
          {j.leadNo && <p className="whitespace-nowrap text-[11px] font-medium text-zinc-500 tnum">{j.leadNo}</p>}
        </div>
      );
    case "date": {
      const p = fmtDate(j.pickupDate || j.dropDate, j.pickupTime || j.dropTime);
      const delayed = isDelayed(j);
      return p ? (
        <div className={cn("leading-tight", delayed && "font-semibold text-rose-600")} title={`Scheduled trip date · created ${new Date(j.createdAt).toLocaleString("en-IN")}`}>
          <p className="whitespace-nowrap text-[12.5px] font-medium">{p.day}</p>
          {(p.time || j.preferredWindow) && <p className="text-[11px] font-normal text-zinc-500">{j.preferredWindow || p.time}</p>}
        </div>
      ) : <Dash />;
    }
    case "source": {
      const b = classifySource(j.source);
      const label = j.source?.trim() || FIELD_SOURCE_LABEL[b];
      return j.source || b !== "other" ? (
        <span className={cn("flex h-7 w-full min-w-0 items-center rounded-full px-2.5 text-[11px] font-medium ring-1 ring-inset", FIELD_SOURCE_TONE[b])} title={label}>
          <span className="truncate">{label}</span>
        </span>
      ) : <Dash />;
    }
    case "assignBy": {
      const by = j.createdByName || j.salesPersonName;
      return by ? (
        <div className="min-w-0 leading-tight">
          <span className="block truncate font-medium text-zinc-800" title={by}>{by}</span>
          {j.createdByName && j.salesPersonName && j.createdByName !== j.salesPersonName && (
            <span className="block truncate text-[11px] text-zinc-500" title={`Lead owner: ${j.salesPersonName}`}>Sales: {j.salesPersonName}</span>
          )}
        </div>
      ) : <Dash />;
    }
    case "type": {
      const lt = normaliseLeadType(j.leadType);
      return (
        <span className={cn("flex h-7 w-full min-w-0 items-center rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", FIELD_LEAD_TYPE_TONE[lt])}>
          <span className="truncate">{FIELD_LEAD_TYPE_LABEL[lt]}</span>
        </span>
      );
    }
    case "action": {
      const a = fieldTripAction(j);
      return (
        <span className={cn("flex h-7 w-full min-w-0 cursor-default select-none items-center justify-between gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", TRIP_ACTION_TONE_CLASS[a.tone])}
          title={`${a.label} — ${a.reason} (system-derived, read-only)`}>
          <span className="min-w-0 flex-1 truncate">{a.label}</span>
          <Lock className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
        </span>
      );
    }
    case "contact":
      return (
        <div className="min-w-0 leading-tight">
          <button onClick={() => c.onNavigate(j.customerId ? `/contacts?customer=${j.customerId}` : "/contacts")}
            className="block max-w-full truncate text-left font-semibold text-foreground hover:text-[#4361EE]" title="View customer">
            {r.customerName || "—"}
          </button>
          {r.contact && <a href={`tel:${r.contact}`} className="flex items-center gap-1 truncate text-[11px] font-medium text-zinc-600 tnum hover:text-[#4361EE]"><Phone className="h-3 w-3 shrink-0" />{r.contact}</a>}
          {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-1 truncate text-[11px] text-zinc-500 hover:text-[#4361EE]" title={r.email}><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{r.email}</span></a>}
        </div>
      );
    case "device": {
      const devs = tripDevicesOf(j);
      const extra = devs.length - 1;
      const all = devs.map((x, i) => `${i + 1}. ${[x.label, x.issue].filter(Boolean).join(" — ") || "Device"}`).join("\n");
      return (
        <div className="min-w-0 leading-tight" title={devs.length > 1 ? all : undefined}>
          <span className="flex items-center gap-1.5">
            <span className="block min-w-0 truncate font-semibold text-foreground" title={r.model}>{r.model || "N/A"}</span>
            {extra > 0 && <span className="shrink-0 rounded-full bg-[#EEF1FD] px-1.5 py-0.5 text-[10px] font-bold text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">+{extra} more</span>}
          </span>
          {(r.modelDetail || j.issue) && <span className="block truncate text-[11px] font-medium text-zinc-500" title={j.issue}>{j.issue || r.modelDetail}</span>}
          {j.imei && <span className="block truncate text-[11px] text-zinc-400 tnum" title="IMEI / Serial">{j.imei}</span>}
        </div>
      );
    }
    case "location": {
      if (!c.canViewLocation) return <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400"><Lock className="h-3 w-3" /> Restricted</span>;
      const addr = j.pickupAddress || r.customerAddress;
      const url = mapsOpenUrl({ mapsUrl: j.locationMapsUrl, lat: j.locationLat, lng: j.locationLng, address: addr, pincode: j.pincode });
      const hasPin = !!(j.locationMapsUrl || (j.locationLat != null && j.locationLng != null));
      return addr || j.pincode ? (
        <div className="flex min-w-0 items-start gap-1.5 leading-tight">
          <div className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[12.5px] font-medium text-zinc-800" title={addr}>{addr || "—"}</span>
            {j.pincode && <span className="block text-[11px] text-zinc-500 tnum">{j.pincode}</span>}
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" title={hasPin ? "Open saved map location" : "Search this address on the map"}
              aria-label="Open map" className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md transition hover:bg-[#EEF1FD]", hasPin ? "text-[#4361EE]" : "text-zinc-400")}>
              <MapPin className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      ) : <Dash />;
    }
    case "fe": {
      const n = j.ninjaName;
      return n || j.fieldManagerName ? (
        <div className="relative min-w-0 pl-2 leading-tight">
          <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: accentColor(n || j.fieldManagerName) }} />
          <span className="block truncate font-medium text-zinc-800" title={n || j.fieldManagerName}>{n || j.fieldManagerName}</span>
          <span className="block truncate text-[11px] text-zinc-500">
            {n ? (j.dropNinjaName && j.dropNinjaName !== n ? `Drop: ${j.dropNinjaName}` : "Ninja") : "Field Manager"}
          </span>
        </div>
      ) : <span className="text-[12px] italic text-zinc-500">Unassigned</span>;
    }
    case "comment":
      return <TripCommentCell job={j} />;
    case "store":
      return <StoreContextCell store={c.store} mode="stacked" />;
    case "ticket":
      return r.ticket ? (
        <div className="leading-tight">
          <button onClick={() => c.onNavigate(`/tickets/${r.ticket!.id}`)} className="block whitespace-nowrap font-medium text-[#4361EE] hover:underline tnum">{r.ticketNo}</button>
          {r.invoice && <button onClick={() => c.onNavigate(`/invoice/${r.invoice!.id}`)} className="block whitespace-nowrap text-[11px] font-medium text-zinc-500 hover:text-[#4361EE] hover:underline tnum">{r.invoiceId}</button>}
        </div>
      ) : <Dash />;
    case "status":
      return <StatusPill job={j} canEdit={c.canEditStatus} onSelect={c.onStatus} />;
    case "value": {
      const v = tripValue(r);
      if (v.finalized != null) return <span className="whitespace-nowrap font-semibold text-emerald-700 tnum" title="Finalized invoice total">{formatInvoiceAmount(v.finalized)}</span>;
      if (v.pendingAmount != null) {
        return (
          <div className="leading-tight" title="Linked invoice is not finalized — not counted as realised value">
            <span className="block whitespace-nowrap font-medium text-zinc-400 tnum">{formatInvoiceAmount(v.pendingAmount)}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{v.pendingLabel}</span>
          </div>
        );
      }
      return <Dash />;
    }
    case "view":
      return (
        <button onClick={c.onOpen} title="Open trip" aria-label={`Open trip ${j.jobNo}`}
          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
          <Eye className="h-3.5 w-3.5" />
        </button>
      );
    default:
      return null;
  }
}
