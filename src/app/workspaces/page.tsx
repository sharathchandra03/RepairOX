"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Inbox, Filter, Zap, Target, Megaphone, Phone, UserPlus, Mail,
  Wrench, Package, Receipt, Tags, ShoppingCart, Banknote, Users2, BarChart3, Settings,
  Boxes, Truck, ClipboardList, ArrowLeftRight, Tag,
  Info, ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { InfoModal, type ModuleFeature } from "@/components/common/info-modal";
import { cn } from "@/lib/utils";
import { CURRENT_USER, type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";

type Accent = "violet" | "rose" | "emerald";

interface WorkspaceCardDef {
  id: WorkspaceId;
  title: string;
  tagline: string;
  description: string;
  href: string;
  accent: Accent;
  image: string;
  features: ModuleFeature[];
}

const WORKSPACE_CARDS: Record<WorkspaceId, WorkspaceCardDef> = {
  leads: {
    id: "leads",
    title: "Leads",
    tagline: "Convert every enquiry into revenue",
    description:
      "Capture leads from every channel, score them, automate follow-ups and visualise the pipeline end-to-end.",
    href: "/lead-management",
    accent: "violet",
    image: "/module-leads.avif",
    features: [
      { icon: Inbox, label: "Multi-channel Inbox", desc: "Calls, WhatsApp, web forms, Meta, Google - one queue." },
      { icon: Filter, label: "Pipeline & Deals", desc: "Drag leads through New → Contacted → Quoted → Won." },
      { icon: Zap, label: "Auto Follow-ups", desc: "Trigger SMS / WhatsApp / email sequences on inactivity." },
      { icon: Target, label: "Lead Scoring", desc: "Score by source, intent signals, response time and budget." },
      { icon: Megaphone, label: "Tasks & Meetings", desc: "Never miss a follow-up call or scheduled meeting." },
      { icon: Phone, label: "Click-to-Call", desc: "One-tap call from any lead card with call recording." },
      { icon: UserPlus, label: "Hand-off to Shop", desc: "Convert a won lead into a repair ticket in one click." },
      { icon: Mail, label: "Quotations", desc: "Pre-built quotation drafts for common repair jobs." },
    ],
  },
  shop: {
    id: "shop",
    title: "Shop Management",
    tagline: "Run your repair shop end-to-end",
    description:
      "Tickets, job assignment, invoicing, pricing, walk-ins and buy-back - all in one connected workspace.",
    href: "/dashboard",
    accent: "rose",
    image: "/module-shop.avif",
    features: [
      { icon: Wrench, label: "Ticket Management", desc: "Create, assign and track repair tickets through every stage." },
      { icon: Package, label: "Job Assignment", desc: "Assign technicians and monitor repair status in real time." },
      { icon: Receipt, label: "Invoicing & Payments", desc: "GST-ready invoices, payment tracking and reconciliation." },
      { icon: Tags, label: "Price List", desc: "Service pricing per device family with margin presets." },
      { icon: ShoppingCart, label: "Walk-In Counter", desc: "Fast counter sales for accessories and small fixes." },
      { icon: Banknote, label: "Buy-Back", desc: "Quote, accept and re-list customer trade-in devices." },
      { icon: Users2, label: "Customer Management", desc: "Customers with full repair history and notes." },
      { icon: BarChart3, label: "Reports", desc: "Technician productivity, P&L and tax summaries." },
    ],
  },
  operations: {
    id: "operations",
    title: "Operations",
    tagline: "Back-office, inventory and purchasing",
    description:
      "Stock levels, vendors, purchase orders and parts transfers - the back-office engine behind every shop.",
    href: "/operations",
    accent: "emerald",
    image: "/module-field.png",
    features: [
      { icon: Boxes, label: "Inventory Management", desc: "Live spare parts and accessory stock with low-stock alerts." },
      { icon: Truck, label: "Vendors & Suppliers", desc: "Manage vendor relationships and purchase history." },
      { icon: ClipboardList, label: "Purchase Orders", desc: "Raise, track and receive purchase orders." },
      { icon: ArrowLeftRight, label: "Parts Transfers", desc: "Move stock between branches and warehouses." },
      { icon: Tag, label: "Product Items", desc: "Pricing and catalogue for products and accessories." },
      { icon: BarChart3, label: "Reports", desc: "Stock valuation, movement and reorder insights." },
    ],
  },
};

export default function WorkspacesPage() {
  const router = useRouter();
  const [activeInfo, setActiveInfo] = useState<WorkspaceCardDef | null>(null);
  const { allowedWorkspaces: allowed, role } = usePermissions();

  // Users with access to a single workspace never see this screen — send them straight in.
  useEffect(() => {
    if (allowed.length === 1) {
      router.replace(allowed[0].homeHref ?? "/dashboard");
    }
  }, [allowed, router]);

  const cards = allowed.map((w) => WORKSPACE_CARDS[w.id]);

  if (allowed.length <= 1) {
    // brief blank frame while the redirect above kicks in
    return <div className="min-h-screen bg-[hsl(228,30%,95%)]" />;
  }

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
          Welcome back, {CURRENT_USER.name.split(" ")[0]} · {role.label}
        </p>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          Choose a workspace to <span className="brand-gradient-text">get started</span>
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-zinc-600">
          Your role gives you access to {cards.length} workspaces. Tap{" "}
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">i</span>{" "}
          on any card to see exactly what&apos;s inside.
        </p>
      </section>

      {/* Workspace grid */}
      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className={cn(
          "grid grid-cols-1 gap-5",
          cards.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
        )}>
          {cards.map((m, i) => (
            <WorkspaceCard
              key={m.id}
              workspace={m}
              index={i}
              onInfo={() => setActiveInfo(m)}
            />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          You can switch workspaces any time from the header inside the app.
        </p>
      </main>

      {activeInfo && (
        <InfoModal
          open={!!activeInfo}
          onClose={() => setActiveInfo(null)}
          eyebrow="Workspace"
          title={activeInfo.title}
          description={activeInfo.description}
          features={activeInfo.features}
          statusBadge={{ label: "Live", tone: "live" }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- card ---------------------------------- */

function WorkspaceCard({
  workspace: m,
  index,
  onInfo,
}: {
  workspace: WorkspaceCardDef;
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live
        </span>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInfo();
          }}
          aria-label="Show what's inside this workspace"
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
          style={{ objectPosition: m.id === "operations" ? "center top" : "center center" }}
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/80 to-transparent" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Workspace {index + 1}
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
