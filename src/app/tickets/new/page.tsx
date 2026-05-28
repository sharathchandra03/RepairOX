"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Camera, Image as ImageIcon, FileSignature, ShieldCheck,
  CheckCircle2, XCircle, MinusCircle, Mail, Phone, MessageCircle,
  Printer, FileText, Plus, Search, User, Building2, Sparkles, ListPlus,
  Upload, ArrowLeft, RotateCcw,
} from "lucide-react";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { OptionGrid } from "@/components/wizard/option-grid";
import { CategoryWheel } from "@/components/wizard/category-wheel";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn, formatINR } from "@/lib/utils";

/* ---------------- Step content data ---------------- */

const PROCESSES = [
  { id: "ticket", label: "New Ticket", emoji: "🧰", desc: "Repair job intake" },
  { id: "invoice", label: "New Invoice", emoji: "🧾", desc: "Bill on the spot" },
  { id: "stock", label: "Add Stock", emoji: "📦", desc: "Inbound inventory" },
  { id: "walkin", label: "Walk-In", emoji: "🏪", desc: "Counter customer" },
  { id: "estimate", label: "Estimate", emoji: "💵", desc: "Send a quote" },
  { id: "warranty", label: "Warranty", emoji: "🛡️", desc: "Claim or check" },
];

const CATEGORIES = [
  { id: "iphone", label: "iPhone", emoji: "📱" },
  { id: "macbook", label: "MacBook", emoji: "💻" },
  { id: "ipad", label: "iPad", emoji: "📲" },
  { id: "iwatch", label: "iWatch", emoji: "⌚" },
  { id: "imac", label: "iMac", emoji: "🖥️" },
  { id: "android", label: "Android", emoji: "📱" },
  { id: "windows", label: "Windows", emoji: "💻" },
  { id: "others", label: "Others", emoji: "🧩" },
];

const QC_FIELDS = [
  "Physical Condition", "Display", "Touch Panel", "Back Glass",
  "Display Sensor", "Touch ID / Face ID", "Receiver", "Speaker",
  "Microphone", "Battery Health", "Front Camera", "Back Camera",
  "Charging Port", "Volume Keys", "Power Key", "Bluetooth / WiFi",
  "Network", "Vibration",
];

/* ---------------- Component ---------------- */

type WizardData = {
  process?: string;
  category?: string;
  device: { model: string; imei: string; password: string; issue: string; assignedBy: string; assignedTo: string; source: string; type: string; estimate: string; description: string; notes: string };
  parts: { name: string; price: number }[];
  contactType: "personal" | "business";
  customer: { first: string; last: string; phone: string; email: string; address: string; postal: string; city: string };
  qc: Record<string, "ok" | "no" | "na" | undefined>;
  files: string[];
  signatureCleared: boolean;
};

const DEFAULT: WizardData = {
  device: { model: "", imei: "", password: "", issue: "", assignedBy: "", assignedTo: "", source: "", type: "", estimate: "", description: "", notes: "" },
  parts: [],
  contactType: "personal",
  customer: { first: "", last: "", phone: "", email: "", address: "", postal: "", city: "" },
  qc: {},
  files: [],
  signatureCleared: false,
};

export default function NewTicketWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT);
  const [submitted, setSubmitted] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, 10));
  const back = () => (step === 1 ? router.push("/dashboard") : setStep((s) => Math.max(1, s - 1)));

  if (submitted) return <ThankYou onPrint={() => router.push("/dashboard")} />;

  return (
    <WizardShell
      step={step}
      onBack={back}
      title={titleFor(step)}
      subtitle={subtitleFor(step)}
    >
      <div className={cn("mx-auto", step === 2 ? "max-w-5xl" : "max-w-3xl")}>
        {step === 1 && (
          <OptionGrid
            options={PROCESSES}
            value={data.process}
            onChange={(id) => { setData({ ...data, process: id }); setTimeout(next, 180); }}
            cols={3}
          />
        )}

        {step === 2 && (
          <CategoryWheel
            value={data.category}
            onChange={(id) => setData({ ...data, category: id })}
            onNext={next}
          />
        )}

        {step === 3 && <DeviceForm data={data} setData={setData} onNext={next} />}

        {step === 4 && <PartsAssignment data={data} setData={setData} onNext={next} />}

        {step === 5 && <ContactSearch data={data} setData={setData} onNext={next} />}

        {step === 6 && <CustomerForm data={data} setData={setData} onNext={next} />}

        {step === 7 && <QuoteSummary data={data} onNext={next} />}

        {step === 8 && <QCForm data={data} setData={setData} onNext={next} />}

        {step === 9 && <UploadStep data={data} setData={setData} onNext={next} />}

        {step === 10 && <SignatureStep onSubmit={() => setSubmitted(true)} />}
      </div>
    </WizardShell>
  );
}

