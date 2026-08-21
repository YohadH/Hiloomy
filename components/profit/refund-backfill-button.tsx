"use client";

// One-click returns backfill — re-fetches refunded orders from Shopify so
// historical refunds get attributed to specific products/variants. Lives
// inside the coverage banner on /profit/returns; refreshes the page when
// done so the tables pick up the newly-attributed lines.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/toast";

export function RefundBackfillButton({ storeId, locale }: { storeId: string; locale: "he" | "en" }) {
  const isHe = locale === "he";
  const [running, setRunning] = useState(false);
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/shopify/backfill-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(
        isHe
          ? `סונכרנו ${body.fetched} הזמנות עם החזרים — הטבלאות מתרעננות`
          : `Re-synced ${body.fetched} refunded orders — refreshing tables`
      );
      router.refresh();
    } catch (err) {
      toast.error(err, { fallback: isHe ? "הסנכרון נכשל" : "Backfill failed" });
    } finally {
      setRunning(false);
    }
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
