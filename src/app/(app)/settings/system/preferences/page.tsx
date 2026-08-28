"use client";

import { Monitor, Moon, Sun, Palette } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useTheme, type Theme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

/* ─── Appearance / theme choice card ─────────────────────────────────── */

const THEME_OPTIONS: {
  value: Theme;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: "light",
    label: "Light",
    description: "The default RepairOX appearance.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easier on the eyes in low light.",
    icon: Moon,
  },
];

/** Miniature preview of a theme so the choice is obvious before applying. */
function ThemePreview({ dark }: { dark: boolean }) {
  const surface = dark ? "#161b26" : "#ffffff";
  const canvas = dark ? "#0f131c" : "#eef1f7";
  const line = dark ? "#2a3140" : "#e2e6ef";
  const textStrong = dark ? "#e8ecf5" : "#1b2340";
  const textMuted = dark ? "#8b93a7" : "#8b90a3";

  return (
    <div
      className="pointer-events-none h-16 w-full overflow-hidden rounded-lg ring-1 ring-inset ring-black/5"
      style={{ background: canvas }}
      aria-hidden
    >
      <div className="flex h-full gap-1 p-1.5">
        {/* Sidebar */}
        <div className="flex w-6 flex-col gap-1 rounded-md p-1" style={{ background: surface }}>
          <span className="h-1 w-full rounded-full" style={{ background: "#4361EE" }} />
          <span className="h-1 w-3/4 rounded-full" style={{ background: line }} />
          <span className="h-1 w-3/4 rounded-full" style={{ background: line }} />
        </div>
        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 rounded-md p-1.5" style={{ background: surface }}>
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: textStrong }} />
          <span className="h-1 w-3/4 rounded-full" style={{ background: textMuted }} />
          <div className="mt-auto flex gap-1">
            <span className="h-3 flex-1 rounded" style={{ background: canvas, border: `1px solid ${line}` }} />
            <span className="h-3 w-6 rounded" style={{ background: "#4361EE" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "System", href: "/settings/system/language" },
        { label: "Preferences" },
      ]}
      title="Preferences"
      description="Personalise how RepairOX looks for your account. These preferences are saved to your profile and follow you across devices."
    >
      <SettingsSection
        title="Appearance"
        description="Choose between the light and dark theme. Applies instantly across the whole app."
        icon={Palette}
      >
        <fieldset className="space-y-4">
          <legend className="sr-only">Theme</legend>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "group flex flex-col gap-3 rounded-xl border p-3 text-left transition-all duration-150",
                    active
                      ? "border-[#4361EE] ring-2 ring-[#4361EE]/15 bg-[#EEF1FD]/40"
                      : "border-border hover:border-[#4361EE]/40 hover:bg-muted/30"
                  )}
                >
                  <ThemePreview dark={opt.value === "dark"} />
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                        active ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        {active && (
                          <span className="rounded-full bg-[#4361EE]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick toggle — mirrors the radio choice above for one-tap switching */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-[11px] text-muted-foreground">
                  {theme === "dark" ? "On — dark theme is active." : "Off — using the light theme."}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Toggle dark mode"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none",
                theme === "dark" ? "bg-[#4361EE]" : "bg-zinc-300"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                  theme === "dark" ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Monitor className="h-3.5 w-3.5" />
            Your theme preference is stored on your account and applied automatically on every sign-in.
          </p>
        </fieldset>
      </SettingsSection>
    </SettingsPage>
  );
}
