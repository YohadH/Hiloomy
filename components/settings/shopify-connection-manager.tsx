"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HelpCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShopifyConnectionSummary, SyncRunSummary } from "@/lib/domain/types";
import { ShopifyOauthSection } from "@/components/settings/shopify-oauth-section";

// Map raw Shopify / network errors into plain-English remediations. The
// raw 401 "Invalid API key or access token" is technically accurate but
// useless to a non-developer — they need to know WHAT to fix.
function humanizeShopifyError(raw: string): string {
  const r = raw.toLowerCase();

  if (r.includes("401") || r.includes("invalid api key") || r.includes("unrecognized login")) {
    return "The token Shopify received was rejected as invalid. Make sure you pasted the Admin API access token (starts with shpat_), not the API key or secret. Re-check the token under Shopify Admin → Settings → Apps and sales channels → Develop apps → your app → API credentials.";
  }
  if (r.includes("403") || r.includes("forbidden") || r.includes("not authorized")) {
    return "The token is valid but doesn't have the required permissions. In Shopify Admin → your custom app → Configure Admin API scopes, grant: read_products, read_orders, read_customers, read_inventory (plus write_discounts if you use affiliate coupon creation).";
  }
  if (r.includes("404") || r.includes("could not find shop")) {
    return "The shop domain wasn't found. Use the full myshopify domain (e.g. yourstore.myshopify.com), not your storefront URL.";
  }
  if (r.includes("getaddrinfo") || r.includes("enotfound") || r.includes("dns")) {
    return "Could not reach the shop — the domain isn't resolving. Double-check the spelling (should look like yourstore.myshopify.com).";
  }
  if (r.includes("etimedout") || r.includes("timeout")) {
    return "Shopify took too long to respond. Try again in a moment.";
  }
  return raw;
}

// Soft client-side check: warn if the pasted value clearly isn't a custom
// app access token. Doesn't block submission — just nudges. shpat_ is the
// 2023+ format; older tokens may have other prefixes which we don't fail.
function tokenFormatWarning(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  if (t.startsWith("shpat_")) return null;
  if (t.length < 20) return "That looks too short — Shopify Admin tokens are usually 40+ characters.";
  if (/^[a-f0-9]{32}$/i.test(t)) {
    return "Looks like an API key, not the access token. The Admin API access token starts with shpat_ and is shown right below the API key in the Shopify app dashboard.";
  }
  return "Custom-app Admin API tokens normally start with shpat_. If yours doesn't, double-check it's the Admin access token (not API key, not API secret).";
}

interface SyncStatusPayload {
  connection: {
    storeId: string;
    shopDomain: string;
    connected: boolean;
    syncStatus: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
  } | null;
  recentRuns: SyncRunSummary[];
}

interface ShopifyLabels {
  title: string;
  description: string;
  shopDomain: string;
  shopDomainPlaceholder: string;
  token: string;
  tokenHelp?: string;
  tokenPlaceholder: string;
  testConnection: string;
  testing: string;
  saveCredentials: string;
  saving: string;
  testSuccess: string;
  saveSuccess: string;
  connectionFailed: string;
  saveFailed: string;
  unexpectedError: string;
  notConnected: string;
  syncRunning: string;
  connected: string;
  connectionState: string;
  lastSync: string;
  noSyncYet: string;
  syncControlsTitle: string;
  syncControlsDescription: string;
  runInitialSync: string;
  runningInitialSync: string;
  runIncrementalSync: string;
  runningIncrementalSync: string;
  initialSyncDone: string;
  incrementalSyncDone: string;
  initialSyncFailed: string;
  incrementalSyncFailed: string;
  noSyncRuns: string;
  created: string;
  updated: string;
  failed: string;
  syncModes: { initial: string; incremental: string };
  syncStatuses: { idle: string; running: string; success: string; error: string };
}

