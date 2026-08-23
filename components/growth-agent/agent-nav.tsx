"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GrowthAgentNav({ locale = "he" }: { locale?: "he" | "en" }) {
  const pathname = usePathname();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const tabs = [
    { href: "/growth-agent", label: lang("סקירה", "Overview") },
    { href: "/growth-agent/configuration", label: lang("הגדרות", "Configuration") },
    { href: "/growth-agent/connections", label: lang("חיבורים", "Connections") },
    { href: "/growth-agent/supplier-orders", label: lang("טיוטות ספק", "Supplier Drafts") },
    { href: "/growth-agent/rules", label: lang("חוקים ואוטומציות", "Rules & Automations") },
    { href: "/growth-agent/history", label: lang("התראות / היסטוריה", "Alerts / History") },
    { href: "/growth-agent/action-center", label: lang("מרכז פעולות", "Action Center") }
  ] as const;

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
