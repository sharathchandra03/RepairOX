import { AppShell } from "@/components/layout/app-shell";
import { DashboardSettingsProvider } from "@/lib/dashboard-settings-context";
import { CategoryPreloader } from "@/components/category-preloader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSettingsProvider>
      <CategoryPreloader />
      <AppShell>{children}</AppShell>
    </DashboardSettingsProvider>
  );
}
