"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface GrowthAgentManualControlsProps {
  storeId: string;
  locale?: "he" | "en";
}

export function GrowthAgentManualControls({ storeId, locale = "he" }: GrowthAgentManualControlsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  function run(endpoint: string, successMessage: string | ((payload: any) => string)) {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? lang("הבקשה נכשלה", "Request failed"));
        setMessage(typeof successMessage === "function" ? successMessage(payload) : successMessage);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : lang("הבקשה נכשלה", "Request failed"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold">{lang("בקרות ידניות", "Manual controls")}</p>
          <p className="text-sm text-muted-foreground">{lang("הפעילו סנכרון, בדיקת תקינות, סריקת אנומליות או סריקת גילוי מוצרים בסגנון Zendrop לפי דרישה.", "Trigger sync, health checks, anomaly scans, or a Zendrop-style product discovery crawl on demand.")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => run("/api/growth-agent/health-check", lang("בדיקת התקינות הושלמה.", "Health check completed."))} disabled={isPending}>{lang("בדיקת תקינות", "Test health")}</Button>
          <Button type="button" variant="secondary" onClick={() => run("/api/growth-agent/sync", lang("סנכרון המדדים הושלם.", "Metric sync completed."))} disabled={isPending}>{lang("הרצת סנכרון ידני", "Run manual sync")}</Button>
          <Button type="button" variant="secondary" onClick={() => run("/api/growth-agent/product-recommendations", (payload) => isHe ? `הקראולר מצא ${payload.recommendationCount ?? 0} רעיונות מוצרים.` : `Crawler found ${payload.recommendationCount ?? 0} product idea${payload.recommendationCount === 1 ? "" : "s"}.`)} disabled={isPending}>{lang("חיפוש רעיונות למוצרים", "Find product ideas")}</Button>
          <Button type="button" onClick={() => run("/api/growth-agent/scan", (payload) => isHe ? `הסריקה הידנית הושלמה עם ${payload.findingsCount ?? 0} ממצאים ו-${payload.productRecommendations ?? 0} רעיונות מוצרים.` : `Manual scan completed with ${payload.findingsCount ?? 0} findings and ${payload.productRecommendations ?? 0} sourced product idea${payload.productRecommendations === 1 ? "" : "s"}.`)} disabled={isPending}>{isPending ? lang("מריץ…", "Running...") : lang("הרצת סריקה ידנית", "Run manual scan")}</Button>
        </div>
      </div>
      {message ? <p className="text-sm text-muted-foreground md:max-w-3xl">{message}</p> : null}
    </div>
  );
}