export function ShopifyConnectionManager({
  initialConnection,
  initialSyncStatus,
  labels
}: {
  initialConnection: ShopifyConnectionSummary | null;
  initialSyncStatus: SyncStatusPayload;
  labels: ShopifyLabels;
}) {
  const [shopDomain, setShopDomain] = useState(initialConnection?.shopDomain ?? "");
  const [adminAccessToken, setAdminAccessToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState(initialSyncStatus);

  const storeId = syncStatus.connection?.storeId;

  async function refreshStatus() {
    const response = await fetch(`/api/shopify/sync/status${storeId ? `?storeId=${storeId}` : ""}`, {
      method: "GET"
    });
    const payload = await response.json();
    if (response.ok) {
      setSyncStatus({
        connection: payload.connection,
        recentRuns: payload.recentRuns ?? []
      });
    }
  }

  async function runAction<T>(action: string, handler: () => Promise<T>) {
    setLoadingAction(action);
    setError(null);
    setMessage(null);

    if ((action === "initial" || action === "incremental") && syncStatus.connection) {
      setSyncStatus((current) => ({
        ...current,
        connection: current.connection
          ? {
              ...current.connection,
              syncStatus: "running",
              lastSyncError: null
            }
          : current.connection
      }));
    }

    try {
      await handler();
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : labels.unexpectedError;
      setError(humanizeShopifyError(raw));
    } finally {
      await refreshStatus().catch(() => null);
      setLoadingAction(null);
    }
  }

  const connectionStateLabel = useMemo(() => {
    if (!syncStatus.connection) return labels.notConnected;
    if (syncStatus.connection.syncStatus === "running") return labels.syncRunning;
    if (syncStatus.connection.connected) return labels.connected;
    return labels.notConnected;
  }, [labels.connected, labels.notConnected, labels.syncRunning, syncStatus.connection]);

  // Surfaces the last persisted sync failure — this covers manual syncs AND
  // the hourly background cron (both write connection.syncStatus/lastSyncError).
  const syncError =
    syncStatus.connection?.syncStatus === "error"
      ? syncStatus.connection?.lastSyncError ?? null
      : null;
  // The credential/encryption-key failure is the one that needs a specific
  // remediation rather than just showing the raw GCM error string.
  const isCredentialError =
    !!syncError &&
    /unable to authenticate data|unsupported state|SHOPIFY_CREDENTIALS_ENCRYPTION_KEY|malformed Shopify credential|decrypt/i.test(
      syncError
    );

  useEffect(() => {
    if (syncStatus.connection?.syncStatus !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [syncStatus.connection?.storeId, syncStatus.connection?.syncStatus]);

  const syncControlsDisabled = !storeId || loadingAction !== null || syncStatus.connection?.syncStatus === "running";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OAuth section — the recommended path. Operators paste a shop
              domain and click Install; Shopify hands us a real token via
              callback. The paste-token form below stays available as a
              fallback (or for stores using a Custom App). */}
          <ShopifyOauthSection />

          <div className="rounded-md border border-border bg-slate-50/50 px-3 py-2 text-[11px] text-slate-700">
            <strong>OR</strong> paste a Custom App Admin API access token below (starts with{" "}
            <code className="rounded bg-slate-200 px-1 text-[10px]">shpat_</code>).
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{labels.shopDomain}</span>
              <input
                className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
                value={shopDomain}
                onChange={(event) => setShopDomain(event.target.value)}
                placeholder={labels.shopDomainPlaceholder}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{labels.token}</span>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
                value={adminAccessToken}
                onChange={(event) => setAdminAccessToken(event.target.value)}
                placeholder={labels.tokenPlaceholder}
              />
              {tokenFormatWarning(adminAccessToken) ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-5 text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                  <span>{tokenFormatWarning(adminAccessToken)}</span>
                </p>
              ) : null}
            </label>
          </div>

          {labels.tokenHelp ? <p className="text-sm text-muted-foreground">{labels.tokenHelp}</p> : null}

          <details className="rounded-xl border border-border bg-slate-50/50 px-4 py-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
              <HelpCircle className="h-4 w-4" aria-hidden />
              Where do I find the Admin API access token?
            </summary>
            <ol className="mt-3 list-decimal space-y-2 ps-5 text-xs leading-6 text-slate-700">
              <li>
                In Shopify Admin, go to <strong>Settings → Apps and sales channels → Develop apps</strong>.
              </li>
              <li>
                Click your existing custom app (or <strong>Create an app</strong> if you don&apos;t have one).
              </li>
              <li>
                Click <strong>Configure Admin API scopes</strong> and grant at minimum:
                <code className="ms-1 rounded bg-slate-200 px-1 text-[10px]">read_products</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]">read_orders</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]">read_customers</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]">read_inventory</code>{" "}
                (add <code className="rounded bg-slate-200 px-1 text-[10px]">write_discounts</code> for
                affiliate coupon creation).
              </li>
              <li>
                Click <strong>Install app</strong> at the top right — confirm.
              </li>
              <li>
                Go to the <strong>API credentials</strong> tab. Under <strong>Admin API access token</strong>, click{" "}
                <strong>Reveal token once</strong> and copy the value (starts with{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]">shpat_</code>).
              </li>
              <li>Paste it into the field above.</li>
            </ol>
            <a
              href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
            >
              Shopify&apos;s docs on custom apps <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </details>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={loadingAction !== null}
              onClick={() =>
                runAction("test", async () => {
                  const response = await fetch("/api/shopify/connection/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shopDomain, adminAccessToken })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.connectionFailed);
                  setMessage(`${labels.testSuccess} ${payload.storePreview.name}.`);
                })
              }
            >
              {loadingAction === "test" ? labels.testing : labels.testConnection}
            </Button>
            <Button
              disabled={loadingAction !== null}
              onClick={() =>
                runAction("save", async () => {
                  const response = await fetch("/api/shopify/connection/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shopDomain, adminAccessToken })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.saveFailed);
                  setMessage(labels.saveSuccess);
                  setAdminAccessToken("");
                })
              }
            >
              {loadingAction === "save" ? labels.saving : labels.saveCredentials}
            </Button>
          </div>

          {syncError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                </span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-rose-900">
                    {isCredentialError
                      ? "Shopify sync is blocked — credentials can’t be decrypted"
                      : "Last Shopify sync failed"}
                  </p>
                  {isCredentialError ? (
                    <p className="text-sm text-rose-800">
                      Your saved Shopify Admin API token can’t be decrypted, so every
                      sync (including the hourly background job) is failing. This
                      happens when <code className="font-mono text-xs">SHOPIFY_CREDENTIALS_ENCRYPTION_KEY</code>{" "}
                      changed since the token was saved. Fix it by either re-entering
                      and saving the access token above, or restoring the original
                      encryption key — then run a sync again.
                    </p>
                  ) : (
                    <p className="text-sm text-rose-800">
                      The most recent sync didn’t complete. The hourly background
                      sync will retry automatically.
                    </p>
                  )}
                  <p className="rounded-lg bg-rose-100/70 px-3 py-1.5 font-mono text-xs text-rose-900">
                    {syncError}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
            <p className="font-semibold">{labels.connectionState}: {connectionStateLabel}</p>
            {/* suppressHydrationWarning: toLocaleString() uses system locale on the server
                but the browser locale on the client — intentional timezone display difference. */}
            <p className="mt-2 text-muted-foreground" suppressHydrationWarning>
              {syncStatus.connection?.lastSyncAt
                ? `${labels.lastSync}: ${new Date(syncStatus.connection.lastSyncAt).toLocaleString()}`
                : labels.noSyncYet}
            </p>
          </div>

          {message ? <p className="text-sm text-success">{message}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.syncControlsTitle}</CardTitle>
          <CardDescription>{labels.syncControlsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={syncControlsDisabled}
              onClick={() =>
                runAction("initial", async () => {
                  const response = await fetch("/api/shopify/sync/initial", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.initialSyncFailed);
                  setMessage(labels.initialSyncDone);
                })
              }
            >
              {loadingAction === "initial" ? labels.runningInitialSync : labels.runInitialSync}
            </Button>
            <Button
              disabled={syncControlsDisabled}
              onClick={() =>
                runAction("incremental", async () => {
                  const response = await fetch("/api/shopify/sync/incremental", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId })
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error ?? labels.incrementalSyncFailed);
                  setMessage(labels.incrementalSyncDone);
                })
              }
            >
              {loadingAction === "incremental" ? labels.runningIncrementalSync : labels.runIncrementalSync}
            </Button>
          </div>

          <div className="space-y-3">
            {syncStatus.recentRuns.length ? (
              syncStatus.recentRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {labels.syncModes[run.mode]} · {labels.syncStatuses[run.status]}
                    </p>
                    {/* suppressHydrationWarning: toLocaleString() uses Node locale on server,
                        browser locale on client — intentional timezone display difference. */}
                    <p className="text-muted-foreground" suppressHydrationWarning>{new Date(run.startedAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {labels.created}: {run.recordsCreated} · {labels.updated}: {run.recordsUpdated} · {labels.failed}: {run.recordsFailed}
                  </p>
                  {run.errorMessage ? <p className="mt-2 text-danger">{run.errorMessage}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{labels.noSyncRuns}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
