"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";

interface ProductRecommendationsPanelProps {
  recommendations: GrowthProductRecommendation[];
  currency: string;
  storeId: string;
}

export function ProductRecommendationsPanel({ recommendations, currency, storeId }: ProductRecommendationsPanelProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function importRecommendation(recommendation: GrowthProductRecommendation) {
    setPendingId(recommendation.id);
    startTransition(async () => {
      try {
        const response = await fetch("/api/growth-agent/product-recommendations/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recommendation, storeId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not create the draft product.");
        }

        setStatusMap((current) => ({
          ...current,
          [recommendation.id]: `Draft created in Shopify: ${payload.title}`
        }));
        router.refresh();
      } catch (error) {
        setStatusMap((current) => ({
          ...current,
          [recommendation.id]: error instanceof Error ? error.message : "Could not create the draft product."
        }));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sourced product ideas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recommendations.slice(0, 6).map((recommendation) => {
          const message = statusMap[recommendation.id];
          const isImporting = isPending && pendingId === recommendation.id;

          return (
            <div key={recommendation.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="space-y-2">
                <p className="font-semibold">{recommendation.title}</p>
                <p className="text-sm text-muted-foreground">{recommendation.summary}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{recommendation.sourceDomain} · score {recommendation.score}</p>
                <p className="text-sm text-muted-foreground">{recommendation.price ? `${currency} ${recommendation.price}` : "Price not detected"}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <a href="/growth-agent/supplier-orders">
                    <Button type="button" variant="secondary" size="sm">Map supplier</Button>
                  </a>
                  <a href={recommendation.sourceUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="secondary" size="sm">Open source</Button>
                  </a>
                  <Button type="button" size="sm" onClick={() => importRecommendation(recommendation)} disabled={isPending}>
                    {isImporting ? "Adding..." : "Add to Shopify"}
                  </Button>
                </div>
                {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
