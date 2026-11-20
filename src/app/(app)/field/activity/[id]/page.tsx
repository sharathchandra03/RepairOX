"use client";
import { useParams } from "next/navigation";
import { NinjaProfile } from "@/components/field/activity/ninja-profile";
export default function NinjaPage() {
  const { id } = useParams<{ id: string }>();
  return <NinjaProfile id={id} />;
}
