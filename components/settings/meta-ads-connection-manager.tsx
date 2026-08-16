"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MetaAdsConnectionSummary = {
  storeId: string;
  adAccountId: string;
  adAccountName?: string | null;
  accountStatus?: number | null;
  currency?: string | null;
  timezoneName?: string | null;
  appId?: string | null;
  hasAppSecret?: boolean;
  tokenLastFour?: string | null;
  tokenType?: string | null;
  tokenIssuedAt?: string | null;
  tokenExpiresAt?: string | null;
  tokenScopes?: string[];
  tokenHealth?: {
    status: string;
    label: string;
  };
  syncStatus: string;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  latestRun?: {
    status: string;
    startedAt: string;
    completedAt?: string | null;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errorMessage?: string | null;
  } | null;
};

// NOTE: callers that render this value directly in JSX must add
// suppressHydrationWarning on the containing element — toLocaleString()
// uses Node.js locale on the server and the browser locale on the client,
// which produces different strings and triggers React hydration error #418.
function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function MetaAdsConnectionManager({
  storeId,
  initialConnection
}: {
  storeId: string;
  initialConnection: MetaAdsConnectionSummary | null;
}) {
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState(initialConnection?.adAccountId ?? "act_377633231410032");
  const [appId, setAppId] = useState(initialConnection?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [exchangeToken, setExchangeToken] = useState(true);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [connection, setConnection] = useState(initialConnection);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function refreshStatus() {
    const response = await fetch(`/api/meta-ads/connection/status?storeId=${encodeURIComponent(storeId)}`);
    const payload = await response.json();
    if (response.ok && payload.ok) {
      setConnection(payload.connection ?? null);
      if (payload.connection?.adAccountId) {
        setAdAccountId(payload.connection.adAccountId);
      }
      if (payload.connection?.appId) {
        setAppId(payload.connection.appId);
      }
    }
  }

  async function runAction(action: string, handler: () => Promise<string>) {
    setLoading(action);
    setError(null);
    setMessage(null);
    try {
      const successMessage = await handler();
      setMessage(successMessage);
      await refreshStatus().catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Meta Ads request failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta Ads connection</CardTitle>
        <CardDescription>
          Save a server-side Meta access token and ad account so the planner can sync daily campaign performance, ad creatives, preview links, purchases, ROAS, CTR, CPC, and funnel events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Meta access token</span>
            <input
              type="password"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={connection?.tokenLastFour ? `Saved token ending ${connection.tokenLastFour}` : "EAAM..."}
            />
            <span className="block text-xs leading-5 text-muted-foreground">
              Paste a short-lived Graph Explorer token to exchange, or a System User token if you turn off exchange below.
            </span>
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Ad account ID</span>
            <input
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={adAccountId}
              onChange={(event) => setAdAccountId(event.target.value)}
              placeholder="act_377633231410032"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Meta App ID</span>
            <input
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder="1205682261514110"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Meta App Secret</span>
            <input
              type="password"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder={connection?.hasAppSecret ? "Saved app secret" : "App secret"}
            />
          </label>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">
          Required permissions: ads_read and business_management. The token and app secret are encrypted server-side and never shown again after save.
        </p>
        <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={exchangeToken}
            onChange={(event) => setExchangeToken(event.target.checked)}
          />
          <span>
            <span className="block font-medium">Exchange token into a long-lived user token</span>
            <span className="mt-1 block text-muted-foreground">
              Keep this on for Graph API Explorer/user tokens. Turn it off only if you paste a Business Manager System User token.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={loading !== null}
            onClick={() =>
              runAction("save", async () => {
                const response = await fetch("/api/meta-ads/connection/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storeId, accessToken, adAccountId, appId, appSecret, exchangeToken })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                  throw new Error(payload.error ?? "Could not save Meta Ads connection.");
                }
                setAccessToken("");
                setAppSecret("");
                return `Meta Ads connected to ${payload.connection.adAccountName ?? payload.connection.adAccountId}.`;
              })
            }
          >
            {loading === "save" ? "Saving..." : "Save Meta Ads token"}
          </Button>

          <Button
            variant="secondary"
            disabled={loading !== null || !connection}
            onClick={() =>
              runAction("refresh", async () => {
                const response = await fetch("/api/meta-ads/connection/refresh", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storeId, accessToken, appId, appSecret })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                  throw new Error(payload.error ?? "Could not regenerate Meta token.");
                }
                setAccessToken("");
                setAppSecret("");
                return `Meta token regenerated. ${payload.connection.tokenHealth?.label ?? ""}`;
              })
            }
          >
            {loading === "refresh" ? "Regenerating..." : "Regenerate long-lived token"}
          </Button>

          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value)}
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
          >
            <option value="last_7d">Last 7 days</option>
            <option value="last_14d">Last 14 days</option>
            <option value="last_30d">Last 30 days</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>

          <Button
            variant="secondary"
            disabled={loading !== null || !connection}
            onClick={() =>
              runAction("sync", async () => {
                const response = await fetch("/api/meta-ads/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storeId, datePreset })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                  throw new Error(payload.error ?? "Could not sync Meta Ads.");
                }
                return `Meta Ads synced ${payload.campaignsFetched} daily campaign row(s) and ${payload.adsFetched ?? 0} daily ad/creative row(s): ${payload.recordsCreated} new, ${payload.recordsUpdated} updated.`;
              })
            }
          >
            {loading === "sync" ? "Syncing..." : "Sync Meta Ads daily + creatives"}
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {connection ? `${connection.adAccountName ?? "Meta account"} (${connection.adAccountId})` : "Meta Ads not connected"}
            </p>
            <p className="text-muted-foreground">{connection?.syncStatus ?? "not_connected"}</p>
          </div>
          {connection ? (
            <div className="mt-3 space-y-1 text-muted-foreground">
              <p>Currency/timezone: {connection.currency ?? "-"} / {connection.timezoneName ?? "-"}</p>
              <p>App: {(connection.appId ?? appId) || "-"} / secret {connection.hasAppSecret ? "saved" : "missing"}</p>
              <p>
                Token: {connection.tokenLastFour ? `ending ${connection.tokenLastFour}` : "saved"}
                {connection.tokenType ? ` / ${connection.tokenType}` : ""}
              </p>
              {/* suppressHydrationWarning: formatDateTime() uses toLocaleString() which
                  resolves differently on the server (Node locale) vs browser (user locale). */}
              <p suppressHydrationWarning>
                Token health: {connection.tokenHealth?.label ?? "Expiry unknown"}
                {connection.tokenExpiresAt ? ` (${formatDateTime(connection.tokenExpiresAt)})` : ""}
              </p>
              {connection.tokenScopes?.length ? (
                <p>Scopes: {connection.tokenScopes.slice(0, 8).join(", ")}{connection.tokenScopes.length > 8 ? "..." : ""}</p>
              ) : null}
              <p suppressHydrationWarning>Last sync: {formatDateTime(connection.lastSyncAt)}</p>
              {connection.latestRun ? (
                <p>
                  Latest run: {connection.latestRun.status}, created {connection.latestRun.recordsCreated}, updated {connection.latestRun.recordsUpdated}
                </p>
              ) : null}
              {connection.lastSyncError ? <p className="text-danger">{connection.lastSyncError}</p> : null}
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">Paste a Meta token, App ID/App Secret, and the Incense ad account ID to connect.</p>
          )}
        </div>

        {message ? <p className="text-sm text-success">{message}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
