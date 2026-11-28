"use client";
/* Admin Hub entry — forwards to the first Employees / Accounts page the user
   is allowed to open (the area itself has its own sidebar; see admin-sidebar.tsx). */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { expandableNavGroups } from "@/lib/mock-data";
import { usePermissions } from "@/lib/permissions-context";

export default function AdminHubHome() {
  const router = useRouter();
  const { can, getVisibilityByHref, authReady } = usePermissions();
  useEffect(() => {
    if (!authReady) return;
    const ok = (perm?: string | string[]) => !perm || (Array.isArray(perm) ? perm.some((k) => can(k as never)) : can(perm as never));
    for (const g of expandableNavGroups.shop ?? []) {
      if (!ok(g.permission)) continue;
      const first = g.children.find((c) => ok(c.permission) && getVisibilityByHref(c.href) !== "hidden");
      if (first) { router.replace(first.href); return; }
    }
  }, [authReady, can, getVisibilityByHref, router]);
  return <p className="px-2 py-6 text-sm text-muted-foreground">Opening People & Finance…</p>;
}
