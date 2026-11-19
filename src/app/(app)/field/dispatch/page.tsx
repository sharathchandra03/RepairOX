"use client";
/* The Dispatch Board was merged into Pickup & Drop (assign, store handover, release,
   re-plan, reschedule, cancel and the live map now live there and on View Assignment).
   This route stays only so saved links and stored notifications keep working. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DispatchRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/field"); }, [router]);
  return <p className="p-10 text-center text-sm text-muted-foreground">Opening Pickup &amp; Drop…</p>;
}
