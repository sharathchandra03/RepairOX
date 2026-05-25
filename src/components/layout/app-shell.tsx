"use client";

import { useState } from "react";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <MobileSidebar open={open} setOpen={setOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
