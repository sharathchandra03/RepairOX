"use client";

/* Legacy customer-detail route — redirects to the standalone /customers/[id]. */

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function CustomerDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
    router.replace(id ? `/customers/${id}` : "/customers");
  }, [router, params]);

  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Redirecting…
    </div>
  );
}
