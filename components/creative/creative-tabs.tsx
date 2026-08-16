"use client";

// Creative Studio tab strip — surfaces the two modes ("Projects" and
// "Sprints") side-by-side at the top of every Creative page. Sprints and
// Projects still live at separate routes today; the tabs let the user
// switch between them without going back to a nav that no longer includes
// Sprint as a top-level item (removed in the 2026-07 nav collapse).
//
// This is the "phase B" version of memo initiative 2.2 (Merge Creative +
// Sprint). Phase C would fold Sprint into `runAsSprint: boolean` on
// CreativeProject and share the list view — that's a data-model change
// that deserves its own session.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";

export function CreativeTabs({ locale }: { locale: AppLocale }) {
  const pathname = usePathname();
  const isHe = locale === "he";

  const tabs: Array<{ href: "/creative" | "/creative/sprint"; label: string }> = [
    { href: "/creative", label: isHe ? "פרויקטים" : "Projects" },
    { href: "/creative/sprint", label: isHe ? "ספרינטים" : "Sprints" }
  ];

  const isActive = (href: "/creative" | "/creative/sprint") => {
    if (href === "/creative") {
      // Match /creative and /creative/[projectId], but NOT /creative/sprint*.
      return pathname === "/creative" || (pathname.startsWith("/creative/") && !pathname.startsWith("/creative/sprint"));
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="overflow-x-auto border-b border-border">
      <nav className="flex min-w-max gap-6" aria-label="Creative modes">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 pb-3 pt-2 text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
