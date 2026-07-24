"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft, FileText, Receipt, Tag } from "lucide-react";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import {
  buildTicketPrintData,
  buildInvoicePrintData,
  type PrintFormat,
  type PrintDocumentData,
} from "@/lib/print-utils";
import { A4Template } from "@/components/print/a4-template";
import { ThermalTemplate } from "@/components/print/thermal-template";
import { LabelTemplate } from "@/components/print/label-template";

/* ─── Format Selector ────────────────────────────────────────────────── */

const FORMAT_OPTIONS: { id: PrintFormat; label: string; icon: any; desc: string }[] = [
  { id: "a4", label: "A4 Print", icon: FileText, desc: "Full page professional document" },
  { id: "thermal", label: "Thermal", icon: Receipt, desc: "Receipt printer format" },
  { id: "label", label: "Label", icon: Tag, desc: "Compact tag for devices" },
];

function FormatSelector({
  format,
  setFormat,
  isTicket,
}: {
  format: PrintFormat;
  setFormat: (f: PrintFormat) => void;
  isTicket: boolean;
}) {
  const options = isTicket ? FORMAT_OPTIONS : FORMAT_OPTIONS.filter((o) => o.id !== "label");

  return (
    <div className="flex items-center gap-1.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = format === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setFormat(opt.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-[#4361EE] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Helper: read format from URL ───────────────────────────────────── */

function getFormatFromUrl(): PrintFormat {
  if (typeof window === "undefined") return "a4";
  const params = new URLSearchParams(window.location.search);
  return (params.get("format") as PrintFormat) || "a4";
}

function getAutoFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("auto") === "1";
}

/* ─── Page Component ─────────────────────────────────────────────────── */

export default function PrintPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const { tickets, invoices } = useStore();
  const { settings, hydrated } = useStoreSettings();

  const docType = (params.type as string) || "";
  const docId = decodeURIComponent((params.id as string) || "");

  const [format, setFormat] = useState<PrintFormat>(getFormatFromUrl);
  const [mounted, setMounted] = useState(false);

  const isTicket = docType === "ticket";

  // Wait for client mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Build print data (only after mount AND settings hydrated)
  const printData: PrintDocumentData | null = useMemo(() => {
    if (!mounted || !hydrated || !docId) return null;
    if (isTicket) {
      const ticket = tickets.find((t) => t.id === docId);
      if (!ticket) return null;
      return buildTicketPrintData(settings, ticket);
    } else {
      const invoice = invoices.find((i) => i.id === docId);
      if (!invoice) return null;
      return buildInvoicePrintData(settings, invoice);
    }
  }, [mounted, hydrated, isTicket, docId, tickets, invoices, settings]);

  // Auto-print if query param is set
  useEffect(() => {
    if (mounted && printData && getAutoFromUrl()) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [mounted, printData]);

  // If label format selected on invoice, switch to a4
  useEffect(() => {
    if (!isTicket && format === "label") {
      setFormat("a4");
    }
  }, [isTicket, format]);

  // Loading state while mounting
  if (!mounted || !hydrated) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: "#f3f4f6" }}>
        <div className="h-8 w-8 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" />
      </div>
    );
  }

  // Document not found
  if (!printData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#f3f4f6" }}>
        <div style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: 16, background: "#fff", color: "#9ca3af", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <FileText style={{ width: 32, height: 32 }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1f2937" }}>Document Not Found</h2>
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          The {docType} &ldquo;{docId}&rdquo; does not exist or has been deleted.
        </p>
        <button
          onClick={() => router.back()}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, background: "#4361EE", padding: "8px 16px", fontSize: 14, fontWeight: 500, color: "#fff", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} /> Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="print-page-wrapper">
      {/* ── Control Bar (hidden when printing) ── */}
      <div className="print-hide" style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff", borderBottom: "1px solid #e5e7eb", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => router.back()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 500, color: "#4b5563", cursor: "pointer" }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} /> Back
            </button>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>
                Print Preview &mdash; {printData.printTitle}
              </p>
              <p style={{ fontSize: 11, color: "#6b7280" }}>#{docId}</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FormatSelector format={format} setFormat={setFormat} isTicket={isTicket} />
            <button
              onClick={() => window.print()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, background: "#4361EE", padding: "8px 16px", fontSize: 14, fontWeight: 500, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
            >
              <Printer style={{ width: 16, height: 16 }} /> Print
            </button>
          </div>
        </div>
      </div>

      {/* ── Template Preview Area ── */}
      <div className="print-area">
        {format === "a4" && <A4Template data={printData} />}
        {format === "thermal" && <ThermalTemplate data={printData} />}
        {format === "label" && <LabelTemplate data={printData} />}
      </div>
    </div>
  );
}
