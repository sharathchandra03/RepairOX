"use client";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BackPill } from "@/components/common/back-pill";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DASHBOARDS, useFieldDashboard, type DashboardId } from "@/components/field/dashboard/use-field-dashboard";

/** Page chrome shared by all five dashboards: back link, title, and a switcher
 *  that only lists dashboards the user can actually open. */
export function DashboardShell({ id, children }: { id: DashboardId; children: React.ReactNode }) {
  const router = useRouter();
  const { available } = useFieldDashboard();
  const def = DASHBOARDS.find((d) => d.id === id)!;
  const tabs = available.some((d) => d.id === id) ? available : [...available, def];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackPill href="/field/dashboard" label="All dashboards" />
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={id} onChange={(v) => { const d = DASHBOARDS.find((x) => x.id === v); if (d) router.push(d.href); }}
            options={tabs.map((d) => ({ label: d.short, value: d.id }))} />
        </div>
      </div>
      <PageHeader eyebrow="Field Management · Dashboards" title={def.name} subtitle={def.purpose} />
      {children}
    </div>
  );
}

export function DashboardNotice({ title, text, href, cta }: { title: string; text: string; href?: string; cta?: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
      <p className="font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {href && <button onClick={() => router.push(href)} className="mt-2 rounded-full bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#3450D8]">{cta ?? "Open"}</button>}
    </div>
  );
}
