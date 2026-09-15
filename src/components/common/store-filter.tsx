"use client";

/* ──────────────────────────────────────────────────────────────────────────
   StoreFilter — a reusable "narrow by store" dropdown for the consolidated
   All-Shops view.

   The owner works from one place (All Shops) and can slice any list down to a
   single store without leaving it. This renders ONLY in All-Shops mode
   (isAllShops) — inside a concrete store there's nothing to filter because the
   data is already that store's. Options come from the real store list
   (useStoreContext().stores), so names/codes are always correct.

   Usage:
     const [storeId, setStoreId] = useState("");   // "" = All Stores
     <StoreFilter value={storeId} onChange={setStoreId} />
     const rows = useMemo(
       () => (storeId ? all.filter((r) => r.branchId === storeId) : all),
       [all, storeId]
     );
   ────────────────────────────────────────────────────────────────────────── */

import { RSelect } from "@/components/ui/rselect";
import { useStoreContext } from "@/lib/store-context";

export function StoreFilter({
  value,
  onChange,
  className,
  width = "w-[170px]",
  /** Force-show even outside All-Shops (rarely needed). */
  alwaysShow = false,
}: {
  value: string;
  onChange: (storeId: string) => void;
  className?: string;
  width?: string;
  alwaysShow?: boolean;
}) {
  const { stores, isAllShops } = useStoreContext();

  // Only meaningful when consolidating multiple stores.
  if (!alwaysShow && (!isAllShops || stores.length <= 1)) return null;

  const options = [
    { label: "All Stores", value: "" },
    ...stores.map((s) => ({
      label: s.code ? `${s.name} (${s.code})` : s.name,
      value: s.id,
    })),
  ];

  return (
    <div className={width}>
      <RSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="All Stores"
        searchable
        menuWidth="w-60"
        className={className}
      />
    </div>
  );
}

/** Filter any array of rows that carry an optional `branchId` by the selected
 *  store. Empty selection ("") returns everything. Rows with a null branchId
 *  (org-wide) are kept only when no specific store is selected. */
export function filterByStore<T extends { branchId?: string | null }>(
  rows: T[],
  storeId: string
): T[] {
  if (!storeId) return rows;
  return rows.filter((r) => r.branchId === storeId);
}
