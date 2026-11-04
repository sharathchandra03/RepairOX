"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/common/back-pill";
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
      <BackLink href={origin.returnTo} label={`Back to ${origin.label}`} />
    </div>
  );
}
