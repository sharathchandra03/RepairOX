"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { resolveOrigin, type SettingsOrigin } from "@/lib/settings-origin";

/**
 * Reusable, origin-aware "← Back to <Module>" control for Settings pages.
 *
 * It reads the `from` query param, resolves the originating module (with any
 * rich return context stored in sessionStorage) and links straight back to the
 * exact context the user came from. Renders nothing when Settings wasn't opened
 * from a module, so standalone Settings visits are unaffected.
 */
export function SettingsBackBar() {
  const searchParams = useSearchParams();
  const fromKey = searchParams.get("from");
  const [origin, setOrigin] = useState<SettingsOrigin | null>(null);

  // Resolve on the client so sessionStorage (rich return context) is available.
  useEffect(() => {
    setOrigin(resolveOrigin(fromKey));
  }, [fromKey]);

  if (!origin) return null;

  return (
    // Right-aligned, compact, RepairOX blue outline button.
    <div className="mb-4 flex justify-end">
      <Link
        href={origin.returnTo}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#4361EE]/50 bg-white px-3 py-1.5 text-[13px] font-semibold text-[#4361EE] shadow-sm transition-colors hover:border-[#4361EE] hover:bg-[#EEF1FD]"
      >
        <ArrowLeft className="h-4 w-4 text-[#4361EE]" />
        Back to {origin.label}
      </Link>
    </div>
  );
}
