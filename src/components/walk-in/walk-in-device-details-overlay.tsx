"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Device & Service Details overlay.

   A read-only overlay that surfaces every device captured on a Walk-In visit.
   It intentionally REUSES the exact RepairOX modal language + layout of the
   Ticket `DeviceDetailsOverlay` (dimmed + blurred backdrop, white card panel,
   thin indigo ring, one card per device titled "Device N", two-column
   Device Details | Service Details) so Walk-In and Ticket look identical
   (spec §17/§18/§46). Data comes from `getWalkInDevices(walkIn)` — the real
   saved devices, or a synthesized Device 1 for legacy single-device rows
   (spec §32).

   Field sourcing (a Walk-In is a pre-repair enquiry, so some ticket-level
   fields are resolved rather than stored per device):
     • Brand / Category → resolved from the device catalog via the device's
       modelId (falls back to any stored brand/category text).
     • Source / Status  → WALK-IN-LEVEL (shared, never per device — spec §5/§21/§22).
     • Priority / Job Type → sensible enquiry defaults (Normal / Service) unless
       the device carries an explicit value.
   ────────────────────────────────────────────────────────────────────────── */

import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone } from "lucide-react";
import { useEffect } from "react";
import {
  getWalkInDevices,
  WALKIN_STATUS_LABEL,
  type WalkIn,
  type WalkInDevice,
} from "@/lib/mock-data";
import { walkInDisplayId } from "@/lib/walk-in-data";
import { parseIssueString } from "@/lib/issue-library";
import { categoryLabel } from "@/lib/device-categories";
import { colourLabel } from "@/lib/device-colours";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Job-type labels (mirrors the Ticket overlay). */
const JOB_TYPE_LABEL: Record<string, string> = {
  service: "Service",
  accessories: "Accessories",
  warranty: "Warranty",
  estimate: "Repair Estimate",
  buyback: "Buyback",
};

/** Title-case a raw source value (mirrors the Ticket overlay). */
function formatSource(source?: string): string {
  if (!source) return "";
  const map: Record<string, string> = {
    google: "Google", meta: "Meta", youtube: "YouTube", gmb: "GMB", "walk-in": "Walk-in", ref: "Reference",
  };
  return map[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** One labelled field row. Renders "—" when empty but always-visible fields are
 *  kept so the panel structure matches the Ticket modal exactly. */
function Field({ label, value, mono, always }: { label: string; value?: string | null; mono?: boolean; always?: boolean }) {
  const empty = value == null || value === "";
  if (empty && !always) return null;
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="min-w-[84px] shrink-0 font-medium text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-words text-foreground", mono && "font-mono text-[11px]")}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

/** Resolved display fields for one Walk-In device (catalog + walk-in level). */
type ResolvedDevice = {
  brand: string;
  model: string;
  imei: string;
  imeiLabel: string;
  category: string;
  deviceColour: string;
  source: string;
  status: string;
  priority: string;
  issue: string;
  jobType: string;
};

function DeviceBlock({ device, index }: { device: WalkInDevice & { _resolved: ResolvedDevice }; index: number }) {
  const r = device._resolved;
  const issues = parseIssueString(r.issue).join(", ");
  const deviceName = [r.brand, r.model].filter(Boolean).join(" ") || "Unknown Device";

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      {/* Device block header — shows Brand + Model once, here only. */}
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-100/70 pb-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
          <Smartphone className="h-4 w-4" />
        </span>
        <p className="min-w-0 truncate text-[13px] font-bold tracking-tight text-foreground">
          Device {index + 1}
          <span className="ml-2 font-medium text-muted-foreground">{deviceName}</span>
        </p>
      </div>

      {/* Two-column layout: Device Details | Service Details */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {/* LEFT — Device Details */}
        <div className="space-y-1.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4361EE]">Device Details</p>
          <Field label="Brand" value={r.brand} always />
          <Field label="Model" value={r.model} always />
          <Field label={r.imeiLabel} value={r.imei} mono always />
          <Field label="Category" value={r.category} />
          <Field label="Device Colour" value={r.deviceColour} />
          <Field label="Source" value={formatSource(r.source)} />
          <Field label="Status" value={r.status} />
          <Field label="Priority" value={r.priority} />
        </div>

        {/* RIGHT — Service Details */}
        <div className="space-y-1.5 sm:border-l sm:border-indigo-100/70 sm:pl-6">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4361EE]">Service Details</p>
          <Field label="Issue" value={issues} always />
          <Field label="Job Type" value={JOB_TYPE_LABEL[r.jobType] ?? r.jobType} />
        </div>
      </div>
    </div>
  );
}

export function WalkInDeviceDetailsOverlay({
  walkIn,
  open,
  onClose,
}: {
  walkIn: WalkIn | null;
  open: boolean;
  onClose: () => void;
}) {
  const { deviceModels, brands } = useStore();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const rawDevices = walkIn ? getWalkInDevices(walkIn) : [];

  // Resolve each device's display fields once. Brand + Category come from the
  // catalog (via modelId, else exact model-name match); Source + Status are
  // walk-in-level shared values; Priority / Job Type use enquiry defaults.
  const walkInStatusLabel = walkIn ? (WALKIN_STATUS_LABEL[walkIn.status] ?? "") : "";
  const devices = rawDevices.map((d) => {
    const modelRec = d.modelId
      ? deviceModels.find((m) => m.id === d.modelId)
      : (d.model ? deviceModels.find((m) => m.name.toLowerCase() === d.model.toLowerCase()) : undefined);
    const brandRec = d.brandId
      ? brands.find((b) => b.id === d.brandId)
      : (modelRec ? brands.find((b) => b.id === modelRec.brandId) : undefined);
    const category = d.category || modelRec?.categoryId || "";
    const resolved: ResolvedDevice = {
      // Prefer stored brand text (carried from a Ticket) → catalog brand → blank.
      brand: d.brand || brandRec?.name || "",
      model: d.model || "",
      imei: d.imei || "",
      imeiLabel: d.imeiType === "serial" ? "Serial No." : "IMEI",
      category: category ? categoryLabel(category) : "",
      deviceColour: d.deviceColour ? colourLabel(d.deviceColour) : "",
      source: walkIn?.source || "",
      status: walkInStatusLabel,
      priority: "Normal",
      issue: d.issue || "",
      jobType: "service",
    };
    return { ...d, _resolved: resolved };
  });

  return (
    <AnimatePresence>
      {open && walkIn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-[3px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="walkin-device-details-title"
            className="relative my-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-inset ring-[#4361EE]/25"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 id="walkin-device-details-title" className="font-display text-base font-bold tracking-tight">
                  Device &amp; Service Details
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {walkInDisplayId(walkIn)} · {walkIn.customer}
                  {devices.length > 1 ? ` · ${devices.length} devices` : ""}
                </p>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body — one card per device */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-indigo-50/20 p-4">
              {devices.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No device information captured.</p>
              ) : (
                devices.map((device, idx) => (
                  <DeviceBlock key={device.id || idx} device={device} index={idx} />
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
