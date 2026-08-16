"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AffiliateAttributionSyncButton({
  storeId,
  label = "Sync affiliate attributions from Shopify"
}: {
  storeId: string;
  label?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/sync-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Affiliate attribution sync failed.");
        }
        const syncedOrders = Number(payload.syncedOrders ?? 0);
        const affiliatesMatched = Number(payload.affiliatesMatched ?? 0);
        setMessage(
          syncedOrders > 0
            ? `Affiliate attribution sync completed. Synced ${syncedOrders} orders across ${affiliatesMatched} affiliates.`
            : "Sync completed, but no matching affiliate orders were found yet."
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Affiliate attribution sync failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={handleSync} disabled={isPending}>
        {isPending ? "Syncing..." : label}
      </Button>
      {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
    </div>
  );
}
