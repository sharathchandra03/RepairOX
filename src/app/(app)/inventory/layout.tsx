import { InventorySubNav } from "@/components/inventory/inventory-subnav";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <InventorySubNav />
      {children}
    </div>
  );
}
