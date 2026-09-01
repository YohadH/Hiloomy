"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GrowthAgentNav({ locale = "he", full = false }: { locale?: "he" | "en"; full?: boolean }) {
  const pathname = usePathname();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  // Slim by default (owner's call, 1 Sep 2026): Hiloma shows insights, what
  // needs action, and her next move — no hands yet. The configuration,
  // connections, supplier-draft and rules tabs stay in the code behind
  // GROWTH_AGENT_FULL=true for when (if) the agent gets hands.
  const allTabs = [
    { href: "/growth-agent", label: lang("סקירה", "Overview"), slim: true },
    { href: "/growth-agent/action-center", label: lang("מרכז פעולות", "Action Center"), slim: true },
    { href: "/growth-agent/history", label: lang("התראות / היסטוריה", "Alerts / History"), slim: true },
    { href: "/growth-agent/configuration", label: lang("הגדרות", "Configuration"), slim: false },
    { href: "/growth-agent/connections", label: lang("חיבורים", "Connections"), slim: false },
    { href: "/growth-agent/supplier-orders", label: lang("טיוטות ספק", "Supplier Drafts"), slim: false },
    { href: "/growth-agent/rules", label: lang("חוקים ואוטומציות", "Rules & Automations"), slim: false }
  ] as const;
  const tabs = full ? allTabs : allTabs.filter((t) => t.slim);

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