/* ---------------- Helpers ---------------- */
function titleFor(step: number) {
  return [
    "Select Your Process",
    "Select Your Category",
    "Device Details",
    "Assign Items / Parts to Service",
    "Search Contact",
    "Customer Information",
    "Quotation Summary",
    "Pre-Quality Check",
    "Upload Photos & Documents",
    "Customer Signature",
  ][step - 1];
}
function subtitleFor(step: number) {
  return [
    "Pick what you’re creating today.",
    "What kind of device is it?",
    "Capture identifiers, fault and assignments.",
    "Add spare parts and services consumed.",
    "Find an existing contact, or add a new one.",
    "Make sure the customer details are correct.",
    "Review the estimate before approval.",
    "Tick the visible condition checkpoints.",
    "Attach device photos and any paperwork.",
    "Capture the customer signature to confirm.",
  ][step - 1];
}

/* ---------------- Step 3: Device ---------------- */
function DeviceForm({ data, setData, onNext }: any) {
  const d = data.device;
  const set = (k: string, v: string) => setData({ ...data, device: { ...d, [k]: v } });
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Model"><Input value={d.model} onChange={(e: any) => set("model", e.target.value)} placeholder="e.g. iPhone 15 Pro Max" /></Field>
        <Field label="IMEI / Serial Number"><Input value={d.imei} onChange={(e: any) => set("imei", e.target.value)} placeholder="356xxxxxxxxxx" /></Field>
        <Field label="Password / Pattern"><Input value={d.password} onChange={(e: any) => set("password", e.target.value)} placeholder="If shared by customer" /></Field>
        <Field label="Issue"><Input value={d.issue} onChange={(e: any) => set("issue", e.target.value)} placeholder="Display not working" /></Field>
        <Field label="Assigned by"><Input value={d.assignedBy} onChange={(e: any) => set("assignedBy", e.target.value)} placeholder="Front desk" /></Field>
        <Field label="Assigned to">
          <Select
            value={d.assignedTo}
            onChange={(e: any) => set("assignedTo", e.target.value)}
            options={[
              { label: "Select technician", value: "" },
              { label: "Anand · L2 Mobile", value: "anand" },
              { label: "Pooja · Logic-board", value: "pooja" },
              { label: "Vikas · Watch & iPad", value: "vikas" },
            ]}
          />
        </Field>
        <Field label="Source">
          <Select
            value={d.source}
            onChange={(e: any) => set("source", e.target.value)}
            options={[
              { label: "Select source", value: "" },
              { label: "Google", value: "google" },
              { label: "Meta", value: "meta" },
              { label: "YouTube", value: "youtube" },
              { label: "Walk-in", value: "walk-in" },
              { label: "Reference", value: "ref" },
            ]}
          />
        </Field>
        <Field label="Type">
          <Select
            value={d.type}
            onChange={(e: any) => set("type", e.target.value)}
            options={[
              { label: "Select type", value: "" },
              { label: "Walk-In", value: "walkin" },
              { label: "Pick-Up", value: "pickup" },
              { label: "On-Site", value: "onsite" },
            ]}
          />
        </Field>
        <Field label="Estimate (₹)"><Input type="number" value={d.estimate} onChange={(e: any) => set("estimate", e.target.value)} placeholder="0" /></Field>
        <div className="md:col-span-2"><Field label="Problem description"><Textarea value={d.description} onChange={(e: any) => set("description", e.target.value)} placeholder="Customer reported intermittent reboots when charging…" /></Field></div>
        <div className="md:col-span-2"><Field label="Internal notes"><Textarea value={d.notes} onChange={(e: any) => set("notes", e.target.value)} placeholder="Visible water damage on bottom left" /></Field></div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- Step 4: Parts ---------------- */
function PartsAssignment({ data, setData, onNext }: any) {
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const total = data.parts.reduce((s: number, p: any) => s + Number(p.price || 0), 0);

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto]">
        <Field label="Item / part"><Input value={item} onChange={(e: any) => setItem(e.target.value)} placeholder="OLED display assembly" /></Field>
        <Field label="Price"><Input type="number" value={price} onChange={(e: any) => setPrice(e.target.value)} placeholder="0" /></Field>
        <div className="flex items-end">
          <Button
            disabled={!item}
            onClick={() => { setData({ ...data, parts: [...data.parts, { name: item, price: Number(price || 0) }] }); setItem(""); setPrice(""); }}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
        <AnimatePresence initial={false}>
          {data.parts.map((p: any, i: number) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">{p.name}</span>
              <span className="tnum text-muted-foreground">{formatINR(Number(p.price))}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {data.parts.length === 0 && (
          <li className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
            <ListPlus className="mr-2 h-4 w-4" /> No parts added yet - you can skip this step.
          </li>
        )}
      </ul>

      <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Estimated total: </span>
          <span className="font-semibold tnum">{formatINR(total)}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={onNext}>Skip</Button>
          <Button size="lg" onClick={onNext}>Continue <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 5: Contact Search ---------------- */
function ContactSearch({ data, setData, onNext }: any) {
  const [q, setQ] = useState("");
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="flex flex-col items-center">
        <SegmentedTabs
          value={data.contactType}
          onChange={(v) => setData({ ...data, contactType: v })}
          options={[
            { label: "Personal", value: "personal" },
            { label: "Business", value: "business" },
          ]}
        />
        <div className="mt-6 w-full max-w-md">
          <Input
            value={q}
            onChange={(e: any) => setQ(e.target.value)}
            placeholder={data.contactType === "personal" ? "Search by name or phone…" : "Search by company name or GSTIN…"}
            iconLeft={<Search className="h-4 w-4" />}
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {data.contactType === "personal" ? <User className="inline h-3 w-3 mr-1" /> : <Building2 className="inline h-3 w-3 mr-1" />}
            We&apos;ll auto-fill the next step if we find a match.
          </p>
        </div>

        <div className="mt-6 flex w-full max-w-md flex-col gap-2">
          <Button variant="outline" size="lg" onClick={onNext}>Add New</Button>
          <Button size="lg" onClick={onNext}>Use this contact <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 6: Customer ---------------- */
function CustomerForm({ data, setData, onNext }: any) {
  const c = data.customer;
  const set = (k: string, v: string) => setData({ ...data, customer: { ...c, [k]: v } });
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="First name"><Input value={c.first} onChange={(e: any) => set("first", e.target.value)} placeholder="Rahul" /></Field>
        <Field label="Last name"><Input value={c.last} onChange={(e: any) => set("last", e.target.value)} placeholder="Kapoor" /></Field>
        <Field label="Contact number"><Input value={c.phone} onChange={(e: any) => set("phone", e.target.value)} iconLeft={<Phone className="h-4 w-4" />} placeholder="+91 …" /></Field>
        <Field label="E-mail ID"><Input value={c.email} onChange={(e: any) => set("email", e.target.value)} iconLeft={<Mail className="h-4 w-4" />} placeholder="rahul@email.com" /></Field>
        <div className="md:col-span-2"><Field label="Address"><Input value={c.address} onChange={(e: any) => set("address", e.target.value)} placeholder="House / Street / Locality" /></Field></div>
        <Field label="Postal code"><Input value={c.postal} onChange={(e: any) => set("postal", e.target.value)} /></Field>
        <Field label="City"><Input value={c.city} onChange={(e: any) => set("city", e.target.value)} /></Field>
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- Step 7: Quote ---------------- */
function QuoteSummary({ data, onNext }: any) {
  const partsTotal = data.parts.reduce((s: number, p: any) => s + Number(p.price || 0), 0);
  const labour = 499;
  const tax = Math.round(partsTotal * 0.18);
  const total = partsTotal + labour + tax;
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
        {/* Line items */}
        <div className="rounded-2xl border border-border">
          <div className="grid grid-cols-3 bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Description</div><div className="text-center">Qty</div><div className="text-right">Amount</div>
          </div>
          {data.parts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No parts added - quotation will reflect labour only.</div>
          ) : data.parts.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-3 px-4 py-3 text-sm odd:bg-background even:bg-muted/30">
              <div>{p.name}</div>
              <div className="text-center">1</div>
              <div className="text-right tnum">{formatINR(Number(p.price))}</div>
            </div>
          ))}
          <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border">
            <div>Labour & Diagnostics</div><div className="text-center">1</div><div className="text-right tnum">{formatINR(labour)}</div>
          </div>
          <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border">
            <div>GST (18%)</div><div className="text-center">-</div><div className="text-right tnum">{formatINR(tax)}</div>
          </div>
        </div>

        {/* Totals card */}
        <div className="rounded-2xl border border-border bg-gradient-to-b from-indigo-50/60 to-white p-5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Customer pays</p>
          <p className="font-display mt-1 text-3xl font-extrabold brand-gradient-text">{formatINR(total)}</p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <Row k="Sub-total (parts)" v={formatINR(partsTotal)} />
            <Row k="Labour" v={formatINR(labour)} />
            <Row k="Tax" v={formatINR(tax)} />
            <Row k="Total" v={formatINR(total)} bold />
          </ul>
          <Button size="lg" className="mt-4 w-full" onClick={onNext}>
            Approve Quote <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Customer will be asked to sign at the end of this flow.
          </p>
        </div>
      </div>
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-semibold")}>{k}</span>
      <span className={cn("tnum", bold && "font-semibold")}>{v}</span>
    </li>
  );
}

/* ---------------- Step 8: QC ---------------- */
function QCForm({ data, setData, onNext }: any) {
  const set = (k: string, v: "ok" | "no" | "na") => setData({ ...data, qc: { ...data.qc, [k]: v } });
  const left = QC_FIELDS.slice(0, 9);
  const right = QC_FIELDS.slice(9);
  const completed = Object.keys(data.qc).length;
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="violet" dot>Inspection</Badge>
        <span className="text-xs text-muted-foreground">{completed}/{QC_FIELDS.length} marked</span>
      </div>
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        {[left, right].map((col, ci) => (
          <ul key={ci} className="space-y-2">
            {col.map((label) => (
              <li key={label} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-1">
                  {(["ok","no","na"] as const).map((v) => {
                    const active = data.qc[label] === v;
                    const tone =
                      v === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                      v === "no" ? "bg-rose-50 text-rose-700 ring-rose-200" :
                                   "bg-zinc-50 text-zinc-700 ring-zinc-200";
                    const Icon = v === "ok" ? CheckCircle2 : v === "no" ? XCircle : MinusCircle;
                    return (
                      <button
                        key={v}
                        onClick={() => set(label, v)}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset transition",
                          active ? tone : "bg-card text-muted-foreground ring-border hover:bg-muted",
                        )}
                        aria-label={`${label}: ${v}`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" size="lg" onClick={() => setData({ ...data, qc: {} })}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
        <Button size="lg" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- Step 9: Upload ---------------- */
function UploadStep({ data, setData, onNext }: any) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { id: "camera", label: "Camera", icon: Camera, desc: "Open camera to capture device shots" },
          { id: "gallery", label: "Gallery", icon: ImageIcon, desc: "Pick existing photos from device" },
        ].map((s, i) => (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            onClick={() => setData({ ...data, files: [...data.files, `${s.id}-${Date.now()}.jpg`] })}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-b from-indigo-50/40 to-white p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-200"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-white text-brand-700 shadow-card">
              <s.icon className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="font-display text-lg font-bold">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
            <Upload className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </motion.button>
        ))}
      </div>

      {/* Files */}
      <div className="mt-5">
        <p className="text-xs font-medium text-muted-foreground">Attached files</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.files.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No files yet - add photos or documents above.
            </div>
          ) : data.files.map((f: string, i: number) => (
            <motion.div
              key={f + i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="aspect-[4/3] rounded-xl border border-border bg-gradient-to-br from-indigo-100/50 to-white p-2 shadow-card"
            >
              <div className="flex h-full items-end justify-between rounded-lg border border-border bg-white p-2">
                <span className="truncate text-[10px] text-muted-foreground">{f}</span>
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={onNext}>Upload & Continue <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- Step 10: Signature ---------------- */
function SignatureStep({ onSubmit }: { onSubmit: () => void }) {
  const [signed, setSigned] = useState(false);
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
      <p className="text-center text-sm text-muted-foreground">
        By signing below the customer agrees to the diagnosis, estimate and our service terms.
      </p>

      {/* Pad */}
      <div
        onClick={() => setSigned(true)}
        className={cn(
          "relative mt-5 grid h-[260px] cursor-crosshair place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-gradient-to-b from-indigo-50/40 to-white transition",
          signed ? "border-indigo-300" : "border-border"
        )}
      >
        {!signed ? (
          <div className="text-center text-muted-foreground">
            <FileSignature className="mx-auto h-10 w-10" />
            <p className="mt-2 text-sm">Tap & sign here</p>
          </div>
        ) : (
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            viewBox="0 0 400 120"
            className="h-32 w-[80%] text-brand-700"
            fill="none"
          >
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9 }}
              d="M10 90 C 60 30, 90 110, 130 50 S 220 110, 260 60 S 340 100, 390 50"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </motion.svg>
        )}
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">
          x ─────────────── customer signature
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="outline" onClick={() => setSigned(false)}>
          <RotateCcw className="h-4 w-4" /> Clear
        </Button>
        <Button size="lg" onClick={onSubmit} disabled={!signed}>
          <ShieldCheck className="h-4 w-4" /> Submit & finalise
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Thank you ---------------- */
function ThankYou({ onPrint }: { onPrint: () => void }) {
  const [format, setFormat] = useState<"a4" | "thermal">("a4");
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white via-indigo-50/30 to-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-25" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-10 text-center sm:px-6">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="grid h-20 w-20 place-items-center rounded-full brand-gradient text-white shadow-glow"
        >
          <CheckCircle2 className="h-10 w-10" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-display mt-6 text-4xl font-extrabold tracking-tight md:text-5xl"
        >
          Thank you! <span className="brand-gradient-text">Ticket created.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-2 max-w-md text-sm text-muted-foreground"
        >
          A confirmation has been queued for SMS, WhatsApp and email. Choose how you&apos;d like to print or share the receipt.
        </motion.p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { id: "a4", label: "A4 Receipt", desc: "Best for filing & email" },
            { id: "thermal", label: "Thermal Receipt", desc: "Quick counter print" },
          ].map((p) => {
            const active = format === (p.id as any);
            return (
              <motion.button
                key={p.id}
                whileHover={{ y: -2 }}
                onClick={() => setFormat(p.id as any)}
                className={cn(
                  "rounded-2xl border bg-card p-5 text-left shadow-card transition",
                  active ? "border-indigo-300 ring-2 ring-indigo-200/70" : "border-border"
                )}
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-brand-700 ring-1 ring-brand-200">
                  <Printer className="h-5 w-5" />
                </span>
                <p className="font-display mt-3 text-lg font-bold">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <Button variant="outline" size="lg" className="flex-1">
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Share on WhatsApp
          </Button>
          <Button variant="outline" size="lg" className="flex-1">
            <Mail className="h-4 w-4 text-indigo-600" /> Share on Email
          </Button>
        </div>
        <Button size="xl" className="mt-3 w-full max-w-md" onClick={onPrint}>
          <Printer className="h-4 w-4" /> Print Ticket
        </Button>

        <button onClick={onPrint} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </button>
      </div>
    </div>
  );
}
