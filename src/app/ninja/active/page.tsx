"use client";
import Link from "next/link";
import { Navigation } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { inProgress } from "@/lib/ninja/model";
import { TripView } from "@/components/ninja/trip-view";
import { TripCard } from "@/components/ninja/trip-card";
import { Btn, Empty, SectionTitle, Skeleton } from "@/components/ninja/ui";

export default function ActivePage() {
  const { trips, loading } = useNinja();
  const active = trips.filter(inProgress);
  const ready = trips.filter((t) => t.status === "accepted");
  if (loading) return <Skeleton className="h-72" />;
  if (active.length > 0)
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[24px] font-extrabold tracking-tight">Active trip</h1>
        <TripView t={active[0]} />
        {active.length > 1 ? (<><SectionTitle>Also in progress</SectionTitle><div className="space-y-3">{active.slice(1).map((t) => <TripCard key={t.id} t={t} />)}</div></>) : null}
      </div>
    );
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[24px] font-extrabold tracking-tight">Active trip</h1>
      <Empty icon={<Navigation className="h-7 w-7" />} title="No active trip" body={ready.length ? "You have accepted jobs ready to start." : "Accept a job and start your journey to see live trip controls here."}
        action={<Link href="/ninja/jobs"><Btn>Go to My Jobs</Btn></Link>} />
      {ready.length ? (<><SectionTitle>Ready to start</SectionTitle><div className="space-y-3">{ready.map((t) => <TripCard key={t.id} t={t} />)}</div></>) : null}
    </div>
  );
}
