"use client";

// Floating sync dock — the answer to "I closed the modal and now I don't
// know what's happening". Renders in the app shell on every page, so a
// sync started in Settings stays visible while the founder browses.
//
// Behavior: running jobs show a spinner and elapsed seconds; finished
// jobs stay ~8s then auto-dismiss; failures stay until dismissed, since
// an error the user never saw is the whole bug we're fixing.

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import { useSyncStatus, type SyncJob } from "@/components/sync/sync-status-provider";
import { cn } from "@/lib/utils";

const SUCCESS_TTL_MS = 8000;

function elapsedLabel(job: SyncJob, now: number, isHe: boolean) {
  const ms = (job.finishedAt ?? now) - job.startedAt;
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return isHe ? `${s} שנ׳` : `${s}s`;
  const m = Math.floor(s / 60);
  return isHe ? `${m} דק׳` : `${m}m`;
}

export function SyncStatusDock({ locale = "he" }: { locale?: "he" | "en" }) {
  const sync = useSyncStatus();
  const isHe = locale === "he";
  const [now, setNow] = useState(() => Date.now());

  const hasRunning = sync?.jobs.some((j) => j.status === "running") ?? false;

  // Tick only while something is running — no idle timers.
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasRunning]);

  // Auto-dismiss successes; keep failures until acknowledged.
  useEffect(() => {
    if (!sync) return;
    const done = sync.jobs.filter(
      (j) => j.status === "success" && j.finishedAt && now - j.finishedAt > SUCCESS_TTL_MS
    );
    for (const job of done) sync.dismiss(job.id);
  }, [now, sync]);

  // Keep the "now" clock fresh enough for the auto-dismiss check even
  // after the last job finishes.
  useEffect(() => {
    if (!sync || sync.jobs.length === 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [sync, now]);

  if (!sync || sync.jobs.length === 0) return null;

  return (
    <div
      dir={isHe ? "rtl" : "ltr"}
      className="pointer-events-none fixed bottom-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 ltr:left-4 rtl:right-4"
      role="status"
      aria-live="polite"
    >
      {sync.jobs.map((job) => (
        <div
          key={job.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg backdrop-blur",
            job.status === "running" && "border-emerald-300 bg-emerald-50/95",
            job.status === "success" && "border-emerald-300 bg-white/95",
            job.status === "error" && "border-rose-300 bg-rose-50/95"
          )}
        >
          <span className="mt-0.5 shrink-0">
            {job.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" aria-hidden />
            ) : job.status === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-700" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">
              {job.label}
              {job.status === "running" ? (
                <span className="ms-1.5 font-normal text-muted-foreground">
                  {isHe ? "מסנכרן…" : "syncing…"} {elapsedLabel(job, now, isHe)}
                </span>
              ) : null}
            </p>
            {job.status === "running" ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isHe
                  ? "רץ ברקע — אפשר להמשיך לעבוד."
                  : "Running in the background — keep working."}
              </p>
            ) : job.status === "success" ? (
              <p className="mt-0.5 text-xs text-emerald-800">
                {job.detail ?? (isHe ? "הסתיים בהצלחה" : "Completed")}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-rose-800">{job.error}</p>
            )}
          </div>
          {job.status !== "running" ? (
            <button
              type="button"
              onClick={() => sync.dismiss(job.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={isHe ? "סגירה" : "Dismiss"}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
