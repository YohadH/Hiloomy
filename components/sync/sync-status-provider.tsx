"use client";

// Background sync state (2026-08-23).
//
// Problem this solves: every "Sync now" button owned its own `busy`
// useState and its own fetch. Closing the modal unmounted the component,
// so the founder lost the spinner, the result, and any error — with no
// way to tell whether the sync was still running, had finished, or had
// died. Navigating to another page did the same.
//
// This provider lives in AppShell, ABOVE the router outlet, so it is not
// unmounted by modal close or by client-side navigation. Jobs started
// here keep running and keep reporting; the dock renders their state on
// every page.
//
// Scope is honest: a full page RELOAD still cancels in-flight fetches
// (nothing survives a document teardown). For that case each connector
// also persists `lastSyncAt` server-side, and jobs are mirrored into
// sessionStorage so the dock can say "was interrupted — check status"
// rather than silently forgetting.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type SyncJobStatus = "running" | "success" | "error";

export interface SyncJob {
  /** Stable per source, e.g. "ga4" — starting the same id twice is a no-op. */
  id: string;
  label: string;
  status: SyncJobStatus;
  startedAt: number;
  finishedAt?: number;
  /** Result line shown in the dock, e.g. "90 ימים · 1,240 שורות". */
  detail?: string;
  error?: string;
}

interface StartSyncInput {
  id: string;
  label: string;
  url: string;
  body?: Record<string, unknown>;
  /** Turn the JSON response into the dock's one-line result. */
  describeResult?: (body: any) => string;
  /** Called on success so the page can refresh its data. */
  onDone?: () => void;
}

interface SyncContextValue {
  jobs: SyncJob[];
  startSync: (input: StartSyncInput) => void;
  isRunning: (id: string) => boolean;
  getJob: (id: string) => SyncJob | undefined;
  dismiss: (id: string) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const STORAGE_KEY = "hiloomy:sync-jobs";

export function SyncStatusProvider({
  children,
  locale = "he"
}: {
  children: React.ReactNode;
  locale?: "he" | "en";
}) {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  // Ref mirror so startSync can check "already running" without adding
  // `jobs` to its dependency list (which would recreate the callback on
  // every tick and re-render every consumer).
  const jobsRef = useRef<SyncJob[]>([]);
  jobsRef.current = jobs;

  const isHe = locale === "he";

  // Recover interrupted jobs after a reload: anything still marked
  // "running" in sessionStorage can't be running any more (its fetch died
  // with the document), so surface it as interrupted instead of lying.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as SyncJob[];
      const recovered = stored
        .filter((j) => j.status === "running")
        .map<SyncJob>((j) => ({
          ...j,
          status: "error",
          finishedAt: Date.now(),
          error: isHe
            ? "הסנכרון נקטע ברענון הדף — בדקו את סטטוס החיבור."
            : "Sync was interrupted by a page reload — check the connection status."
        }));
      if (recovered.length > 0) setJobs(recovered);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage unavailable (private mode) — non-fatal.
    }
  }, [isHe]);

  // Mirror running jobs so the recovery pass above has something to read.
  useEffect(() => {
    try {
      const running = jobs.filter((j) => j.status === "running");
      if (running.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(running));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [jobs]);

  // Warn before leaving while a sync is mid-flight.
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running");
    if (!hasRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [jobs]);

  const upsert = useCallback((job: SyncJob) => {
    setJobs((current) => {
      const rest = current.filter((j) => j.id !== job.id);
      return [...rest, job];
    });
  }, []);

  const startSync = useCallback(
    ({ id, label, url, body, describeResult, onDone }: StartSyncInput) => {
      if (jobsRef.current.some((j) => j.id === id && j.status === "running")) return;

      const startedAt = Date.now();
      upsert({ id, label, status: "running", startedAt });

      // Deliberately NOT awaited and NOT tied to any component's lifetime:
      // the promise is owned by this provider, which outlives modals and
      // page transitions.
      void (async () => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {})
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || payload?.ok === false) {
            throw new Error(
              payload?.error || (isHe ? `שגיאה ${res.status}` : `HTTP ${res.status}`)
            );
          }
          upsert({
            id,
            label,
            status: "success",
            startedAt,
            finishedAt: Date.now(),
            detail: describeResult ? describeResult(payload) : undefined
          });
          onDone?.();
        } catch (err) {
          upsert({
            id,
            label,
            status: "error",
            startedAt,
            finishedAt: Date.now(),
            error:
              err instanceof Error
                ? err.message
                : isHe
                  ? "הסנכרון נכשל"
                  : "Sync failed"
          });
        }
      })();
    },
    [isHe, upsert]
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      jobs,
      startSync,
      isRunning: (id) => jobs.some((j) => j.id === id && j.status === "running"),
      getJob: (id) => jobs.find((j) => j.id === id),
      dismiss: (id) => setJobs((current) => current.filter((j) => j.id !== id))
    }),
    [jobs, startSync]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/**
 * Returns null when no provider is mounted (e.g. print pages), so callers
 * can fall back to local state instead of crashing.
 */
export function useSyncStatus(): SyncContextValue | null {
  return useContext(SyncContext);
}
