"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface DashboardSettings {
  resizeEnabled: boolean;
  setResizeEnabled: (v: boolean) => void;
}

const DashboardSettingsContext = createContext<DashboardSettings>({
  resizeEnabled: true,
  setResizeEnabled: () => {},
});

export function DashboardSettingsProvider({ children }: { children: ReactNode }) {
  const [resizeEnabled, setResizeEnabled] = useState(true);

  return (
    <DashboardSettingsContext.Provider value={{ resizeEnabled, setResizeEnabled }}>
      {children}
    </DashboardSettingsContext.Provider>
  );
}

export function useDashboardSettings() {
  return useContext(DashboardSettingsContext);
}
