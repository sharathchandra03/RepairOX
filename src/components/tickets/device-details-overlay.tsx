"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone } from "lucide-react";
import { useEffect } from "react";
import {
  getTicketDevices,
  formatWarranty,
  STATUS_LABEL,
  PRIORITY_LABEL,
  type Ticket,
  type DeviceRecord,
} from "@/lib/mock-data";
import { parseIssueString } from "@/lib/issue-library";
import { cn, formatINR } from "@/lib/utils";

/** Human-readable labels for the job type saved on device.jobType. */
const JOB_TYPE_LABEL: Record<string, string> = {
  service: "Service",
  accessories: "Accessories",
  warranty: "Warranty",
  estimate: "Repair Estimate",
  buyback: "Buyback",
};

/** Title-case a raw source value (e.g. "walk-in" → "Walk-in", "ref" → "Reference"). */
function formatSource(source?: string): string {
  if (!source) return "";
  const map: Record<string, string> = {
    google: "Google", meta: "Meta", youtube: "YouTube", "walk-in": "Walk-in", ref: "Reference",
  };
  return map[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/* ─── Device Details Overlay ──────────────────────────────────────────────
 * A read-only overlay that surfaces the FULL saved device + issue/service
 * details for a single ticket. Data comes from getTicketDevices(ticket) — the
 * real, saved-from-creation DeviceRecord[] (or a synthesized legacy record).
 * No dummy data, no second source of truth.
 *
 * Mirrors the RepairOX modal language used in ConfirmDialog: dimmed + blurred
 * backdrop, white card panel, thin indigo/border ring, soft shadow, rounded
 * corners. Never touches or resizes the underlying table.
 * ───────────────────────────────────────────────────────────────────────── */

/** One labelled field row inside a details column. Renders nothing when empty
 *  (except when `always` is set) so the panel only shows captured information. */
function Field({ label, value, mono, always }: { label: string; value?: string | null; mono?: boolean; always?: boolean }) {
  const empty = value == null || value === "";
  if (empty && !always) return null;
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="shrink-0 font-medium text-muted-foreground min-w-[84px]">{label}</span>
      <span className={cn("min-w-0 break-words text-foreground", mono && "font-mono text-[11px]")}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function DeviceBlock({ device, index }: { device: DeviceRecord; index: number }) {
  const warranty = formatWarranty(device.warrantyValue, device.warrantyUnit, device.warranty);
  const imeiLabel = device.imeiType === "serial" ? "Serial No." : "IMEI";
  const deviceName = [device.brand, device.model].filter(Boolean).join(" ") || "Unknown Device";
  const issues = parseIssueString(device.issue).join(", ");

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      {/* Device block header — shows the device name once, here only. */}
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-100/70 pb-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
          <Smartphone className="h-4 w-4" />
        </span>
        <p className="min-w-0 truncate text-[13px] font-bold tracking-tight text-foreground">
          Device {index + 1}
          <span className="ml-2 font-medium text-muted-foreground">{deviceName}</span>
        </p>
        {device.priority && device.priority !== "normal" && (
          <span
            className={cn(
              "ml-auto inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
              device.priority === "critical"
                ? "bg-rose-50 text-rose-600 ring-rose-200"
                : "bg-amber-50 text-amber-600 ring-amber-200"
            )}
          >
            {PRIORITY_LABEL[device.priority]}
          </span>
        )}
      </div>

      {/* Two-column layout: Device Details | Service Details */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {/* LEFT — Device Details (identity + intake, no duplicated name row) */}
        <div className="space-y-1.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4361EE]">Device Details</p>
          <Field label="Brand" value={device.brand} always />
          <Field label="Model" value={device.model} always />
          <Field label={imeiLabel} value={device.imei} mono always />
          <Field label="Category" value={device.category} />
          <Field label="Source" value={formatSource(device.source)} />
          <Field label="Technician" value={device.assignedTo} />
          <Field label="Warranty" value={warranty} />
          <Field label="Status" value={STATUS_LABEL[device.status]} />
          <Field label="Priority" value={PRIORITY_LABEL[device.priority]} />
          <Field label="Accessories" value={device.accessories} />
        </div>

        {/* RIGHT — Service Details (job / issue captured during creation) */}
        <div className="space-y-1.5 sm:border-l sm:border-indigo-100/70 sm:pl-6">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4361EE]">Service Details</p>
          <Field label="Issue" value={issues} always />
          <Field label="Job Type" value={JOB_TYPE_LABEL[device.jobType] ?? device.jobType} />
          <Field label="Description" value={device.description} />
          <Field label="Notes" value={device.notes} />
          <Field label="Estimate" value={device.estimate ? formatINR(device.estimate) : undefined} />
        </div>
      </div>
    </div>
  );
}

export function DeviceDetailsOverlay({
  ticket,
  open,
  onClose,
}: {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
}) {
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

  const devices = ticket ? getTicketDevices(ticket) : [];

  return (
    <AnimatePresence>
      {open && ticket && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/40 backdrop-blur-[3px] p-4"
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
            aria-labelledby="device-details-title"
            className="relative my-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-inset ring-[#4361EE]/25"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 id="device-details-title" className="font-display text-base font-bold tracking-tight">
                  Device &amp; Service Details
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {ticket.ticketNo ?? ticket.id} · {ticket.customer}
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
