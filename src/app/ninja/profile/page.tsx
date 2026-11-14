"use client";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, LogOut, MapPin, Smartphone, UserCog } from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/lib/permissions-context";
import { useNinja, useNinjaGeo } from "@/lib/ninja/ninja-context";
import { Btn, Card, Pill, Row, SectionTitle } from "@/components/ninja/ui";
import { useEffect, useMemo, useState } from "react";
import { useWorkSession } from "@/lib/work-session-context";
import { ShiftCard } from "@/components/ninja/shift";

export default function ProfilePage() {
  const { currentUser, logout } = usePermissions();
  const { trips, outbox } = useNinja();
  const geo = useNinjaGeo();
  const router = useRouter();
  const { endWork, openSession } = useWorkSession();
  const [leaving, setLeaving] = useState(false);
  const stats = useMemo(() => {
    const wk = Date.now() - 7 * 864e5;
    const done = trips.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at).getTime() > wk);
    const acc = trips.filter((t) => t.accepted_at && t.assigned_at);
    const avgAcc = acc.length ? Math.round(acc.reduce((a, t) => a + (new Date(t.accepted_at!).getTime() - new Date(t.assigned_at!).getTime()), 0) / acc.length / 60000) : null;
    return { done: done.length, pickups: done.filter((t) => t.trip_type !== "drop" && t.trip_type !== "onsite").length, drops: done.filter((t) => t.trip_type === "drop").length, onsite: done.filter((t) => t.trip_type === "onsite").length, avgAcc };
  }, [trips]);
  async function signOut() {
    setLeaving(true);
    // Close the work session BEFORE auth logout; never trap the user.
    if (openSession) { try { await Promise.race([endWork("logout"), new Promise((r) => setTimeout(r, 3000))]); } catch { /* recovered as interrupted */ } }
    logout(); router.replace("/login");
  }
  const [notif, setNotif] = useState<string>("default");
  useEffect(() => { if (typeof Notification !== "undefined") setNotif(Notification.permission); else setNotif("unsupported"); }, []);

  async function enableNotif() {
    if (typeof Notification === "undefined") return;
    setNotif(await Notification.requestPermission());
  }
  function askLocation() { navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true }); }

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-5">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#4361EE] to-[#2F46C4] text-[24px] font-extrabold text-white">{(currentUser?.name ?? "N").slice(0, 1)}</span>
        <div className="min-w-0">
          <p className="truncate text-[19px] font-extrabold">{currentUser?.name}</p>
          <p className="truncate text-[13px] text-slate-500">{currentUser?.email}</p>
          <div className="mt-1.5 flex gap-2"><Pill tone="blue">Ninja</Pill><Pill tone="slate">{currentUser?.branch || "Store"}</Pill></div>
        </div>
      </Card>

      <ShiftCard />

      <SectionTitle>Last 7 days</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {[["Done", stats.done], ["Pickups", stats.pickups], ["Drops", stats.drops], ["On-site", stats.onsite]].map(([l, v]) => (
          <Card key={String(l)} className="p-3 text-center"><p className="text-[22px] font-extrabold tabular-nums">{v}</p><p className="text-[11px] font-bold text-slate-500">{l}</p></Card>
        ))}
      </div>
      <p className="px-1 text-[12px] text-slate-500">Average time to accept a job: <b>{stats.avgAcc == null ? "—" : `${stats.avgAcc} min`}</b></p>

      <SectionTitle>Permissions</SectionTitle>
      <Card className="divide-y divide-slate-100 px-4">
        <div className="flex items-center justify-between py-3.5">
          <p className="flex items-center gap-3 text-[14px] font-bold"><MapPin className="h-5 w-5 text-[#4361EE]" />Location</p>
          {geo.permission === "granted" ? <Pill tone="green">Allowed</Pill> : geo.permission === "denied" ? <Pill tone="rose">Blocked in browser</Pill> : <button onClick={askLocation} className="rounded-xl bg-[#4361EE] px-3.5 py-2 text-[12px] font-bold text-white">Allow</button>}
        </div>
        <div className="flex items-center justify-between py-3.5">
          <p className="flex items-center gap-3 text-[14px] font-bold"><Bell className="h-5 w-5 text-[#4361EE]" />Notifications</p>
          {notif === "granted" ? <Pill tone="green">Allowed</Pill> : notif === "denied" ? <Pill tone="rose">Blocked</Pill> : notif === "unsupported" ? <Pill>Not supported</Pill> : <button onClick={enableNotif} className="rounded-xl bg-[#4361EE] px-3.5 py-2 text-[12px] font-bold text-white">Allow</button>}
        </div>
      </Card>
      <p className="px-1 text-[12px] leading-relaxed text-slate-400">Location is used only while a journey is active (on the way to the customer or the store). In this web version, sharing works while the app is open; background tracking needs the installed RepairOX Ninja mobile app.</p>

      <SectionTitle>This device</SectionTitle>
      <Card className="divide-y divide-slate-100 px-4">
        <Row icon={<Smartphone className="h-4 w-4" />} label="Jobs on this phone" value={String(trips.length)} />
        <Row icon={<Smartphone className="h-4 w-4" />} label="Actions waiting to sync" value={String(outbox.filter((o) => o.state === "pending").length)} />
      </Card>

      <Link href="/account" className="block"><Card className="flex items-center gap-3 p-4"><UserCog className="h-5 w-5 text-[#4361EE]" /><span className="flex-1 text-[14px] font-bold">My Account (password, PIN)</span><ChevronRight className="h-5 w-5 text-slate-400" /></Card></Link>
      <Btn tone="ghost" className="w-full" loading={leaving} onClick={() => void signOut()}><LogOut className="h-5 w-5" />Sign out</Btn>
    </div>
  );
}
