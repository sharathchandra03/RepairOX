"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

export function SettingsBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <li>
          <Link href="/settings/store" className="hover:text-[#4361EE] transition-colors">
            Settings
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0" />
            {item.href ? (
              <Link href={item.href} className="hover:text-[#4361EE] transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
