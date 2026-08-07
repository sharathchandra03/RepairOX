"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Premium "Coming Soon" page.

   Displayed when a feature is marked as `coming_soon` in the Feature
   Visibility configuration. Uses the existing RepairOX design language
   with soft animations, dynamic content, and branded styling.

   Content is generated dynamically based on the module the user attempted
   to access — never a generic "coming soon" message.
   ────────────────────────────────────────────────────────────────────────── */

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Rocket, BarChart3, Shield, Settings, Map, Inbox, Layers, Calendar,
  ArrowLeft, Home, Sparkles, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { type ComingSoonContent } from "@/lib/feature-visibility";

/* ── Illustration map ──────────────────────────────────────────────────── */
const ILLUSTRATION_ICON: Record<ComingSoonContent["illustration"], React.ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  chart: BarChart3,
  shield: Shield,
  gear: Settings,
  map: Map,
  inbox: Inbox,
  stack: Layers,
  calendar: Calendar,
};

/* ── Floating particle component — subtle decorative sparkles ─────────── */
function FloatingParticle({ delay, x, y, size }: { delay: number; x: number; y: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-[#4361EE]/10"
      style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
      animate={{
        y: [0, -12, 0],
        opacity: [0.3, 0.7, 0.3],
        scale: [1, 1.2, 1],
      }}
      transition={{
        duration: 4,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

export function ComingSoonPage({ content }: { content: ComingSoonContent }) {
  const router = useRouter();
  const IllustrationIcon = ILLUSTRATION_ICON[content.illustration];

  return (
    <div className="relative flex min-h-[calc(100vh-120px)] flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Soft radial gradient behind the icon */}
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(67,97,238,0.06)_0%,transparent_70%)]" />
        {/* Floating particles */}
        <FloatingParticle delay={0} x={20} y={25} size={6} />
        <FloatingParticle delay={0.8} x={75} y={20} size={8} />
        <FloatingParticle delay={1.5} x={15} y={65} size={5} />
        <FloatingParticle delay={2.2} x={80} y={60} size={7} />
        <FloatingParticle delay={0.4} x={45} y={15} size={4} />
        <FloatingParticle delay={1.8} x={60} y={75} size={6} />
        <FloatingParticle delay={2.8} x={30} y={80} size={5} />
        <FloatingParticle delay={1.2} x={90} y={40} size={4} />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex max-w-lg flex-col items-center text-center"
      >
        {/* Animated icon container */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8"
        >
          {/* Outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-3xl bg-[#4361EE]/10"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{ borderRadius: "24px", margin: "-8px" }}
          />
          {/* Icon box */}
          <div className="relative grid h-20 w-20 place-items-center rounded-3xl brand-gradient shadow-[0_16px_40px_-12px_rgba(67,97,238,0.4)]">
            <IllustrationIcon className="h-9 w-9 text-white" />
          </div>
          {/* Sparkle badge */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 20 }}
            className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-amber-400 shadow-lg"
          >
            <Sparkles className="h-4 w-4 text-white" />
          </motion.div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="font-display text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl"
        >
          {content.headline}
          <span className="block mt-1 brand-gradient-text">coming soon.</span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-500"
        >
          {content.description}
        </motion.p>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {content.highlights.map((highlight, i) => (
            <motion.div
              key={highlight}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.08, duration: 0.3 }}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-[#B3BFF6] hover:bg-[#F5F7FF]/50"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4361EE]" />
              <span className="text-[13.5px] font-medium text-zinc-700">{highlight}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="mt-10 flex items-center gap-3"
        >
          <Button
            variant="outline"
            size="lg"
            className="gap-2 rounded-full"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>
          <Button
            size="lg"
            className="gap-2 rounded-full"
            onClick={() => router.push("/dashboard")}
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
        </motion.div>

        {/* Branding footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-12 flex items-center gap-2 text-[12px] text-zinc-400"
        >
          <Logo className="opacity-60" mark />
          <span>We&apos;re building something great.</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
