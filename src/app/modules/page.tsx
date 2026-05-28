"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wrench, Receipt, Package, Tags, ShoppingCart, Banknote, BarChart3, Users2, Settings,
  Filter, MessageSquare, TrendingUp, Target, Inbox, Megaphone, Phone, Mail, UserPlus, Zap,
  MapPin, Truck, ClipboardList, Navigation, Clock, Camera, Route, Map, Briefcase,
  Info, ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { InfoModal, type ModuleFeature } from "@/components/common/info-modal";
import { cn } from "@/lib/utils";

type ModuleAccent = "rose" | "violet" | "sky";

interface ModuleDef {
  id: "shop" | "lead" | "field";
  title: string;
  tagline: string;
  description: string;
  href: string;
  status: "live" | "preview";
  accent: ModuleAccent;
  image: string;
  features: ModuleFeature[];
}

const MODULES: ModuleDef[] = [
  {
    id: "shop",
    title: "Shop Management",
    tagline: "Run your repair shop end-to-end",
    description:
      "Tickets, inventory, invoicing, pricing, walk-ins and buy-back - all in one connected workspace.",
    href: "/dashboard",
    status: "live",
    accent: "rose",
    image: "/module-shop.avif",
    features: [
      { icon: Wrench, label: "Ticket Management", desc: "Create, assign and track repair tickets through every stage." },
      { icon: Package, label: "Inventory Management", desc: "Live spare parts and accessory stock with low-stock alerts." },
      { icon: Receipt, label: "Accounts & Invoice", desc: "GST-ready invoices, payment tracking and reconciliation." },
      { icon: Tags, label: "Price List", desc: "Service pricing per device family with margin presets." },
      { icon: ShoppingCart, label: "Walk-In Counter", desc: "Fast counter sales for accessories and small fixes." },
      { icon: Banknote, label: "Buy-Back", desc: "Quote, accept and re-list customer trade-in devices." },
      { icon: Users2, label: "Contacts CRM", desc: "Customers, businesses and vendors with full repair history." },
      { icon: BarChart3, label: "Reports", desc: "Trend charts, technician productivity, P&L and tax summaries." },
      { icon: Settings, label: "Settings", desc: "Shop, team, integrations and notification preferences." },
    ],
  },
  {
    id: "lead",
    title: "Lead Management",
    tagline: "Convert every enquiry into revenue",
    description:
      "Capture leads from every channel, score them, automate follow-ups and visualise the pipeline end-to-end.",
    href: "/lead-management",
    status: "preview",
    accent: "violet",
    image: "/module-leads.avif",
    features: [
      { icon: Inbox, label: "Multi-channel Inbox", desc: "Calls, WhatsApp, web forms, Meta, Google - one queue." },
      { icon: Filter, label: "Pipeline Kanban", desc: "Drag leads through New → Contacted → Quoted → Won." },
      { icon: Zap, label: "Auto Follow-ups", desc: "Trigger SMS / WhatsApp / email sequences on inactivity." },
      { icon: Target, label: "Lead Scoring", desc: "Score by source, intent signals, response time and budget." },
      { icon: Megaphone, label: "Campaigns & ROI", desc: "Spend, leads, CAC and revenue per channel - Google, Meta, YouTube." },
      { icon: Phone, label: "Click-to-Call", desc: "One-tap call from any lead card with call recording." },
      { icon: UserPlus, label: "Hand-off to Tickets", desc: "Convert a won lead into a Module 1 ticket in one click." },
      { icon: Mail, label: "Quote Templates", desc: "Pre-built quotation drafts for common repair jobs." },
    ],
  },
  {
    id: "field",
    title: "Field Management",
    tagline: "Dispatch, route and track on-site service",
    description:
      "Schedule pickups and on-site jobs, track technicians live on the map, and capture proof of service.",
    href: "/field-management",
    status: "preview",
    accent: "sky",
    image: "/module-field.png",
    features: [
      { icon: ClipboardList, label: "Dispatch Board", desc: "Today's pickups and on-site jobs with technician assignment." },
      { icon: Navigation, label: "Live GPS Tracking", desc: "See where every technician is, in real-time, on the city map." },
      { icon: Route, label: "Route Optimisation", desc: "Auto-batch jobs to minimise travel time and fuel cost." },
      { icon: Camera, label: "Photo Proof", desc: "Before / after device photos with timestamp and geo-tag." },
      { icon: Truck, label: "Pickup Pipeline", desc: "Pickup → In-transit → Received → Job-card created." },
      { icon: Clock, label: "SLA Monitor", desc: "Promised vs actual ETA and on-site duration alerts." },
      { icon: Map, label: "Service Zones", desc: "Pincode-level coverage, surge zones and capacity planning." },
      { icon: Briefcase, label: "Technician Earnings", desc: "Per-job payouts, incentives and performance scorecards." },
    ],
  },
];

export default function ModulesPage() {
  const [activeInfo, setActiveInfo] = useState<ModuleDef | null>(null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(228,30%,95%)]">    
      {/* Decorative bg */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-[#B3BFF6]/20 blur-3xl" />

      {/* Header */}
      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo className="h-9 w-9" />
        <Link
          href="/login"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          Switch account
        </Link>
      </header>

      {/* Title */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-brand-700">
          Welcome back, Shop Owner
        </p>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          Choose a module to <span className="brand-gradient-text">get started</span>
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-zinc-600">
          RepairOX is split into three connected modules. Tap{" "}
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">i</span>{" "}
          on any card to see exactly what&apos;s inside.
        </p>
      </section>

      {/* Module grid */}
      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <ModuleCard
              key={m.id}
              module={m}
              index={i}
              onInfo={() => setActiveInfo(m)}
            />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          You can switch modules any time from inside the app.
        </p>
      </main>

      {activeInfo && (
        <InfoModal
          open={!!activeInfo}
          onClose={() => setActiveInfo(null)}
          eyebrow={`Module ${MODULES.findIndex((x) => x.id === activeInfo.id) + 1}`}
          title={activeInfo.title}
          description={activeInfo.description}
          features={activeInfo.features}
          statusBadge={{
            label: activeInfo.status === "live" ? "Live" : "Preview",
            tone: activeInfo.status,
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- card ---------------------------------- */

function ModuleCard({
  module: m,
  index,
  onInfo,
}: {
  module: ModuleDef;
  index: number;
  onInfo: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-card shadow-card transition-shadow hover:shadow-2xl"
    >
      {/* Top row badges */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
            m.status === "live"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-amber-200"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              m.status === "live" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
            )}
          />
          {m.status === "live" ? "Live" : "Preview"}
        </span>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInfo();
          }}
          aria-label="Show what's inside this module"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-zinc-600 shadow-card ring-1 ring-zinc-200 backdrop-blur transition hover:bg-white hover:text-brand-700"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {/* Hero image */}
      <div className="relative h-64 overflow-hidden">
        <img
          src={m.image}
          alt={m.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ objectPosition: m.id === "field" ? "center top" : "center center" }}
        />
        {/* subtle bottom fade so body text blends cleanly */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/80 to-transparent" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Module {index + 1}
        </p>
        <h3 className="font-display mt-1 text-2xl font-extrabold tracking-tight">{m.title}</h3>
        <p className="mt-1 text-sm font-medium text-zinc-700">{m.tagline}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{m.description}</p>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onInfo}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            View features →
          </button>
          <Link
            href={m.href}
            className="inline-flex items-center gap-1.5 rounded-full brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.03] active:scale-95"
          >
            Open <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
