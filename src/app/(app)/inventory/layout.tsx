/* Inventory pages render inside the dedicated InventorySidebar (see
   components/layout/app-shell.tsx); the old horizontal sub-nav is retired. */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
