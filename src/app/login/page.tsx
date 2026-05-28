"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Cloud, Truck,
  Users, FileText, Boxes, Phone, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { Novatrix } from "@/components/ui/novatrix-background";

const FEATURES = [
  { icon: FileText, title: "Ticket Management", desc: "Track and manage every repair job easily" },
  { icon: Boxes, title: "Stock Management", desc: "Monitor spare parts and inventory live" },
  { icon: Truck, title: "Field Team", desc: "Pick-up, drop & on-site tracking" },
  { icon: Users, title: "Lead Management", desc: "Capture leads, follow-ups & conversion" },
];

export default function LoginPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/modules"), 700);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[hsl(228,30%,95%)] via-[hsl(228,30%,97%)] to-[hsl(228,30%,95%)]">
      {/* Novatrix animated background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <Novatrix
          color={[0.76, 0.78, 0.98]}
          speed={0.28}
          amplitude={0.06}
          mouseReact={false}
          className="h-full w-full"
        />
      </div>
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#B3BFF6]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[480px] w-[480px] rounded-full bg-[#8DA0F2]/15 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-10 px-4 py-8 lg:grid-cols-2 lg:px-10 lg:py-12">
        {/* Marketing panel */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative hidden flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-8 lg:flex"
        >
          <div className="relative">
            <div className="flex items-center justify-between">
              <Logo />
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-brand-600" /> End-to-end Solution for the Repair Industry
              </span>
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="font-display mt-10 text-[44px] font-extrabold leading-[1.05] tracking-tight"
            >
              Repair smarter.{" "}
              <span className="brand-gradient-text">Grow faster.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-4 max-w-md text-[15px] text-muted-foreground"
            >
              Run your tickets, inventory, billing and customers from one place - designed for serious repair shops in India and beyond.
            </motion.p>

            {/* Pills */}
            <div className="mt-6 flex flex-wrap gap-2">
              <Pill icon={<Cloud className="h-3.5 w-3.5" />} label="01 · Cloud Based" />
              <Pill icon={<ShieldCheck className="h-3.5 w-3.5" />} label="02 · Easy to Use" />
              <Pill icon={<Sparkles className="h-3.5 w-3.5" />} label="03 · AI Insights" />
            </div>

            {/* Feature grid */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06 }}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-card hover:border-[#B3BFF6]/60"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-[12px] leading-snug text-muted-foreground">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="relative mt-8 flex items-center justify-between rounded-2xl border border-[#D9DFFA] bg-[#EEF1FD] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl brand-gradient text-white">
                <Phone className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">For more info</p>
                <p className="text-sm font-semibold">Call us · +91 91089 55544</p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Form */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="flex items-center"
        >
          <div className="mx-auto w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo />
            </div>

            <h2 className="font-display text-4xl font-extrabold tracking-tight">Welcome Back</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Access your tickets, notes and projects anytime, anywhere - and keep everything flowing in one place.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Your email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  iconLeft={<Mail className="h-4 w-4" />}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="#" className="text-xs font-medium text-brand-700 hover:underline">Forgot?</Link>
                </div>
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  placeholder="••••••••••"
                  iconLeft={<Lock className="h-4 w-4" />}
                  iconRight={
                    <button type="button" onClick={() => setShow(!show)} aria-label="Toggle password" className="text-muted-foreground hover:text-foreground">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <input id="remember" type="checkbox" className="h-3.5 w-3.5 rounded border-border text-brand-600 focus:ring-brand-400" />
                <label htmlFor="remember">Remember me on this device</label>
              </div>

              <Button type="submit" size="xl" loading={loading} className="w-full">
                Login
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="relative my-2">
                <div className="h-px bg-border" />
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-background px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Or continue with
                </span>
              </div>

              <Button type="button" variant="outline" size="xl" className="w-full">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-white shadow-ring">
                  <GoogleG />
                </span>
                Continue with Google
              </Button>

              <p className="pt-2 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="#" className="font-semibold text-brand-700 hover:underline">Sign Up</Link>
              </p>
            </form>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-ring">
      <span className="text-brand-600">{icon}</span>
      {label}
    </span>
  );
}
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.5 14.7 2.5 12 2.5 6.9 2.5 2.7 6.7 2.7 12s4.2 9.5 9.3 9.5c5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
      <path fill="#4285F4" d="M21 12.4c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.6-1.7 4.1-5.5 4.1-1.5 0-2.9-.5-4-1.4l-3.1 2.4C6.6 21 9.1 22 12 22c5.4 0 9-3.8 9-9.6z"/>
      <path fill="#FBBC05" d="M5.6 14.2c-.4-1.1-.6-2.2-.6-3.2s.2-2.1.6-3.2L2.5 5.4C1.6 7.2 1 9.2 1 11.5s.6 4.3 1.5 6.1l3.1-3.4z"/>
      <path fill="#34A853" d="M12 22c2.9 0 5.4-1 7.2-2.7l-3.1-2.4c-.9.6-2.1 1-4.1 1-3.3 0-6-2.7-6-6.2 0-.4 0-.8.1-1.2L2.5 5.4C1.6 7.2 1 9.2 1 11.5 1 17.5 6 22 12 22z"/>
    </svg>
  );
}
