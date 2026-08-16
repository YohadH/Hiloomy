"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useSaasStrings, type UiLocale } from "@/lib/i18n/saas-strings";

// "Sync now" — fires the unified refresh-all cron route on demand.
// Lives in the topbar alongside the date picker so the operator can
// pull fresh Meta Ads + Shopify + Instagram data without waiting for
// the 2h cron tick.
//
// The route is the same one the cron hits; it fans out per store and
// runs all three sources in parallel. Typical wall-clock: 5-30 seconds
// for a single store depending on how many new orders / ad rows landed
// since the last sync.

export function SyncNowButton({ locale = "he" }: { locale?: UiLocale }) {
  const router = useRouter();
  const t = useSaasStrings(locale).syncNow;
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (state === "running") return;
    setState("running");
    setError(null);
    try {
      const res = await fetch("/api/cron/refresh-all", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.ok === false) {
        throw new Error(body?.message ?? `Sync returned ${res.status}`);
      }
      setState("done");
      // Refresh the server-rendered page so the freshly-pulled data shows up
      // immediately rather than waiting for the next navigation.
      router.refresh();
      // Reset the visual back to idle after a couple of seconds.
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
      setTimeout(() => {
        setState("idle");
        setError(null);
      }, 5000);
    }
  };

  const label =
    state === "running" ? t.running
      : state === "done" ? t.done
      : state === "error" ? t.error
      : t.idle;

  const Icon =
    state === "running" ? Loader2 : state === "done" ? CheckCircle2 : state === "error" ? AlertTriangle : RefreshCw;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "running"}
        title={error ?? t.tooltip}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          state === "done"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : state === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-border bg-card text-foreground hover:bg-muted/60"
        } disabled:cursor-wait disabled:opacity-80`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${state === "running" ? "animate-spin" : ""}`}
          aria-hidden
        />
        {label}
      </button>
      {error ? (
        <p className="absolute right-0 top-full z-50 mt-1 max-w-xs rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-900 shadow-md">
          {error}
        </p>
      ) : null}
    </div>
  );
}
