import { AppShell } from "@/components/layout/app-shell";
import { DashboardSettingsProvider } from "@/lib/dashboard-settings-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSettingsProvider>
      <AppShell>{children}</AppShell>
    </DashboardSettingsProvider>
  );
}
