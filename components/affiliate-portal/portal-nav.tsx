"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/affiliate-portal", label: "Dashboard" },
  { href: "/affiliate-portal/programs", label: "Programs" },
  { href: "/affiliate-portal/affiliates", label: "Affiliates" },
  { href: "/affiliate-portal/coupons", label: "Coupons" },
  { href: "/affiliate-portal/conversions", label: "Conversions" },
  { href: "/affiliate-portal/payouts", label: "Payouts" },
  { href: "/affiliate-portal/content", label: "Content" },
  { href: "/affiliate-portal/settings", label: "Settings" }
];

export function AffiliatePortalNav() {
  const pathname = usePathname();

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
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

