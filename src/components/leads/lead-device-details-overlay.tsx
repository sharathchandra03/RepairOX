"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Device & Issue Details overlay.

   A read-only popup that surfaces every device captured on a Lead. It
   intentionally REUSES the exact RepairOX modal language + layout of the
   Ticket `DeviceDetailsOverlay` and the Walk-In `WalkInDeviceDetailsOverlay`
   (dimmed + blurred backdrop, white card panel, thin indigo ring, one card per
   device titled "Device N", two-column Device Details | Service Details) so
   Leads look identical to Tickets/Walk-Ins.

   A lead captures ONE device today (flat catalog-reference fields), but the
   overlay renders `getLeadDevices(lead)` as an ARRAY — so whether the lead has
   a single device or, in future, multiple, the user always sees this ONE
   consistent popup with a "Device N" card per device.

   Field sourcing (a lead is a pre-sale enquiry — it references the Device
   Catalog, never a duplicate device master):
     • Brand / Model / Category → resolved from the Device Catalog via the
       lead's stored catalog ids (falls back to the cached label / text).
     • Source / Status / Priority → LEAD-LEVEL shared values (not per device).
     • Issue / Issue Category → the captured service details.
   ────────────────────────────────────────────────────────────────────────── */

import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { parseIssueString } from "@/lib/issue-library";
import { getLeadDevices, type Lead, type LeadDevice } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

/** Title-case a raw source value (mirrors the Ticket/Walk-In overlay). */
function formatSource(source?: string): string {
  if (!source) return "";
  const map: Record<string, string> = {
    google: "Google", meta: "Meta", youtube: "YouTube", gmb: "GMB", "walk-in": "Walk-in", ref: "Reference", reference: "Reference",
  };
  return map[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** One labelled field row. Renders "—" for empty always-visible fields so the
 *  panel structure matches the Ticket / Walk-In modal exactly. */
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

/** Resolved display fields for one lead device (catalog + lead level). */
type ResolvedDevice = {
  brand: string;
  model: string;
  category: string;
  source: string;
  status: string;
  priority: string;
  issue: string;
  issueCategory: string;
};

function DeviceBlock({ resolved, index }: { resolved: ResolvedDevice; index: number }) {
  const issues = parseIssueString(resolved.issue).join(", ");
  const deviceName = [resolved.brand, resolved.model].filter(Boolean).join(" ") || "Unknown Device";

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
          <Field label="Brand" value={resolved.brand} always />
          <Field label="Model" value={resolved.model} always />
          <Field label="Category" value={resolved.category} />
          <Field label="Source" value={formatSource(resolved.source)} />
          <Field label="Status" value={resolved.status} />
          <Field label="Priority" value={resolved.priority} />
        </div>

        {/* RIGHT — Service Details */}
        <div className="space-y-1.5 sm:border-l sm:border-indigo-100/70 sm:pl-6">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4361EE]">Service Details</p>
          <Field label="Issue" value={issues} always />
          <Field label="Issue Category" value={resolved.issueCategory} />
        </div>
      </div>
    </div>
  );
}

export function LeadDeviceDetailsOverlay({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  const { categories, brands, models } = useCatalog();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Resolve each device's display fields from the Device Catalog (by id, else
  // by exact name match), falling back to the lead's cached label. Source /
  // Status / Priority are LEAD-level shared values.
  const devices = useMemo<ResolvedDevice[]>(() => {
    if (!lead) return [];
    const raw: LeadDevice[] = getLeadDevices(lead);
    return raw.map((d) => {
      const modelRec = d.modelId
        ? models.find((m) => m.id === d.modelId)
        : (d.label ? models.find((m) => d.label.toLowerCase().includes(m.name.toLowerCase())) : undefined);
      const brandRec = d.brandId
        ? brands.find((b) => b.id === d.brandId)
        : (modelRec ? brands.find((b) => b.id === modelRec.brandId) : undefined);
      const catRec = d.categoryId
        ? categories.find((c) => c.id === d.categoryId)
        : (modelRec ? categories.find((c) => c.id === modelRec.categoryId) : undefined);
      const brand = brandRec?.name || "";
      const model = modelRec?.name || "";
      // When the catalog can't resolve a brand/model, surface the cached label
      // so the popup is never empty for a lead that has a free-text device.
      const label = d.label || "";
      return {
        brand: brand || (!model ? label : ""),
        model,
        category: catRec?.name || "",
        source: lead.source || "",
        status: lead.status || "",
        priority: lead.priority || "",
        issue: d.issue || "",
        issueCategory: d.category || "",
      };
    });
  }, [lead, categories, brands, models]);

  return (
    <AnimatePresence>
      {open && lead && (
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
            aria-labelledby="lead-device-details-title"
            className="relative my-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-inset ring-[#4361EE]/25"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 id="lead-device-details-title" className="font-display text-base font-bold tracking-tight">
                  Device &amp; Issue Details
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {(lead.leadNo || lead.id)}{lead.name ? ` · ${lead.name}` : ""}
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
                devices.map((d, idx) => <DeviceBlock key={idx} resolved={d} index={idx} />)
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
