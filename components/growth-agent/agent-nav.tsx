"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/growth-agent", label: "Overview" },
  { href: "/growth-agent/configuration", label: "Configuration" },
  { href: "/growth-agent/connections", label: "Connections" },
  { href: "/growth-agent/supplier-orders", label: "Supplier Drafts" },
  { href: "/growth-agent/rules", label: "Rules & Automations" },
  { href: "/growth-agent/history", label: "Alerts / History" },
  { href: "/growth-agent/action-center", label: "Action Center" }
] as const;

export function GrowthAgentNav() {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max flex-nowrap gap-2 rounded-2xl border border-border/70 bg-card/80 p-2 md:min-w-0 md:flex-wrap">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== "/growth-agent" && pathname.startsWith(`${tab.href}/`));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
