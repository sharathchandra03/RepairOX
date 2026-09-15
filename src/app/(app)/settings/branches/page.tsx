"use client";

/* Store management now lives at Settings → Store → Store Configuration (the
   single management center). This legacy route redirects there so there is only
   ONE place to manage stores. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BranchesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/store/configuration"); }, [router]);
  return <div className="h-[40vh]" />;
}
