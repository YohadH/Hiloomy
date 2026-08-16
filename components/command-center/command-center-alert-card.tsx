"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  X,
  Clock,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Card rendered on the Command Center for one alert from the normalized
// Alert table. Differs from the existing AlertCard in three ways:
//   1. Supports the `critical` severity tier the new writers produce.
//   2. Carries action buttons that update alert status via the API.
//   3. Renders click-through link to the related entity when present.

export interface CommandCenterAlert {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  source: string;
  title: string;
  description: string;
  recommendedAction: string;
  metricName: string | null;
  currentValue: string | null;
  previousValue: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}

const SEVERITY_CARD = {
  critical: "border-red-400 bg-red-50",
  high: "border-rose-200 bg-rose-50/60",
  medium: "border-amber-200 bg-amber-50/60",
  low: "border-sky-200 bg-sky-50/60"
} as const;

const SEVERITY_PILL = {
  critical: "bg-red-700 text-white",
  high: "bg-rose-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-sky-500 text-white"
} as const;

// Hebrew labels use the 3-level UX system: קריטי / חשוב / נמוך.
// English keeps the full 4-level labels for clarity.
const SEVERITY_LABEL = {
  critical: { he: "קריטי", en: "Critical" },
  high: { he: "חשוב", en: "High" },
  medium: { he: "חשוב", en: "Medium" },
  low: { he: "נמוך", en: "Low" }
} as const;

const SEVERITY_ICON = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: Bell,
  low: Info
} as const;

export function CommandCenterAlertCard({
  alert,
  locale = "he"
}: {
  alert: CommandCenterAlert;
  locale?: "he" | "en";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  // Truncate long text to a short preview (≤120 chars) with expand toggle.
  const TRUNCATE_AT = 120;
  const descLong = alert.description.length > TRUNCATE_AT;
  const actionLong = (alert.recommendedAction ?? "").length > TRUNCATE_AT;
  const descText = expanded || !descLong
    ? alert.description
    : alert.description.slice(0, TRUNCATE_AT).trimEnd() + "…";
  const actionText = expanded || !actionLong
    ? (alert.recommendedAction ?? "")
    : (alert.recommendedAction ?? "").slice(0, TRUNCATE_AT).trimEnd() + "…";
  const hasLongContent = descLong || actionLong;

  const Icon = SEVERITY_ICON[alert.severity];
  const sevLabel = SEVERITY_LABEL[alert.severity][isHe ? "he" : "en"];

  const updateStatus = async (status: "acknowledged" | "ignored" | "resolved") => {
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${alert.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? "Failed to update alert.");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    }
  };

  return (
    <Card className={cn("border", SEVERITY_CARD[alert.severity])}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                SEVERITY_PILL[alert.severity]
              )}
            >
              <Icon className="h-3 w-3" />
              {sevLabel}
            </span>
            <span className="rounded-full border border-border bg-card/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {alert.source}
            </span>
          </div>
          {/* Time is rendered in the viewer's local timezone, which differs
              from the server's (UTC) — the hour/minute would not match across
              the server/client boundary. suppressHydrationWarning silences the
              expected React #418 mismatch for THIS element only; the client
              (local-time) value is the one we want the founder to see. */}
          <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
            {new Date(alert.createdAt).toLocaleString(isHe ? "he-IL" : "en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
        </div>

        <p className="text-sm font-semibold leading-snug">{alert.title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{descText}</p>

        {alert.recommendedAction ? (
          <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lang("פעולה מומלצת", "Suggested action")}
            </p>
            <p className="mt-1 text-xs leading-5">{actionText}</p>
          </div>
        ) : null}

        {hasLongContent ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" aria-hidden />
                {lang("פחות", "Show less")}
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden />
                {lang("קראו עוד", "Read more")}
              </>
            )}
          </button>
        ) : null}

        {alert.relatedEntityType && alert.relatedEntityId ? (
          <RelatedEntityLink
            type={alert.relatedEntityType}
            id={alert.relatedEntityId}
            isHe={isHe}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => updateStatus("acknowledged")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-accent disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3 w-3" aria-hidden />
            )}
            {lang("אישור — הבנתי", "Got it")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => updateStatus("resolved")}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Check className="h-3 w-3" aria-hidden />
            {lang("טופל", "Mark done")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => updateStatus("ignored")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
          >
            <X className="h-3 w-3" aria-hidden />
            {lang("התעלמות", "Dismiss")}
          </button>
          <span className="ms-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            {alert.type}
          </span>
        </div>

        {error ? (
          <p className="text-[11px] text-rose-700">⚠ {error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RelatedEntityLink({
  type,
  id,
  isHe
}: {
  type: string;
  id: string;
  isHe: boolean;
}) {
  // Route mapping: alert.relatedEntityType → an in-app page that gives context.
  // Keep it minimal for now — extend as more entity types start linking out.
  const href =
    type === "product"
      ? `/profit?productId=${encodeURIComponent(id)}`
      : type === "affiliate"
        ? `/affiliate-portal/affiliates/${encodeURIComponent(id)}`
        : null;
  if (!href) return null;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 underline-offset-2 hover:underline"
    >
      → {isHe ? "פתחו בהקשר" : "Open in context"}
    </a>
  );
}
