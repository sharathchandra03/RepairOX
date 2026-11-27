"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Truck,
  Users, FileText, Boxes, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/ui/logo";
import { Novatrix } from "@/components/ui/novatrix-background";
import { usePermissions } from "@/lib/permissions-context";

const FEATURES = [
  { icon: FileText, title: "Ticket Management", desc: "Track and manage every repair job easily" },
  { icon: Boxes, title: "Stock Management", desc: "Monitor spare parts and inventory live" },
  { icon: Truck, title: "Field Team", desc: "Pick-up, drop & on-site tracking" },
  { icon: Users, title: "Lead Management", desc: "Capture leads, follow-ups & conversion" },
];

const LOGIN_ERRORS: Record<string, string> = {
  not_found: "No account found with that email.",
  bad_password: "Incorrect password. Please try again.",
  login_disabled: "This account doesn't have login access. Contact your administrator.",
  suspended: "This account is suspended. Contact your administrator.",
  invited: "This account isn't active yet. Contact your administrator.",
};

export default function LoginPage() {
  const router = useRouter();
  const { login } = usePermissions();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  function moveDots(e: React.MouseEvent<HTMLDivElement>) {
    const h = headRef.current, d = dotsRef.current;
    if (!h || !d) return;
    const r = h.getBoundingClientRect();
    d.style.setProperty("--mx", `${e.clientX - r.left}px`);
    d.style.setProperty("--my", `${e.clientY - r.top}px`);
    d.style.opacity = "1";
  }

  // Friendly banner when the session tracker signed this device out because the
  // account was used on another device (single-device login). Read from the URL
  // on mount — no Suspense boundary needed — then clean the query string.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "signed-in-elsewhere") {
      setNotice("You were signed out because your account was used to sign in on another device.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Authenticate against the central staff directory. The signed-in user's
    // role decides where they land — users never choose their own role, and
    // the routing is fully permission-driven (module selection vs. dashboard).
    const result = await login(email, password);
    if (!result.ok) {
      setLoading(false);
      setError(LOGIN_ERRORS[result.reason] ?? "Unable to sign in.");
      return;
    }
    router.push(result.landingHref);
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
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="hidden self-center overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_60px_-34px_rgba(40,60,160,0.45)] lg:block"
        >
          {/* brand header */}
          <div
            ref={headRef}
            onMouseMove={moveDots}
            onMouseLeave={() => { if (dotsRef.current) dotsRef.current.style.opacity = "0"; }}
            className="relative overflow-hidden bg-[linear-gradient(135deg,#4361EE_0%,#2F45C4_100%)] px-10 pb-7 pt-10 text-white"
          >
            {/* dot grid revealed around the cursor (dots only, no glow) */}
            <div
              ref={dotsRef}
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500"
              style={{
                backgroundImage: "radial-gradient(rgba(255,255,255,0.85) 1.3px, transparent 1.6px)",
                backgroundSize: "20px 20px",
                WebkitMaskImage: "radial-gradient(170px circle at var(--mx,50%) var(--my,50%), #000 0%, transparent 100%)",
                maskImage: "radial-gradient(170px circle at var(--mx,50%) var(--my,50%), #000 0%, transparent 100%)",
              }}
            />
            <div className="relative flex items-center justify-between">
              <Logo onDark className="gap-3 [&>span:last-child]:text-[24px] [&>span:last-child]:font-extrabold [&>span:last-child]:text-white [&>span:last-child>span]:text-white" />
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-white/80">
                For the repair industry
              </span>
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="font-display relative mt-12 text-[40px] font-extrabold leading-[1.08] tracking-tight"
            >
              Repair smarter.
              <br />
              <span className="lg-shimmer-text">Grow faster.</span>
            </motion.h1>
            <p className="relative mt-5 max-w-lg text-[16px] leading-[1.65] text-white/80">
              Run your tickets, inventory, billing and customers from one place - designed for serious repair shops in India and beyond.
            </p>
            <div className="relative mt-10 text-center">
              <span
                aria-hidden
                className="lg-wm font-display inline-block cursor-default select-none whitespace-nowrap text-[clamp(56px,6.4vw,88px)] font-extrabold leading-[0.9] tracking-tighter text-white/[0.16]"
              >
                RepairOX
              </span>
            </div>
          </div>

          {/* body */}
          <div className="space-y-4 px-8 pb-7 pt-7">
            <div className="grid grid-cols-2 gap-4">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + i * 0.09, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="lg-sweep group flex cursor-default items-start gap-3.5 rounded-2xl border border-border bg-white p-4 transition duration-200 hover:-translate-y-1 hover:border-[#4361EE]/50 hover:shadow-[0_14px_30px_-16px_rgba(67,97,238,0.55)]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200 transition duration-200 group-hover:rotate-[-6deg] group-hover:scale-110 group-hover:bg-[#4361EE] group-hover:text-white group-hover:ring-[#4361EE]">
                    <f.icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold leading-tight transition-colors group-hover:text-[#4361EE]">{f.title}</p>
                    <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="group flex cursor-default items-center gap-3.5 rounded-2xl bg-[#EEF1FD] px-5 py-3.5 transition duration-200 hover:-translate-y-0.5 hover:bg-[#E2E8FD] hover:shadow-[0_12px_26px_-16px_rgba(67,97,238,0.6)]">
              <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-[#4361EE] text-white transition duration-200 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-[#4361EE]/40">
                <span className="lg-ping pointer-events-none absolute inset-0 rounded-xl bg-[#4361EE]" />
                <Phone className="lg-phone relative h-4 w-4" />
              </span>
              <div>
                <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">For more info</p>
                <p className="text-[14px] font-semibold">Call us · +91 7996611169</p>
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  iconLeft={<Lock className="h-4 w-4" />}
                  iconRight={
                    <button type="button" onClick={() => setShow(!show)} aria-label="Toggle password" className="text-muted-foreground hover:text-foreground">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
              </div>

              {notice && !error && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  {notice}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-700">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox checked={remember} onChange={setRemember} aria-label="Remember me on this device" />
                Remember me on this device
              </label>

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
