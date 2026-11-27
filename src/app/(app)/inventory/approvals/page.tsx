"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** The standalone Approvals page was removed — each inventory workflow
 *  (Loss & Damage, Purchase Orders, Transfers…) handles its own approvals.
 *  This route only redirects old links. */
export default function ApprovalsRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/inventory"); }, [router]);
  return null;
}
