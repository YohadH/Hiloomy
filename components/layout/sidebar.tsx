"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  Bell,
  Building2,
  CalendarRange,
  FileText,
  LayoutDashboard,
  Loader2,
  Lock,
  Megaphone,
  Menu,
  PackageSearch,
  Settings2,
  Sparkles,
  Store as StoreIcon,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HiloomyMark } from "@/components/ui/logo";
import { useMemo, useState } from "react";
import type { AppLocale } from "@/lib/i18n";

// Two-group nav — 2026-07-05.
//
// The 2.1 memo cut the sidebar to 5 owner-language anchors, but that
// pushed the direct dashboards (Weekly Summary, Alerts, Offline,
// Product Follow-ups, Creator Flow) out of reach for founders who
// still navigate by task rather than by growth loop. This restores
// them under a second "Dashboards" heading — the 5 anchors stay
// primary at the top, the discovery-fallback dashboards live below.
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Module slug matched against DISABLED_MODULES (lib/server/module-flags.ts).
  // Items without a slug (Command Center, Settings) are core — never hidden.
  module?: string;
};

// A nav item plus its resolved visibility state. `locked` items stay in the
// nav greyed-out with a padlock (LOCKED_MODULES) — visible-but-gated, the
// upsell surface. Disabled items (DISABLED_MODULES) are filtered out.
type ResolvedNavItem = NavItem & { locked: boolean };

function getNavigation(
  locale: AppLocale,
  showPortfolio: boolean,
  disabledModules: readonly string[],
  lockedModules: readonly string[]
): {
  primary: readonly ResolvedNavItem[];
  dashboards: readonly ResolvedNavItem[];
  dashboardsHeading: string;
} {
  const isHe = locale === "he";
  const enabled = (item: NavItem) => !item.module || !disabledModules.includes(item.module);
  const resolve = (item: NavItem): ResolvedNavItem => ({
    ...item,
    locked: Boolean(item.module && lockedModules.includes(item.module))
  });
  const nav = {
    primary: [
      // Organization dashboard — only rendered for orgs with 2+ connected
      // stores (app-shell passes showPortfolio). A single-brand operator
      // gets no value from a "portfolio of one", but a 3-store owner needs
      // this to be the FIRST thing they see: the cross-store rollup with
      // per-brand comparison and click-to-switch.
      ...(showPortfolio
        ? [
            {
              href: "/portfolio",
              label: isHe ? "כל המותגים" : "All brands",
              icon: Building2,
              module: "portfolio"
            }
          ]
        : []),
      {
        href: "/dashboard",
        label: isHe ? "מרכז פיקוד" : "Command Center",
        icon: LayoutDashboard
      },
      {
        href: "/marketing-planner",
        label: isHe ? "תכנון החודש" : "Plan the month",
        icon: CalendarRange,
        module: "marketing-planner"
      },
      {
        href: "/creative",
        label: isHe ? "סטודיו קריאייטיב" : "Creative Studio",
        icon: Sparkles,
        module: "creative"
      },
      {
        href: "/affiliate-portal",
        label: isHe ? "שותפים" : "Affiliates",
        icon: Megaphone,
        module: "affiliate-portal"
      },
      {
        href: "/settings",
        label: isHe ? "הגדרות" : "Settings",
        icon: Settings2
      }
    ],
    dashboards: [
      {
        href: "/discounts",
        label: isHe ? "הנחות וקופונים" : "Discounts",
        icon: BadgePercent,
        module: "discounts"
      },
      {
        href: "/weekly-summary",
        label: isHe ? "סיכום שבועי" : "Weekly summary",
        icon: FileText,
        module: "weekly-summary"
      },
      {
        href: "/creator-flow",
        label: isHe ? "יוצרים ומכירות" : "Creators & sales",
        icon: UserRound,
        module: "creator-flow"
      },
      {
        href: "/sales-summary",
        label: isHe ? "מצב אופליין" : "Offline status",
        icon: StoreIcon,
        module: "sales-summary"
      },
      {
        href: "/product-follow-ups",
        label: isHe ? "מעקב מוצרים" : "Product follow-ups",
        icon: PackageSearch,
        module: "product-follow-ups"
      },
      {
        href: "/alerts",
        label: isHe ? "התראות" : "Alerts",
        icon: Bell,
        module: "alerts"
      }
    ],
    dashboardsHeading: isHe ? "דשבורדים נוספים" : "More dashboards"
  };
  return {
    primary: nav.primary.filter(enabled).map(resolve),
    dashboards: nav.dashboards.filter(enabled).map(resolve),
    dashboardsHeading: nav.dashboardsHeading
  };
}

