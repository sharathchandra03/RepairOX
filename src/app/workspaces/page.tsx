"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  Inbox, Filter, Zap, Target, Megaphone, Phone, UserPlus, Mail,
  Wrench, Package, Receipt, Tags, ShoppingCart, Banknote, Users2, BarChart3, Settings,
  Boxes, Truck, ClipboardList, ArrowLeftRight, Tag,
  ArrowRight, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Novatrix } from "@/components/ui/novatrix-background";
import { InfoModal, type ModuleFeature } from "@/components/common/info-modal";
import { cn } from "@/lib/utils";
import { WORKSPACES, type WorkspaceId } from "@/lib/permissions";
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
  shop: {
    id: "shop",
    title: "Shop Management",
    tagline: "Run your repair shop end-to-end",
    description:
      "End-to-end repair shop operations including tickets, customers, invoicing, repairs, pricing, walk-ins, buy-back, and day-to-day business management.",
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
  leads: {
    id: "leads",
    title: "Lead Management",
    tagline: "Manage leads, contacts and conversions",
    description:
      "Manage leads, contacts, companies, deals, quotations, follow-ups, communication, pipeline management, and customer conversion.",
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
  operations: {
    id: "operations",
    title: "Field Management",
    tagline: "Technicians, field visits and scheduling",
    description:
      "Manage technicians, field visits, scheduling, on-site services, route planning, and location-based operations.",
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [activeInfo, setActiveInfo] = useState<{ card: WorkspaceCardDef; index: number | null } | null>(null);
  const { allowedWorkspaces: allowed, role, currentUser, authReady } = usePermissions();

  // Permission-driven landing:
  //   • not signed in           → back to login
  //   • access to all modules    → stay here (show the module chooser)
  //   • access to some / one      → skip this screen, straight to their module
  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (allowed.length > 0 && allowed.length < WORKSPACES.length) {
      router.replace(allowed[0].homeHref ?? "/dashboard");
    }
  }, [authReady, currentUser, allowed, router]);

  const cards = allowed.map((w) => WORKSPACE_CARDS[w.id]);

  // Only render the chooser once we know the user is signed in AND can reach
  // every module; otherwise show a brief blank frame while redirecting.
  if (!authReady || !currentUser || allowed.length < WORKSPACES.length) {
    return <div className="min-h-screen bg-[hsl(228,30%,95%)]" />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(228,30%,95%)]">
      {/* Animated brand-blue background (same family as the login page) */}
      <div className="pointer-events-none absolute inset-0 isolate opacity-[0.2]">
        <Novatrix color={[0.76, 0.78, 0.98]} speed={0.28} amplitude={0.06} mouseReact={false} className="h-full w-full" />
        <div className="absolute inset-0 bg-[#4361EE] mix-blend-color" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />

      {/* Header */}
      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Link
          href="/login"
          className="rounded-full border border-zinc-300/80 bg-white/70 px-4 py-1.5 text-sm font-medium text-zinc-700 backdrop-blur transition hover:border-[#4361EE]/50 hover:text-[#4361EE]"
        >
          Switch account
        </Link>
      </header>

      {/* Title */}
      <section className="relative mx-auto max-w-7xl px-4 text-center sm:px-6">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {greeting()}, {currentUser.name.split(" ")[0]} · {role.label}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5 }}
          className="font-display mt-3 text-4xl font-extrabold tracking-tight md:text-5xl"
        >
          Where would you like to <span className="brand-gradient-text">work today?</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-3 max-w-xl text-[15px] text-zinc-600"
        >
          You have access to {cards.length} modules. Pick one to continue, and switch any time from the header inside the app.
        </motion.p>
      </section>

      {/* Workspace grid */}
      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6">
        <div className={cn(
          "grid grid-cols-1 gap-5",
          cards.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
        )}>
          {cards.map((m, i) => (
            <WorkspaceCard
              key={m.id}
              workspace={m}
              index={i}
              onInfo={(idx) => setActiveInfo({ card: m, index: idx ?? null })}
            />
          ))}
        </div>
      </main>

      {activeInfo && (
        <InfoModal
          open={!!activeInfo}
          onClose={() => setActiveInfo(null)}
          eyebrow="Module"
          title={activeInfo.card.title}
          description={activeInfo.card.description}
          features={activeInfo.card.features}
          image={activeInfo.card.image}
          href={activeInfo.card.href}
          activeIndex={activeInfo.index}
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
  onInfo: (featureIndex?: number) => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  // 3D tilt that follows the cursor (disabled for reduced motion)
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), { stiffness: 160, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), { stiffness: 160, damping: 18 });
  const imgX = useSpring(useTransform(px, [-0.5, 0.5], [10, -10]), { stiffness: 120, damping: 20 });
  const imgY = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 20 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() { px.set(0); py.set(0); }

  const preview = m.features.slice(0, 4);
  const more = m.features.length - preview.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 1000 }}
    >
      <motion.div
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={() => router.push(m.href)}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border-2 border-zinc-300 bg-card shadow-card transition-[box-shadow,border-color] duration-300 hover:border-[#4361EE] hover:shadow-[0_28px_60px_-28px_rgba(67,97,238,0.55)]"
      >
        {/* Hero image */}
        <div className="relative h-60 overflow-hidden">
          <motion.img
            src={m.image}
            alt={m.title}
            style={reduce ? undefined : { x: imgX, y: imgY }}
            className="h-full w-full scale-110 object-cover transition-transform duration-700 group-hover:scale-[1.18]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1B2466]/70 via-[#2F45C4]/10 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
          {/* big module number */}
          <span className="font-display pointer-events-none absolute bottom-1 right-5 select-none text-[76px] font-extrabold leading-none tracking-tighter text-white/80 drop-shadow-[0_4px_18px_rgba(20,30,100,0.45)]">
            0{index + 1}
          </span>
          <h3 className="font-display absolute bottom-5 left-6 right-24 text-[26px] font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(20,30,100,0.5)]">
            {m.title}
          </h3>
        </div>

        {/* Body */}
        <div className="relative flex flex-1 flex-col p-6">
          <span className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-[#4361EE] to-[#8DA0F2] transition-transform duration-500 group-hover:scale-x-100" />
          <p className="text-sm font-semibold text-zinc-800">{m.tagline}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{m.description}</p>

          {/* feature glimpse */}
          <div className="mt-4 flex items-center gap-2">
            {preview.map((f, i) => (
              <button
                key={f.label}
                type="button"
                title={f.label}
                aria-label={`See ${f.label} in ${m.title}`}
                onClick={(e) => { e.stopPropagation(); onInfo(i); }}
                style={{ transitionDelay: `${i * 40}ms` }}
                className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200 transition duration-300 hover:scale-110 hover:!bg-[#4361EE] hover:!text-white hover:!ring-[#4361EE] hover:shadow-lg hover:shadow-[#4361EE]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE] group-hover:-translate-y-1"
              >
                <f.icon className="h-4 w-4" />
              </button>
            ))}
            {more > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInfo(); }}
                className="ml-1 text-xs font-semibold text-zinc-500 transition hover:text-[#4361EE]"
              >
                +{more} more
              </button>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between pt-6">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInfo(); }}
              className="lg-sweep group/vf relative inline-flex items-center gap-2 overflow-hidden rounded-full border-2 border-[#4361EE]/35 bg-[#EEF1FD] px-4 py-1.5 text-[13px] font-bold text-[#3450D8] transition duration-200 hover:-translate-y-0.5 hover:border-[#4361EE] hover:bg-[#4361EE] hover:text-white hover:shadow-[0_10px_22px_-10px_rgba(67,97,238,0.8)] active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5 transition-transform duration-300 group-hover/vf:rotate-[24deg] group-hover/vf:scale-125" />
              View features
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/vf:translate-x-1" />
            </button>
            <Link
              href={m.href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-full brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition active:scale-95 group-hover:shadow-[0_10px_26px_-8px_rgba(67,97,238,0.8)]"
            >
              Open <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
