"use client";

// One-click "re-sync orders in this window" — re-fetches every order created
// in the selected window from Shopify and rewrites its lines / discount
// usages / refunds. Fixes the discount-basis split between the dashboard and
// this page (H-14) and recovers orders the incremental sync never stored
// (R-02/R-04). Same job plumbing as the refunds backfill so it survives
// navigation; refreshes the page when done.

import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useSyncStatus } from "@/components/sync/sync-status-provider";

export function ResyncWindowButton({
  storeId,
  start,
  end,
  locale
}: {
  storeId: string;
  /** ISO instants of the selected reporting window. */
  start: string;
  end: string;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const router = useRouter();
  const sync = useSyncStatus();
  const jobId = `resync-window:${start}:${end}`;
  const running = sync?.isRunning(jobId) ?? false;

  const run = () => {
    sync?.startSync({
      id: jobId,
      label: isHe ? "סנכרון מחדש של הזמנות בחלון" : "Re-sync orders in window",
      url: "/api/shopify/resync-window",
      body: { storeId, start, end },
      describeResult: (body) =>
        isHe ? `סונכרנו מחדש ${body.fetched} הזמנות` : `Re-synced ${body.fetched} orders`,
      onDone: () => router.refresh()
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={running}
      title={
        isHe
          ? "מושך מחדש מ-Shopify את כל ההזמנות שנוצרו בחלון הנבחר ומעדכן שורות, הנחות והחזרים. בטוח להריץ שוב."
          : "Re-fetches every order created in the selected window from Shopify and rewrites its lines, discounts and refunds. Safe to rerun."
      }
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-green-300 hover:text-foreground disabled:opacity-60"
    >
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {running
        ? isHe
          ? "מסנכרן הזמנות…"
          : "Re-syncing orders…"
        : isHe
          ? "סנכרון מחדש של ההזמנות בחלון"
          : "Re-sync orders in this window"}
    </button>
  );
}
