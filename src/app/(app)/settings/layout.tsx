"use client";

import { useState } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Menu, X } from "lucide-react";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex -mx-4 -mt-2 -mb-4 sm:-mx-6 lg:-mx-8" style={{ height: "calc(100vh - 56px)" }}>
      {/* Desktop left nav — fixed height, own scroll for dropdowns */}
      <aside className="hidden lg:flex w-[290px] shrink-0 flex-col border-r border-border bg-card overflow-y-auto" style={{ height: "calc(100vh - 56px)", position: "sticky", top: 0 }}>
        <SettingsNav onNavigate={() => {}} />
      </aside>

      {/* Mobile nav toggle */}
      <button
        onClick={() => setMobileNavOpen(true)}
        className="lg:hidden fixed bottom-6 left-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#4361EE] text-white shadow-lg hover:bg-[#3651d4] transition"
        aria-label="Open settings menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile/Tablet nav drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[300px] flex flex-col bg-card shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-bold">Settings</span>
              <button onClick={() => setMobileNavOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SettingsNav onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Right content area — scrolls independently */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
