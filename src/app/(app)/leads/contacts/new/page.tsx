"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AddContactModal } from "@/components/leads/add-contact-modal";

export default function AddContactPage() {
  const router = useRouter();

  return (
    <AddContactModal
      open={true}
      onClose={() => router.push("/leads/contacts")}
    />
  );
}
