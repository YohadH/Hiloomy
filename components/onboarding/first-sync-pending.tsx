"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";

// Shown on the Command Center for orgs that JUST connected their first
// Shopify and are waiting for the initial sync to complete. Polls
// /api/shopify/sync/status every 5s; when the first sync finishes
// (overview KPIs come back non-zero), it auto-refreshes the page.
//
// Falls back to a "Sync now" button if polling doesn't progress in 60s.

export function FirstSyncPending({
  storeId,
  locale = "he"
}: {
  storeId: string;
  locale?: "he" | "en";
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t =
    locale === "he"
      ? {
          title: "אנחנו מושכים את הנתונים מShopify…",
          body:
            "זה לוקח בין 30 שניות לכמה דקות בהתאם לכמות ההזמנות. נטען מחדש את הדף אוטומטית כשהנתונים מוכנים.",
          syncNow: "סנכרון ידני עכשיו",
          syncing: "מסנכרן…",
          tip: "טיפ: בזמן שהסנכרון רץ אפשר להוסיף בהגדרות את חיבור Meta Ads וInstagram."
        }
      : {
          title: "Pulling your Shopify data…",
          body:
            "This takes 30 seconds to a few minutes depending on order volume. We'll reload automatically when it's ready.",
          syncNow: "Sync now",
          syncing: "Syncing…",
          tip: "Tip: You can add Meta Ads + Instagram connections in Settings while this runs."
        };

  // Tick a counter so the UI doesn't feel frozen.
  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll sync status — refresh when complete.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/shopify/sync/status?storeId=${encodeURIComponent(storeId)}`);
        const body = await res.json();
        if (body?.connection?.lastSyncAt) {
          router.refresh();
        }
      } catch {
        // ignore poll errors
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [router, storeId]);

  const handleManualSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/cron/refresh-all", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const showFallback = elapsed >= 60;

  return (
    <div
      dir={locale === "he" ? "rtl" : "ltr"}
      className="min-h-[50vh] flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/40 to-indigo-50/40 p-8 text-center shadow-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-100 text-violet-700 mb-4">
          <Sparkles className="h-6 w-6 animate-pulse" aria-hidden />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{t.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-card px-3 py-1 text-xs text-violet-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`}
        </div>

        {showFallback ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-muted/60 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              {syncing ? t.syncing : t.syncNow}
            </button>
            {error ? (
              <p className="mt-2 text-[11px] text-rose-700">{error}</p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-6 text-[11px] text-muted-foreground">{t.tip}</p>
      </div>
    </div>
  );
}
