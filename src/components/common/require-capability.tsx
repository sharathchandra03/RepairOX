"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — route-level capability guard.

   Wraps a whole page so a user without the required capability sees a clean
   "access denied" panel instead of the management UI. This is the CLIENT half
   of defence-in-depth: the real enforcement is the server (`requirePermission`)
   + DB RLS, but the UI must also refuse rather than render a control the user
   can't actually use. Use it for permission-administration and other protected
   surfaces (Roles & Permissions, Add User, Owner Dashboard, etc.).

   Usage:
     export default function Page() {
       return (
         <RequireCapability anyOf={CAP.admin.manageRoles}>
           <RolesUI />
         </RequireCapability>
       );
     }
   ────────────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { allow } from "@/lib/capabilities";
import type { PermissionKey } from "@/lib/permissions";

export function RequireCapability({
  anyOf,
  children,
  title = "You don't have access to this page",
  description = "Your role doesn't include the permission required to view this. If you think this is a mistake, ask an administrator to grant it in Settings → Roles & Permissions.",
}: {
  /** The caller needs at least ONE of these keys (resolved via `can`). */
  anyOf: PermissionKey[];
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { can, authReady } = usePermissions();

  // While the session/permissions are still resolving, render nothing to avoid
  // a flash of the denied panel for a user who is in fact authorized.
  if (!authReady) return null;

  if (allow(can, anyOf)) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-lg font-extrabold tracking-tight text-zinc-800">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3347D6]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
