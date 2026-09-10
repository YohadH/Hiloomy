"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ChartNoAxesCombined,
  BadgePercent,
  Bell,
  Building2,
  CalendarRange,
  Coins,
  Eye,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MoreHorizontal,
  PackageSearch,
  Radar,
  Settings2,
  Sparkles,
  Store as StoreIcon,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HiloomyMark } from "@/components/ui/logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { OrgSwitcher, type OrgSwitcherOrg } from "@/components/layout/org-switcher";
import { StoreSwitcher, type StoreSwitcherStore } from "@/components/layout/store-switcher";
import type { AppLocale } from "@/lib/i18n";

// App navigation (docs/UI-FOUNDATION-PLAN.md, batch 2).
//
//   Desktop (≥lg): a 248px sidebar — mark, primary nav (the decision system),
//   Tools, account footer. No brand hero card: the user is already inside
//   Hiloomy.
//   Phones: a 56px top bar (mark + store switcher) and a 5-slot bottom nav
//   Today / Watch / Market / Plan / More. "More" is a bottom sheet with the
//   rest of the primary group, the tools, and the account.

type NavItem = {
  href: string;
  label: string;
  // Short label for the bottom nav (falls back to `label`).
  short?: string;
  icon: LucideIcon;
  // Module slug matched against DISABLED_MODULES (lib/server/module-flags.ts).
  // Items without a slug (Command Center, Settings) are core — never hidden.
  module?: string;
};

// A nav item plus its resolved visibility state. `locked` items stay in the
// nav greyed-out with a padlock (LOCKED_MODULES) — visible-but-gated, the
// upsell surface. Disabled items (DISABLED_MODULES) are filtered out.
type ResolvedNavItem = NavItem & { locked: boolean };

export type SidebarAccount = {
  email: string;
  orgName: string | null;
  orgs: OrgSwitcherOrg[];
};

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
  // Primary group (owner, 9 Sep 2026): Today (the Decision Inbox), the
  // org rollup, the Command Center overview, the market as decision input,
  // and the plan. Everything else — Watchlist, Memory, Data Health and the
  // tool pages — sits under "Tools".
  const nav = {
    primary: [
      { href: "/today", label: isHe ? "היום" : "Today", icon: Inbox },
      // Organization rollup — only for orgs with 2+ connected stores
      // (app-shell passes showPortfolio).
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
        short: isHe ? "פיקוד" : "Overview",
        icon: LayoutDashboard
      },
      { href: "/market", label: isHe ? "שוק - מתחרים" : "Market · Competitors", short: isHe ? "שוק" : "Market", icon: Radar, module: "competitors" },
      {
        href: "/marketing-planner",
        label: isHe ? "תוכנית" : "Plan",
        icon: CalendarRange,
        module: "marketing-planner"
      }
    ],
    dashboards: [
      { href: "/watchlist", label: isHe ? "מעקב" : "Watchlist", icon: Eye },
      { href: "/memory", label: isHe ? "זיכרון" : "Memory", icon: History },
      { href: "/decision-impact", label: isHe ? "השפעת החלטות" : "Decision Impact", icon: ChartNoAxesCombined },
      { href: "/decision-audit", label: isHe ? "ביקורת תעדוף" : "Decision audit", icon: Activity },
      { href: "/data-health", label: isHe ? "בריאות הנתונים" : "Data Health", icon: Activity },
      {
        href: "/my-dashboard",
        label: isHe ? "הדשבורד שלי" : "My dashboard",
        icon: LayoutGrid
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
        href: "/retention",
        label: isHe ? "שימור לקוחות" : "Retention",
        icon: UserRound,
        module: "retention"
      },
      {
        // Moved out of /profit per the owner (F-041) — costs are a products
        // concern; the old /profit/costs URL redirects here.
        href: "/products/costs",
        label: isHe ? "עלויות מוצרים" : "Product costs",
        icon: Coins
      },
      {
        href: "/alerts",
        label: isHe ? "התראות" : "Alerts",
        icon: Bell,
        module: "alerts"
      },
      {
        href: "/settings",
        label: isHe ? "הגדרות" : "Settings",
        icon: Settings2
      }
    ],
    dashboardsHeading: isHe ? "כלים" : "Tools"
  };
  return {
    primary: nav.primary.filter(enabled).map(resolve),
    dashboards: nav.dashboards.filter(enabled).map(resolve),
    dashboardsHeading: nav.dashboardsHeading
  };
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * Renders the nav item's icon, swapping it for a spinner while a click on this
 * link has a navigation in flight. `useLinkStatus` only reports `pending` for
 * the enclosing <Link>, so the user gets feedback exactly on the item they
 * clicked while the destination page does its server work.
 */
