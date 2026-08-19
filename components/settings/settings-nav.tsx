"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Settings tabs — the side rail is a real selector: each nav item shows its
// OWN panel in the content area (single route, no reload). Panels stay
// mounted (CSS-hidden) so switching is instant and client state survives.
// The active tab syncs with the URL hash, so #integrations deep-links and
// OAuth round-trips land on the right panel.

export interface SettingsNavItem {
  id: string;
  label: string;
  /** Optional group header rendered above this item. */
  group?: string;
}

export function SettingsTabs({
  items,
  panels,
  initialTab,
  isHe
}: {
  items: SettingsNavItem[];
  panels: Record<string, ReactNode>;
  /** Server-suggested starting tab (e.g. "integrations" after an OAuth return). */
  initialTab?: string;
  isHe: boolean;
}) {
  const fallback = items[0]?.id ?? "";
  const [active, setActive] = useState<string>(
    initialTab && items.some((i) => i.id === initialTab) ? initialTab : fallback
  );

  // A URL hash wins over the server suggestion (deep links, back/forward).
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && items.some((i) => i.id === hash)) setActive(hash);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    setActive(id);
    // replaceState keeps history clean (no back-button spam) while making
    // the current tab linkable.
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const button = (item: SettingsNavItem, mobile: boolean) => (
    <button
      key={`${mobile ? "m" : "d"}-${item.id}`}
      type="button"
      onClick={() => select(item.id)}
      aria-current={active === item.id ? "page" : undefined}
      className={cn(
        mobile
          ? "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
          : "block w-full rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors border-s-2",
        active === item.id
          ? mobile
            ? "border-green-600 bg-green-600 text-white"
            : "border-green-600 bg-green-50 text-green-800"
          : mobile
            ? "border-border bg-card text-muted-foreground hover:text-foreground"
            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {item.label}
    </button>
  );

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      {/* Mobile: horizontal scrollable chips. */}
      <nav
        aria-label={isHe ? "ניווט הגדרות" : "Settings navigation"}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden [scrollbar-width:none]"
      >
        {items.map((i) => button(i, true))}
      </nav>

      {/* Desktop: sticky side rail with group headers. */}
      <nav
        aria-label={isHe ? "ניווט הגדרות" : "Settings navigation"}
        className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-52 shrink-0 space-y-0.5 overflow-y-auto lg:block"
      >
        {items.map((item, idx) => (
          <div key={item.id}>
            {item.group && (idx === 0 || items[idx - 1].group !== item.group) ? (
              <p className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground first:mt-0">
                {item.group}
              </p>
            ) : null}
            {button(item, false)}
          </div>
        ))}
      </nav>

      {/* Panels — all mounted, only the active one visible. */}
      <div className="mt-4 min-w-0 flex-1 lg:mt-0">
        {items.map((item) => (
          <div key={item.id} className={active === item.id ? "" : "hidden"}>
            {panels[item.id] ?? null}
          </div>
        ))}
      </div>
    </div>
  );
}
