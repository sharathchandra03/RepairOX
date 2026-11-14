"use client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { TripView } from "@/components/ninja/trip-view";
import { Empty, Skeleton } from "@/components/ninja/ui";

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { trips, loading } = useNinja();
  const t = trips.find((x) => x.id === id);
  return (
    <div className="space-y-4">
      <button onClick={() => (history.length > 1 ? router.back() : router.push("/ninja/jobs"))}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-[#4361EE] px-4 text-[13px] font-semibold text-white active:bg-[#3450D8]"><ArrowLeft className="h-4 w-4" />Back</button>
      {loading && !t ? <Skeleton className="h-64" /> : t ? <TripView t={t} /> :
        <Empty icon={<SearchX className="h-7 w-7" />} title="Job not found" body="It may have been reassigned or closed by your manager." />}
    </div>
  );
}
