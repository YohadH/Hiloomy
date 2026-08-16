"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function DateRangeControls({
  initialStart,
  initialEnd,
  comparisonLabel,
  exportLabel,
  locale = "en"
}: {
  initialStart: string;
  initialEnd: string;
  comparisonLabel: string;
  exportLabel: string;
  // Locale for the small labels ("From", "To", "Apply", "Reset").
  // Defaults to English so existing callers stay valid.
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const t = {
    from: isHe ? "מתאריך" : "From",
    to: isHe ? "עד תאריך" : "To",
    apply: isHe ? "החילו" : "Apply",
    applying: isHe ? "מחיל..." : "Applying...",
    reset: isHe ? "איפוס" : "Reset"
  };
  const router = useRouter();
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [isPending, startTransition] = useTransition();

  function saveRange(nextStart: string, nextEnd: string) {
    document.cookie = `reporting-date-range=${encodeURIComponent(JSON.stringify({ start: nextStart, end: nextEnd }))}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  function resetRange() {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    const nextStart = start.toISOString().slice(0, 10);
    const nextEnd = end.toISOString().slice(0, 10);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    saveRange(nextStart, nextEnd);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 sm:flex-row sm:items-center">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.from}
          <input type="date" className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t.to}
          <input type="date" className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <Button type="button" variant="secondary" size="sm" disabled={isPending || !startDate || !endDate || startDate > endDate} onClick={() => saveRange(startDate, endDate)}>
          {isPending ? t.applying : t.apply}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={resetRange}>
          {t.reset}
        </Button>
      </div>
      <Button variant="secondary" className="justify-center">
        {comparisonLabel}
      </Button>
      <Button className="justify-center">{exportLabel}</Button>
    </div>
  );
}