/**
 * Renders the nav item's icon, swapping it for a spinner while a click on this
 * link has a navigation in flight. `useLinkStatus` only reports `pending` for
 * the enclosing <Link>, so the user gets feedback exactly on the item they
 * clicked while the destination page does its server work.
 */
function NavLinkIcon({ Icon, isActive }: { Icon: LucideIcon; isActive: boolean }) {
  const { pending } = useLinkStatus();
  const className = cn(
    "h-4 w-4 shrink-0",
    isActive ? "text-foreground" : "text-muted-foreground group-hover/nav:text-foreground"
  );
  if (pending) {
    return <Loader2 className={cn(className, "animate-spin")} aria-label="Loading" />;
  }
  return <Icon className={className} aria-hidden />;
}

function NavContent({
  pathname,
  storeName,
  locale,
  labels,
  showPortfolio,
  disabledModules,
  lockedModules
}: {
  pathname: string;
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
  showPortfolio: boolean;
  disabledModules: readonly string[];
  lockedModules: readonly string[];
}) {
  const navigation = useMemo(
    () => getNavigation(locale, showPortfolio, disabledModules, lockedModules),
    [locale, showPortfolio, disabledModules, lockedModules]
  );

  const lockedHint =
    locale === "he" ? "נעול בתוכנית הנוכחית — שדרגו כדי לפתוח" : "Locked on your current plan — upgrade to unlock";

  const renderNavLink = (item: ResolvedNavItem) => {
    const Icon = item.icon;
    if (item.locked) {
      // Visible-but-gated: not a link, greyed, padlock at the end. The row
      // deliberately keeps its place in the nav so the module's existence
      // stays discoverable (the whole point of LOCKED_MODULES).
      return (
        <div
          key={item.href}
          title={lockedHint}
          aria-disabled
          className="relative flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/50 select-none"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
          <span className="truncate">{item.label}</span>
          <Lock className="ms-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-label={lockedHint} />
        </div>
      );
    }
    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
    return (
      <Link
        key={item.href}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href={item.href as any}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-card text-foreground shadow-soft"
            : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 start-0 w-1 rounded-full transition-colors",
            isActive ? "bg-foreground" : "bg-transparent group-hover/nav:bg-border"
          )}
        />
        <NavLinkIcon Icon={Icon} isActive={isActive} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-8 pt-6">
        <div className="rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-soft">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <HiloomyMark className="h-7 w-7" />
            </span>
            <p className="text-xs uppercase tracking-[0.22em] text-primary-foreground/70">
              {labels.common.appName}
            </p>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{storeName}</h2>
          <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
            {labels.common.shellHeroCopy}
          </p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 px-3" aria-label="Primary">
        <div className="space-y-1">{navigation.primary.map(renderNavLink)}</div>
        {navigation.dashboards.length > 0 ? (
          <div className="space-y-1">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {navigation.dashboardsHeading}
            </p>
            {navigation.dashboards.map(renderNavLink)}
          </div>
        ) : null}
      </nav>
      <div className="px-4 pb-4 pt-6">
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-sm font-semibold">{labels.common.automationReady}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.common.automationCopy}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  storeName,
  locale,
  labels,
  showPortfolio = false,
  disabledModules = [],
  lockedModules = []
}: {
  storeName: string;
  locale: AppLocale;
  labels: {
    common: Record<string, string>;
    nav: Record<string, string>;
  };
  // True when the org has 2+ connected stores (app-shell decides).
  // Surfaces "All brands" (/portfolio) as the first nav item — the
  // organization-level rollup dashboard for multi-store operators.
  showPortfolio?: boolean;
  // Module slugs hidden from the nav (DISABLED_MODULES env — app-shell
  // resolves it server-side via lib/server/module-flags.ts).
  disabledModules?: readonly string[];
  // Module slugs shown greyed-out with a padlock (LOCKED_MODULES env) —
  // visible-but-gated upsell rows rather than removed.
  lockedModules?: readonly string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <HiloomyMark className="h-8 w-8" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {labels.common.appName}
            </p>
            <p className="font-semibold">{storeName}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
          <Menu className={cn("h-4 w-4", locale === "he" ? "ms-2" : "me-2")} />
          {labels.common.menu}
        </Button>
      </div>
      <aside className="hidden w-80 shrink-0 border-r border-border/70 bg-muted/40 lg:block">
        <NavContent
          pathname={pathname}
          storeName={storeName}
          locale={locale}
          labels={labels}
          showPortfolio={showPortfolio}
          disabledModules={disabledModules}
          lockedModules={lockedModules}
        />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[82%] max-w-80 bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <NavContent
              pathname={pathname}
              storeName={storeName}
              locale={locale}
              labels={labels}
              showPortfolio={showPortfolio}
              disabledModules={disabledModules}
              lockedModules={lockedModules}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
