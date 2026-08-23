"use client";

// One-click returns backfill — re-fetches refunded orders from Shopify so
// historical refunds get attributed to specific products/variants. Lives
// inside the coverage banner on /profit/returns; refreshes the page when
// done so the tables pick up the newly-attributed lines.

import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useSyncStatus } from "@/components/sync/sync-status-provider";

export function RefundBackfillButton({ storeId, locale }: { storeId: string; locale: "he" | "en" }) {
  const isHe = locale === "he";
  const router = useRouter();
  const sync = useSyncStatus();
  // Re-fetches every refunded order in the store's history — by far the
  // longest sync in the app, so it must survive navigation.
  const jobId = "refund-backfill";
  const running = sync?.isRunning(jobId) ?? false;

  const run = () => {
    sync?.startSync({
      id: jobId,
      label: isHe ? "סנכרון החזרות היסטורי" : "Historical refunds backfill",
      url: "/api/shopify/backfill-refunds",
      body: { storeId },
      describeResult: (body) =>
        isHe
          ? `סונכרנו ${body.fetched} הזמנות עם החזרים`
          : `Re-synced ${body.fetched} refunded orders`,
      onDone: () => router.refresh()
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={running}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:border-amber-600 disabled:opacity-60"
    >
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {running
        ? isHe
          ? "מסנכרן החזרות…"
          : "Syncing refunds…"
        : isHe
          ? "סנכרון החזרות היסטורי"
          : "Backfill historical refunds"}
    </button>
  );
}
