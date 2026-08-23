"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/components/sync/sync-status-provider";

// Attribution sync can walk thousands of orders. It now runs through the
// app-shell sync provider so the founder can leave this page (or close a
// modal) and still see progress + the result in the floating dock.
// Falls back to a local run when no provider is mounted (print pages).

export function AffiliateAttributionSyncButton({
  storeId,
  label,
  locale = "he"
}: {
  storeId: string;
  label?: string;
  locale?: "he" | "en";
}) {
  const router = useRouter();
  const sync = useSyncStatus();
  const [message, setMessage] = useState<string | null>(null);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const resolvedLabel = label ?? lang("סנכרון שיוכי שותפים משופיפיי", "Sync affiliate attributions from Shopify");
  const jobId = "affiliate-attribution";
  const isPending = sync?.isRunning(jobId) ?? false;

  function handleSync() {
    setMessage(null);
    sync?.startSync({
      id: jobId,
      label: lang("שיוכי שותפים", "Affiliate attributions"),
      url: "/api/affiliate-portal/sync-attribution",
      body: { storeId },
      describeResult: (payload) => {
        const syncedOrders = Number(payload.syncedOrders ?? 0);
        const affiliatesMatched = Number(payload.affiliatesMatched ?? 0);
        return syncedOrders > 0
          ? lang(
              `סונכרנו ${syncedOrders} הזמנות עבור ${affiliatesMatched} שותפים`,
              `Synced ${syncedOrders} orders across ${affiliatesMatched} affiliates`
            )
          : lang(
              "הסנכרון הושלם — לא נמצאו הזמנות תואמות",
              "Sync completed — no matching affiliate orders found"
            );
      },
      onDone: () => router.refresh()
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={handleSync} disabled={isPending}>
        {isPending ? lang("מסנכרן ברקע…", "Syncing in background…") : resolvedLabel}
      </Button>
      {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
    </div>
  );
}
