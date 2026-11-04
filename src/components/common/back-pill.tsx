"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * RepairOX Back control — PERMANENT STANDARD: every back button / back arrow in
 * the app is a filled brand-blue pill with WHITE text + WHITE arrow. Never
 * ghost / outline / grey. Use one of:
 *   <BackPill/>      history-aware (router.back(), falls back to `fallback`)
 *                    or, with `href`, a fixed destination.
 *   <BackLink/>      same look as a real <a> (Next Link) for a fixed route.
 *   backPillClass()  class string for the rare case a custom element is needed
 *                    (e.g. print pages) — still must render blue + white.
 */
export function backPillClass(className?: string) {
  return cn(
    "inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-[#4361EE] bg-[#4361EE] px-4 text-[13px] font-semibold text-white shadow-sm transition",
    "hover:border-[#3450D8] hover:bg-[#3450D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
    "[&_svg]:text-white",
    className,
  );
}

export function BackPill({ fallback = "/leads/list", label = "Back", className, href, onClick }: {
  fallback?: string; label?: string; className?: string; href?: string; onClick?: () => void;
}) {
  const router = useRouter();
  const go = () => {
    if (onClick) { onClick(); return; }
    if (href) { router.push(href); return; }
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button type="button" onClick={go} aria-label={label === "Back" ? "Go back" : label} className={backPillClass(className)}>
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

export function BackLink({ href, label = "Back", className }: { href: string; label?: string; className?: string }) {
  return (
    <Link href={href} aria-label={label} className={backPillClass(className)}>
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
