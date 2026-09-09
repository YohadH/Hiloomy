"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SALES_CHANNEL_FILTERS, SALES_CHANNEL_FILTER_LABEL, type SalesChannelFilter } from "@/lib/domain/sales-channel";

// Segmented control for the Command Center's money + trend sections:
// all / online only / POS only. Navigates with the date-range query kept
// (?preset / ?start&end) so the window never changes under the reader, and
// shows the pending state while the server recomputes — a switch re-renders
// the whole page, which takes a few seconds on a large store.
export function ChannelFilterControl({
  value,
  query,
  locale
}: {
  value: SalesChannelFilter;
  query: Record<string, string | string[] | undefined>;
  locale: "he" | "en";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<SalesChannelFilter | null>(null);
  const hrefFor = (channel: SalesChannelFilter) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k === "channel" || v === undefined) continue;
      params.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (channel !== "all") params.set("channel", channel);
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  };
  const go = (channel: SalesChannelFilter) => {
    if (channel === value || pending) return;
    setTarget(channel);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startTransition(() => router.push(hrefFor(channel) as any));
  };
  const t = (he: string, en: string) => (locale === "he" ? he : en);
  return (
    <div className="inline-flex items-center gap-2">
      <div role="group" aria-label={t("ערוץ מכירה", "Sales channel")} aria-busy={pending} className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
        {SALES_CHANNEL_FILTERS.map((c) => {
          const active = pending ? c === target : c === value;
          return (
            <button
              key={c}
              type="button"
              onClick={() => go(c)}
              disabled={pending}
              aria-pressed={active}
              className={cn("inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium disabled:cursor-wait", active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {pending && c === target ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {SALES_CHANNEL_FILTER_LABEL[c][locale]}
            </button>
          );
        })}
      </div>
      {pending ? <span className="text-xs text-muted-foreground">{t("מחשבת מחדש…", "Recalculating…")}</span> : null}
    </div>
  );
}
