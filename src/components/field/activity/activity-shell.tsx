"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Field Activity shell: page header, the shared filter bar (month · store · Ninja search) and the
   page tabs. Every page reads the same month / store / search through useActivity(), so switching
   pages never loses your selection. A page registers its table rows with useRegisterSheets() and the
   Export button downloads exactly those rows.
   ────────────────────────────────────────────────────────────────────────── */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { RequireCapability } from "@/components/common/require-capability";
import { ScrollHint } from "@/components/common/scroll-hint";
import { StoreMultiSelect } from "@/components/common/store-multi-select";
import { TableSearch } from "@/components/common/table-utility-bar";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { localDateKey } from "@/lib/work-session";
import { downloadXLSXWorkbook } from "@/lib/csv-utils";

export type Sheets = { name: string; headers: string[]; rows: (string | number)[][] }[];
interface Ctx {
  ym: string; setYm: (v: string) => void; storeSel: string[]; setStoreSel: (v: string[]) => void; q: string; setQ: (v: string) => void;
  multiStore: boolean; canPay: boolean; canManagePay: boolean; today: string; tz: string; setSheets: (s: Sheets) => void;
}
const ActivityCtx = createContext<Ctx | null>(null);
export function useActivity(): Ctx {
  const c = useContext(ActivityCtx);
  if (!c) throw new Error("useActivity must be used inside the Field Activity shell");
  return c;
}
/** Register this page's table rows so the Export button downloads them. */
export function useRegisterSheets(sheets: Sheets | null) {
  const { setSheets } = useActivity();
  // register on change, clear when the page goes away (so Export never offers another page's rows)
  useEffect(() => { if (sheets) setSheets(sheets); }, [sheets, setSheets]);
  useEffect(() => () => setSheets([]), [setSheets]);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const TABS = [
  { href: "/field/activity", label: "Team today" },
  { href: "/field/activity/attendance", label: "Attendance" },
  { href: "/field/activity/distance", label: "Distance & fuel" },
  { href: "/field/activity/daily", label: "Daily activity" },
  { href: "/field/activity/pay", label: "Pay", pay: true },
  { href: "/field/activity/reviews", label: "Reviews" },
  { href: "/field/activity/operations", label: "Operations" },
  { href: "/field/activity/rules", label: "Rules & rates" },
] as const;

const LOCKED = ["/field/activity/attendance", "/field/activity/distance", "/field/activity/daily", "/field/activity/pay", "/field/activity/operations", "/field/activity/reviews", "/field/activity/rules"];

export function ActivityShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireCapability anyOf={CAP.field.viewAll}>
      <Inner>{children}</Inner>
    </RequireCapability>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const tz = useStoreSettings().settings.timeZone;
  const { multiStore } = useFieldDashboard();
  const canPay = allow(can, CAP.field.payView);
  const canManagePay = allow(can, CAP.field.payManage);
  const today = localDateKey(Date.now(), tz);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [storeSel, setStoreSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const sheets = useRef<Sheets>([]);
  const [hasSheets, setHasSheets] = useState(false);
  const setSheets = useCallback((s: Sheets) => { sheets.current = s; setHasSheets(s.length > 0); }, []);
  // a Ninja's own page has its own header and filters
  const isProfile = /^\/field\/activity\/[0-9a-f-]{36}\/?$/i.test(path);
  const tabs = TABS.filter((t) => !("pay" in t) || canPay);
  const active = [...tabs].reverse().find((t) => path === t.href || (t.href !== "/field/activity" && path.startsWith(t.href))) ?? tabs[0];
  const monthOpts = useMemo(() => Array.from({ length: 18 }, (_, i) => { const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1); return { value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; }), [today]);
  const value = useMemo<Ctx>(() => ({ ym, setYm, storeSel, setStoreSel, q, setQ, multiStore, canPay, canManagePay, today, tz, setSheets }), [ym, storeSel, q, multiStore, canPay, canManagePay, today, tz, setSheets]);

  /* Pages whose main thing is one big table lock to the screen: only the table scrolls (like the Lead and
     Field tables). Card pages (Team today, Reviews, Rules, a Ninja) scroll normally. */
  const locked = LOCKED.some((h) => path === h || path === `${h}/`);
  // w-full + min-w-0: a centred (mx-auto) flex child would otherwise size itself to the widest table and push the page sideways
  if (isProfile) return <ActivityCtx.Provider value={value}><div className="mx-auto w-full min-w-0 max-w-[1500px]">{children}</div></ActivityCtx.Provider>;
  return (
    <ActivityCtx.Provider value={value}>
      <div className={cn("mx-auto w-full min-w-0 max-w-[1500px]", locked ? "rox-lock-root space-y-4" : "space-y-5")}>
        {/* one compact header row: back · title · month · store · search · export */}
        <div className="flex flex-wrap items-center gap-3">
          <BackPill href="/field" label="Back to Pickup & Drop" />
          <div className="mr-auto min-w-0">
            <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight">Field Activity</h1>
            <p className="text-[12px] text-muted-foreground">Who is working, what they did, what they earn</p>
          </div>
          <Select className="h-[36px] w-[150px]" value={ym} onChange={(e) => setYm(e.target.value)} options={monthOpts} />
          {multiStore && <StoreMultiSelect value={storeSel} onChange={setStoreSel} />}
          <div className="w-full sm:w-[250px]"><TableSearch value={q} onChange={setQ} placeholder="Search a Ninja by name…" animatedPrefix="Search by " animatedWords={["Ninja name"]} /></div>
          <Dropdown width="w-56" trigger={({ toggle }) => (
            <Button variant="outline" size="sm" className="h-[36px] gap-1.5" onClick={toggle} disabled={!hasSheets}><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
          )}>
            {(close) => <MenuItem icon={FileSpreadsheet} onClick={() => { void downloadXLSXWorkbook(`field-activity-${active.label.toLowerCase().replace(/[^a-z]+/g, "-")}-${ym}.xlsx`, sheets.current); close(); }}>Excel (.xlsx) · this page</MenuItem>}
          </Dropdown>
        </div>
        <ScrollHint framed className="min-w-0 flex-initial">
          <SegmentedTabs size="md" value={active.href} onChange={(v) => router.push(v)} options={tabs.map((t) => ({ label: t.label, value: t.href }))} className="border-0 bg-transparent p-0" />
        </ScrollHint>
        {locked ? <div className="rox-lock-fill">{children}</div> : children}
      </div>
    </ActivityCtx.Provider>
  );
}
