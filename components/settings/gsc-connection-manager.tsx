"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Shape returned by GET /api/gsc/connection/status
type GscConnectionStatus = {
  status: string;
  tokenLastFour: string | null;
  healthMessage: string | null;
  lastSyncAt: string | null;
  connectedAt: string;
  updatedAt: string;
} | null;

/**
 * GSC connection card rendered inside the Settings page.
 *
 * Connection flow:
 *   1. User clicks "Connect Google Search Console".
 *   2. Browser navigates to GET /api/gsc/oauth/start?storeId=<id>.
 *   3. Route redirects to Google consent screen.
 *   4. Google redirects to /api/gsc/oauth/callback?code=...&state=...
 *   5. Callback persists the refresh token and redirects to /settings?gsc_connected=true.
 *   6. The page re-renders and the component fetches updated status from
 *      /api/gsc/connection/status.
 *
 * If GOOGLE_OAUTH_CLIENT_ID is absent the start route fails and redirects
 * back to /settings?gsc_error=GOOGLE_OAUTH_CLIENT_ID+not+set.
 */
export function GscConnectionManager({
  storeId,
  initialConnection,
  gscConnected,
  gscError
}: {
  storeId: string;
  initialConnection: GscConnectionStatus;
  /** true when the page was loaded after a successful OAuth callback */
  gscConnected?: boolean;
  /** non-null when the OAuth flow returned an error */
  gscError?: string | null;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<GscConnectionStatus>(initialConnection);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(gscError ?? null);
  const [successMsg, setSuccessMsg] = useState<string | null>(
    gscConnected ? "Google Search Console connected successfully." : null
  );

  const isConnected = connection?.status === "connected";

  async function refreshStatus() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/gsc/connection/status?storeId=${encodeURIComponent(storeId)}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setConnection(body.connection ?? null);
      }
    } catch {
      // Non-fatal — stale UI is acceptable here
    } finally {
      setRefreshing(false);
    }
  }

  function startOAuth() {
    setError(null);
    setSuccessMsg(null);
    // Full-page navigation so Google's redirect_uri flow completes correctly.
    window.location.href = `/api/gsc/oauth/start?storeId=${encodeURIComponent(storeId)}`;
  }

  async function disconnect() {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/gsc/connection/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body?.error ?? "Failed to disconnect.");
      }
      setConnection(null);
      setSuccessMsg("Google Search Console disconnected.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
            <Search className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">Google Search Console</CardTitle>
          {isConnected ? (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Connected
            </span>
          ) : (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
              <XCircle className="h-3 w-3" aria-hidden />
              Not connected
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Sync organic search impressions, clicks, and top queries directly from Google Search Console into
          your analytics dashboard.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {successMsg ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {successMsg}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            {error}
          </p>
        ) : null}

        {isConnected && connection ? (
          <div className="space-y-2 rounded-lg border border-border bg-background/70 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</span>
              <span className="font-semibold text-emerald-700">{connection.status}</span>
            </div>
            {connection.tokenLastFour ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Token (last 4)
                </span>
                <span className="font-mono text-xs">••••{connection.tokenLastFour}</span>
              </div>
            ) : null}
            {connection.lastSyncAt ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last synced
                </span>
                <span suppressHydrationWarning className="tabular-nums">
                  {new Date(connection.lastSyncAt).toLocaleString()}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last synced
                </span>
                <span className="text-muted-foreground">Pending first cron run</span>
              </div>
            )}
            {connection.healthMessage ? (
              <p className="mt-1 text-xs text-amber-700">{connection.healthMessage}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {isConnected ? (
            <>
              <Button variant="secondary" size="sm" onClick={refreshStatus} disabled={refreshing}>
                {refreshing ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Refresh status
              </Button>
              <Button variant="secondary" size="sm" onClick={startOAuth}>
                Reconnect
              </Button>
              <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startOAuth}>
              Connect Google Search Console
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Requires a verified property in{" "}
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Google Search Console
          </a>{" "}
          for your store domain. Only read-only access is requested.
        </p>
      </CardContent>
    </Card>
  );
}
