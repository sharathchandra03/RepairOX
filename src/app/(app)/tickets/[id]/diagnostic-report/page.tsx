"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Diagnostic Report entry page.

   A separate full page (under the (app) shell) reached from the ticket
   quick-action dropdown ("Diagnostic Report"). It shows the REAL ticket's
   number, customer name and device details (READ-ONLY — all from the canonical
   ticket via useStore()), plus an editable "Device Condition" textarea for the
   QC/condition notes typed after the QC check.

   "Create Diagnostic Report" records a lightweight localStorage marker (so View
   Ticket can show "Diagnostic Report generated") and opens the diagnostic print
   URL carrying the typed comment. NOTHING is persisted server-side — the comment
   lives only in the print URL.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Stethoscope, ScrollText } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { Button } from "@/components/ui/button";
import { DetailHero, DetailSection, DetailField } from "@/components/common/detail-page";
import { getTicketDevices, formatDeviceColour } from "@/lib/mock-data";
import { identifierDisplayLabel } from "@/lib/identifier-detection";
import { getDiagnosticReportPrintUrl, DEFAULT_DIAGNOSTIC_TERMS } from "@/lib/print-utils";
import { markDiagnosticReportGenerated } from "@/hooks/use-diagnostic-report";

export default function DiagnosticReportPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = decodeURIComponent((params.id as string) || "");
  const { tickets } = useStore();
  const { can } = usePermissions();
  // Reuse the print capability — no new permission key (plan + requirements).
  const canCreate = allow(can, CAP.ticket.print);

  const ticket = useMemo(() => tickets.find((t) => t.id === ticketId), [tickets, ticketId]);
  const devices = useMemo(() => (ticket ? getTicketDevices(ticket) : []), [ticket]);

  const [comment, setComment] = useState("");
  // Diagnostic-only Terms & Conditions — prefilled with the default, fully
  // editable here; whatever text is submitted prints on the report. Not
  // persisted server-side (travels only via the print URL).
  const [terms, setTerms] = useState(DEFAULT_DIAGNOSTIC_TERMS);

  // ── Ticket not found ──
  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <FileText className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold">Ticket Not Found</h2>
        <p className="text-sm text-muted-foreground">The ticket &ldquo;{ticketId}&rdquo; does not exist or has been deleted.</p>
        <Link href="/tickets">
          <Button variant="outline" size="md"><ArrowLeft className="h-4 w-4" /> Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  // ── No permission ──
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Stethoscope className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold">Not Allowed</h2>
        <p className="text-sm text-muted-foreground">You don&rsquo;t have permission to generate a diagnostic report.</p>
        <Link href={`/tickets/${ticket.id}`}>
          <Button variant="outline" size="md"><ArrowLeft className="h-4 w-4" /> Back to Ticket</Button>
        </Link>
      </div>
    );
  }

  function handleCreate() {
    if (!ticket) return;
    // Record THAT a report was generated (not its content) so View Ticket shows
    // the mention, then open the diagnostic print document carrying the comment.
    markDiagnosticReportGenerated(ticket.id);
    router.push(getDiagnosticReportPrintUrl(ticket.id, comment, terms));
  }

  return (
    <div className="space-y-7 pb-10">
      {/* ─── Header ─── */}
      <DetailHero>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href={`/tickets/${ticket.id}`}>
              <button className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Back to ticket">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#BE123C]">Diagnostic Report</p>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[26px] font-extrabold tracking-tight">{ticket.ticketNo ?? ticket.id}</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-medium text-[#B91C1C] ring-1 ring-inset ring-[#BE123C]/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  QC Failed
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{ticket.customer}</span> &middot; Post-QC device condition
              </p>
            </div>
          </div>
        </div>
      </DetailHero>

      {/* ─── Content ─── */}
      <div className="space-y-6">
        {/* Read-only ticket identity (all from the real ticket) */}
        <DetailSection title="Ticket & Customer" icon={FileText} accent="blue">
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <DetailField label="Ticket Number" value={ticket.ticketNo ?? ticket.id} />
            <DetailField label="Customer Name" value={ticket.customer} />
            {ticket.phone ? <DetailField label="Phone" value={ticket.phone} /> : null}
            {ticket.email ? <DetailField label="Email" value={ticket.email} /> : null}
          </div>
        </DetailSection>

        {/* Read-only device details (all from the real ticket) */}
        <DetailSection title="Device Details" icon={Stethoscope} accent="indigo">
          <div className="space-y-4">
            {devices.map((d, i) => {
              const name = [d.brand, d.model].filter(Boolean).join(" ") || "Device";
              const serialLabel = identifierDisplayLabel(d.imeiType, d.imei);
              const colour = formatDeviceColour(d.deviceColour);
              return (
                <div key={d.id || i} className="rounded-xl border border-border p-4 bg-muted/20">
                  {devices.length > 1 && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                      <span className="text-sm font-semibold text-foreground">{name}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                    {d.brand ? <DetailField label="Brand" value={d.brand} flat /> : null}
                    {d.model ? <DetailField label="Model" value={d.model} flat /> : null}
                    {d.imei ? <DetailField label={serialLabel} value={d.imei} flat /> : null}
                    {colour ? <DetailField label="Colour" value={colour} flat /> : null}
                    {d.issue ? <DetailField label="Issue" value={d.issue} flat /> : null}
                    {d.assignedTo ? <DetailField label="Technician" value={d.assignedTo} flat /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </DetailSection>

        {/* Editable Device Condition — the only input; not persisted */}
        <DetailSection title="Device Condition" icon={Stethoscope} accent="amber">
          <label htmlFor="device-condition" className="mb-2 block text-[11px] font-medium text-muted-foreground">
            Describe the condition / issues found during QC. This appears on the printed diagnostic report.
          </label>
          <textarea
            id="device-condition"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={6}
            placeholder="e.g. Screen has pressure marks, battery health 78%, water-damage indicator triggered, QC failed on display + camera…"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </DetailSection>

        {/* Editable diagnostic-only Terms & Conditions — prefilled with the
            default; whatever is here prints in the report's T&C box. */}
        <DetailSection title="Terms & Conditions" icon={ScrollText} accent="neutral">
          <label htmlFor="diagnostic-terms" className="mb-2 block text-[11px] font-medium text-muted-foreground">
            Terms &amp; Conditions for this diagnostic report. Edit as needed — this exact text prints on the report (shown in place of any price details).
          </label>
          <textarea
            id="diagnostic-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={8}
            placeholder="Enter the terms & conditions to print on the diagnostic report…"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">One line per term. A diagnostic report carries no price or amount details.</p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Link href={`/tickets/${ticket.id}`}>
              <Button variant="outline" size="sm" className="rounded-full">Cancel</Button>
            </Link>
            <Button size="sm" className="rounded-full" onClick={handleCreate}>
              <Stethoscope className="h-3.5 w-3.5" /> Create Diagnostic Report
            </Button>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
