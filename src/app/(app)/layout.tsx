import { AppShell } from "@/components/layout/app-shell";
import { DashboardSettingsProvider } from "@/lib/dashboard-settings-context";
import { WalkInSoundProvider } from "@/lib/walk-in-notification-sound";
import { WalkInFollowUpWatcher } from "@/components/walk-in/walk-in-followup-watcher";
import { CategoryPreloader } from "@/components/category-preloader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSettingsProvider>
      <WalkInSoundProvider>
        <CategoryPreloader />
        {/* Global follow-up watcher — fires a toast + bell notification + sound
            when any walk-in follow-up's date/time is crossed, on any page. */}
        <WalkInFollowUpWatcher />
        <AppShell>{children}</AppShell>
      </WalkInSoundProvider>
    </DashboardSettingsProvider>
  );
}