function NavLinkIcon({
  Icon,
  isActive,
  locale = "he",
  className
}: {
  Icon: LucideIcon;
  isActive: boolean;
  locale?: AppLocale;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  const cls = cn("shrink-0", className ?? "h-4 w-4", isActive ? "text-foreground" : "text-muted-foreground group-hover/nav:text-foreground");
  if (pending) {
    return <Loader2 className={cn(cls, "animate-spin")} aria-label={locale === "he" ? "טוען" : "Loading"} />;
  }
  return <Icon className={cls} aria-hidden />;
}

// One nav row — shared by the desktop sidebar and the More sheet.
function NavRow({
  item,
  pathname,
  locale,
  onNavigate
}: {
  item: ResolvedNavItem;
  pathname: string;
  locale: AppLocale;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const lockedHint = locale === "he" ? "נעול בתוכנית הנוכחית — שדרגו כדי לפתוח" : "Locked on your current plan — upgrade to unlock";
  if (item.locked) {
    // Visible-but-gated: not a link, greyed, padlock at the end. The row
    // deliberately keeps its place in the nav so the module's existence
    // stays discoverable (the whole point of LOCKED_MODULES).
    return (
      <div
        title={lockedHint}
        aria-disabled
        className="flex min-h-11 cursor-not-allowed select-none items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50 lg:min-h-0"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
        <span className="truncate">{item.label}</span>
        <Lock className="ms-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-label={lockedHint} />
      </div>
    );
  }
  const isActive = isActivePath(pathname, item.href);
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      href={item.href as any}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group/nav flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors lg:min-h-0",
        isActive ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      )}
    >
      <NavLinkIcon Icon={Icon} isActive={isActive} locale={locale} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function AccountFooter({ account, locale, openUp }: { account: SidebarAccount | null; locale: AppLocale; openUp: boolean }) {
  if (!account) return null;
  const lang = locale === "he" ? "he" : "en";
  return (
    <div className="space-y-2">
      {account.orgs.length > 1 ? <OrgSwitcher orgs={account.orgs} locale={lang} /> : null}
      <AccountMenu email={account.email} displayName={null} orgName={account.orgName} locale={lang} variant="row" openUp={openUp} />
    </div>
  );
}

// ─── Desktop sidebar body ─────────────────────────────────────────────────
function DesktopNav({
  pathname,
  locale,
  navigation,
  account
}: {
  pathname: string;
  locale: AppLocale;
  navigation: ReturnType<typeof getNavigation>;
  account: SidebarAccount | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <HiloomyMark className="h-7 w-7" />
        <span className="text-sm font-semibold tracking-tight">Hiloomy</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pt-2" aria-label={locale === "he" ? "ניווט ראשי" : "Primary"}>
        <div className="space-y-0.5">
          {navigation.primary.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} locale={locale} />
          ))}
        </div>
        {navigation.dashboards.length > 0 ? (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{navigation.dashboardsHeading}</p>
            {navigation.dashboards.map((item) => (
              <NavRow key={item.href} item={item} pathname={pathname} locale={locale} />
            ))}
          </div>
        ) : null}
      </nav>
      <div className="border-t border-border p-3">
        <AccountFooter account={account} locale={locale} openUp />
      </div>
    </div>
  );
}

// ─── Mobile: bottom nav + More sheet ──────────────────────────────────────
const BOTTOM_SLOTS = ["/today", "/dashboard", "/market", "/marketing-planner"] as const;

