"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { InboxStats } from "@/lib/domain/decision";

type Locale = "he" | "en";

function greetingFor(hour: number, locale: Locale): string {
  if (locale === "he") return hour < 5 ? "לילה טוב" : hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function relative(iso: string, locale: Locale, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (locale === "he") {
    if (mins < 1) return "עודכן הרגע";
    if (mins < 60) return `עודכן לפני ${mins} דקות`;
    const h = Math.round(mins / 60);
    return `עודכן לפני ${h} שעות`;
  }
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  return `Updated ${h} hour${h === 1 ? "" : "s"} ago`;
}

// Top of Today: greeting, the one number that matters, and the operational
// context in a single quiet line. Deliberately not KPI tiles.
export function TodaySummary({
  locale,
  storeName,
  canSwitchBrand,
  stats,
  updatedAt
}: {
  locale: Locale;
  storeName: string;
  canSwitchBrand: boolean;
  stats: InboxStats;
  updatedAt: string;
}) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  // Client-side time so the greeting and freshness follow the viewer's clock
  // and never mismatch the server render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hour = now === null ? 9 : new Date(now).getHours();
  const n = stats.decisions;
  const headline =
    n === 0
      ? t("אין החלטות שממתינות לכם", "No decisions are waiting for you")
      : n === 1
        ? t("החלטה אחת דורשת את תשומת הלב שלכם", "1 decision needs your attention")
        : t(`${n} החלטות דורשות את תשומת הלב שלכם`, `${n} decisions need your attention`);

  const contextParts = [
    t(`${stats.watching} פריטים במעקב`, `${stats.watching} item${stats.watching === 1 ? "" : "s"} being watched`),
    t(`${stats.reviewed.toLocaleString("en-US")} אותות נסקרו`, `${stats.reviewed.toLocaleString("en-US")} signals reviewed`),
    t(`${stats.suppressed.toLocaleString("en-US")} אותות הושתקו`, `${stats.suppressed.toLocaleString("en-US")} signals suppressed`),
    stats.confidencePct === null
      ? t("ביטחון בנתונים: לא זמין", "Data confidence: unavailable")
      : t(`ביטחון בנתונים: ${stats.confidencePct}%`, `Data confidence: ${stats.confidencePct}%`)
  ];

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {greetingFor(hour, locale)}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h2>
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {contextParts.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden className="h-1 w-1 rounded-full bg-border" /> : null}
              {p}
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        {canSwitchBrand ? (
          <Link
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            href={"/portfolio" as any}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
          >
            {storeName}
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold">{storeName}</span>
        )}
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          {now === null ? "" : relative(updatedAt, locale, now)}
        </p>
      </div>
    </div>
  );
}
