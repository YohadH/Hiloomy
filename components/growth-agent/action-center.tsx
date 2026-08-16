"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GrowthAction } from "@/lib/domain/growth-agent-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";

export function GrowthActionCenter({
  actions,
  storeId,
  title = "Action Center"
}: {
  actions: GrowthAction[];
  storeId: string;
  title?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAction(actionId: string, type: "approve" | "reject") {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/growth-agent/actions/${actionId}/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvedBy: "merchant", storeId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Action update failed");
        setMessage(type === "approve" ? "Action approved." : "Action rejected.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Action update failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {actions.length ? actions.map((action) => {
          const canUpdate = action.id.startsWith("growth-action-");
          return (
          <div key={action.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <GrowthStatusBadge status={action.status} />
                  <GrowthStatusBadge status={action.riskLevel} />
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{action.actionType}</span>
                </div>
                <p className="text-base font-semibold">{action.title}</p>
                <p className="text-sm text-muted-foreground">{action.reason}</p>
                <p className="text-sm text-muted-foreground">Estimated impact: {String(action.estimatedImpact?.expectedOutcome ?? "No estimate")}</p>
                <p className="text-sm text-muted-foreground">Confidence {Math.round(action.confidenceScore * 100)}%</p>
                {action.failureReason ? <p className="text-sm text-rose-600">{action.failureReason}</p> : null}
              </div>
              <div className="flex flex-wrap gap-3 xl:justify-end">
                {action.status === "pending_approval" && canUpdate ? (
                  <>
                    <Button type="button" size="sm" onClick={() => handleAction(action.id, "approve")} disabled={isPending}>Approve</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => handleAction(action.id, "reject")} disabled={isPending}>Reject</Button>
                  </>
                ) : null}
              </div>
            </div>
              {!canUpdate && action.status === "pending_approval" ? <p className="mt-3 text-sm text-muted-foreground">This is a preview action. Run a fresh scan to generate a real approval record.</p> : null}
          </div>
        );
        }) : <p className="text-sm text-muted-foreground">No actions yet. Run a scan to let the agent prepare recommendations and approvals.</p>}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