function MoreSheet({
  open,
  onClose,
  pathname,
  locale,
  items,
  account
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  locale: AppLocale;
  items: readonly ResolvedNavItem[];
  account: SidebarAccount | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  const isHe = locale === "he";
  const signOut = isHe ? "התנתקות" : "Sign out";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 lg:hidden" onClick={onClose} role="dialog" aria-modal="true" aria-label={isHe ? "עוד" : "More"}>
      <div
        dir={isHe ? "rtl" : "ltr"}
        className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-border bg-card shadow-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-base font-semibold">{isHe ? "עוד" : "More"}</p>
          <button type="button" onClick={onClose} className="-me-2 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={isHe ? "סגירה" : "Close"}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-0.5">
            {items.map((item) => (
              <NavRow key={item.href} item={item} pathname={pathname} locale={locale} onNavigate={onClose} />
            ))}
          </div>
          {account ? (
            <div className="mt-3 space-y-0.5 border-t border-border pt-3">
              {account.orgs.length > 1 ? (
                <div className="px-3 pb-2">
                  <OrgSwitcher orgs={account.orgs} locale={isHe ? "he" : "en"} />
                </div>
              ) : null}
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={"/settings/account" as any}
                onClick={onClose}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/70 hover:text-foreground"
              >
                <UserRound className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{account.email}</span>
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm text-muted-foreground hover:bg-accent/70 hover:text-foreground">
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  {signOut}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function BottomNav({
  pathname,
  locale,
  navigation,
  account
}: {
  pathname: string;
  locale: AppLocale;
  navigation: ReturnType<typeof getNavigation>;
  account: SidebarAccount | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isHe = locale === "he";
  // Four fixed slots from the primary group (missing/disabled ones are
  // back-filled from the rest of the primary group), then More.
  const slots = useMemo(() => {
    const byHref = new Map(navigation.primary.map((i) => [i.href, i] as const));
    const picked: ResolvedNavItem[] = [];
    for (const href of BOTTOM_SLOTS) {
      const item = byHref.get(href);
      if (item) picked.push(item);
    }
    for (const item of navigation.primary) {
      if (picked.length >= 4) break;
      if (!picked.includes(item)) picked.push(item);
    }
    return picked;
  }, [navigation.primary]);
  const rest = useMemo(
    () => [...navigation.primary.filter((i) => !slots.includes(i)), ...navigation.dashboards],
    [navigation, slots]
  );
  const moreActive = rest.some((i) => isActivePath(pathname, i.href));

  return (
    <>
      <nav
        aria-label={locale === "he" ? "ניווט ראשי" : "Primary"}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {slots.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            const label = item.short ?? item.label;
            if (item.locked) {
              return (
                <li key={item.href} className="flex flex-col items-center justify-center gap-1 text-muted-foreground/40" aria-disabled>
                  <Lock className="h-5 w-5" aria-hidden />
                  <span className="text-xs">{label}</span>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  href={item.href as any}
                  aria-current={active ? "page" : undefined}
                  className={cn("group/nav flex h-full flex-col items-center justify-center gap-1", active ? "text-foreground" : "text-muted-foreground")}
                >
                  <NavLinkIcon Icon={Icon} isActive={active} locale={locale} className="h-5 w-5" />
                  <span className={cn("text-xs", active && "font-semibold")}>{label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn("flex h-full w-full flex-col items-center justify-center gap-1", moreActive ? "text-foreground" : "text-muted-foreground")}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              <span className={cn("text-xs", moreActive && "font-semibold")}>{isHe ? "עוד" : "More"}</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} pathname={pathname} locale={locale} items={rest} account={account} />
    </>
  );
}

export function Sidebar({
  storeName,
  currentStoreId,
  stores = [],
  locale,
  showPortfolio = false,
  disabledModules = [],
  lockedModules = [],
  account = null
}: {
  storeName: string;
  currentStoreId: string;
  // Every installed brand — the mobile top bar hosts the switcher when
  // there is more than one.
  stores?: StoreSwitcherStore[];
  locale: AppLocale;
  // True when the org has 2+ connected stores (app-shell decides).
  // Surfaces "All brands" (/portfolio) in Tools.
  showPortfolio?: boolean;
  // Module slugs hidden from the nav (DISABLED_MODULES env — app-shell
  // resolves it server-side via lib/server/module-flags.ts).
  disabledModules?: readonly string[];
  // Module slugs shown greyed-out with a padlock (LOCKED_MODULES env) —
  // visible-but-gated upsell rows rather than removed.
  lockedModules?: readonly string[];
  account?: SidebarAccount | null;
}) {
  const pathname = usePathname();
  const navigation = useMemo(
    () => getNavigation(locale, showPortfolio, disabledModules, lockedModules),
    [locale, showPortfolio, disabledModules, lockedModules]
  );
  const lang = locale === "he" ? "he" : "en";

  return (
    <>
      {/* Phone top bar: 56px, mark + store. Content starts right under it. */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
        <HiloomyMark className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          {stores.length > 1 ? (
            <StoreSwitcher currentStoreId={currentStoreId} stores={stores} locale={lang} />
          ) : (
            <p className="truncate text-sm font-semibold">{storeName}</p>
          )}
        </div>
      </div>

      <aside className="hidden w-[248px] shrink-0 border-e border-border bg-background lg:block">
        <div className="sticky top-0 h-screen">
          <DesktopNav pathname={pathname} locale={locale} navigation={navigation} account={account} />
        </div>
      </aside>

      <BottomNav pathname={pathname} locale={locale} navigation={navigation} account={account} />
    </>
  );
}
