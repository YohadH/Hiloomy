"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Settings sub-navigation — a sticky rail (desktop) / horizontal chip bar
// (mobile) that jumps between the page's sections by anchor. A scrollspy
// (IntersectionObserver) highlights the section currently in view.

export interface SettingsNavItem {
  id: string;
  label: string;
  /** Optional group header rendered above this item. */
  group?: string;
}

export function SettingsNav({ items, isHe }: { items: SettingsNavItem[]; isHe: boolean }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the top-most visible section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  const link = (item: SettingsNavItem, mobile: boolean) => (
    <a
      key={`${mobile ? "m" : "d"}-${item.id}`}
      href={`#${item.id}`}
      onClick={() => setActiveId(item.id)}
      className={cn(
        mobile
          ? "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
          : "block rounded-lg px-3 py-2 text-sm font-medium transition-colors border-s-2",
        activeId === item.id
          ? mobile
            ? "border-green-600 bg-green-600 text-white"
            : "border-green-600 bg-green-50 text-green-800"
          : mobile
            ? "border-border bg-card text-muted-foreground hover:text-foreground"
            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {item.label}
    </a>
  );

  return (
    <>
      {/* Mobile: horizontal scrollable chips under the page header. */}
      <nav
        aria-label={isHe ? "ניווט הגדרות" : "Settings navigation"}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden [scrollbar-width:none]"
      >
        {items.map((i) => link(i, true))}
      </nav>

      {/* Desktop: sticky side rail. */}
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
            {link(item, false)}
          </div>
        ))}
      </nav>
    </>
  );
}
