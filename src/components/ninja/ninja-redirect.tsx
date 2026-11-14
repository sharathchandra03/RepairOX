"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/lib/permissions-context";

/** Ninja accounts live in the mobile Ninja app, not the management shell. */
export function NinjaRedirect() {
  const { currentUser } = usePermissions();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (currentUser?.roleId === "ninja" && !path.startsWith("/account")) router.replace("/ninja");
  }, [currentUser?.roleId, path, router]);
  return null;
}
