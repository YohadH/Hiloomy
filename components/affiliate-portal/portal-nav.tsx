"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Bilingual portal nav (2026-08-23) — labels were hardcoded English,
// which made the whole affiliate portal feel foreign on the Hebrew app.
// Pages pass the resolved app locale; Hebrew is the default because the
// product is Hebrew-first and an SSR default must match what most
// sessions hydrate with.

const items = [
  { href: "/affiliate-portal", he: "דשבורד", en: "Dashboard" },
  { href: "/affiliate-portal/programs", he: "תוכניות", en: "Programs" },
  { href: "/affiliate-portal/affiliates", he: "שותפות", en: "Affiliates" },
  { href: "/affiliate-portal/coupons", he: "קופונים", en: "Coupons" },
  { href: "/affiliate-portal/conversions", he: "המרות", en: "Conversions" },
  { href: "/affiliate-portal/payouts", he: "תשלומים", en: "Payouts" },
  { href: "/affiliate-portal/content", he: "תוכן", en: "Content" },
  { href: "/affiliate-portal/settings", he: "הגדרות", en: "Settings" }
];

export function AffiliatePortalNav({ locale = "he" }: { locale?: "he" | "en" }) {
  const pathname = usePathname();
  const isHe = locale === "he";

  return (
    <div className="overflow-x-auto pb-2">
      <nav className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {isHe ? item.he : item.en}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
