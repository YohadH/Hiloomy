"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HelpCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShopifyConnectionSummary, SyncRunSummary } from "@/lib/domain/types";
import { ShopifyOauthSection } from "@/components/settings/shopify-oauth-section";

// Bilingual picker threaded in from the component (which owns `locale`).
type LangFn = (he: string, en: string) => string;

// Map raw Shopify / network errors into plain-language remediations. The
// raw 401 "Invalid API key or access token" is technically accurate but
// useless to a non-developer — they need to know WHAT to fix.
function humanizeShopifyError(raw: string, lang: LangFn): string {
  const r = raw.toLowerCase();

  if (r.includes("401") || r.includes("invalid api key") || r.includes("unrecognized login")) {
    return lang(
      "הטוקן שShopify קיבלה נדחה כלא תקין. ודאו שהדבקתם את טוקן הגישה של Admin API (מתחיל ב-shpat_), ולא את הAPI key או הAPI secret. בדקו את הטוקן שוב בממשק הניהול של Shopify ← Settings → Apps and sales channels → Develop apps ← האפליקציה שלכם ← API credentials.",
      "The token Shopify received was rejected as invalid. Make sure you pasted the Admin API access token (starts with shpat_), not the API key or secret. Re-check the token under Shopify Admin → Settings → Apps and sales channels → Develop apps → your app → API credentials."
    );
  }
  if (r.includes("403") || r.includes("forbidden") || r.includes("not authorized")) {
    return lang(
      "הטוקן תקין אבל חסרות לו ההרשאות הנדרשות. בממשק הניהול של Shopify ← האפליקציה הפרטית שלכם ← Configure Admin API scopes, העניקו: read_products, read_orders, read_customers, read_inventory (ובנוסף write_discounts אם אתם משתמשים ביצירת קופוני שותפים).",
      "The token is valid but doesn't have the required permissions. In Shopify Admin → your custom app → Configure Admin API scopes, grant: read_products, read_orders, read_customers, read_inventory (plus write_discounts if you use affiliate coupon creation)."
    );
  }
  if (r.includes("404") || r.includes("could not find shop")) {
    return lang(
      "דומיין החנות לא נמצא. השתמשו בדומיין המלא של myshopify (לדוגמה: yourstore.myshopify.com), ולא בכתובת חזית החנות.",
      "The shop domain wasn't found. Use the full myshopify domain (e.g. yourstore.myshopify.com), not your storefront URL."
    );
  }
  if (r.includes("getaddrinfo") || r.includes("enotfound") || r.includes("dns")) {
    return lang(
      "לא ניתן להגיע לחנות — הדומיין לא נפתר. בדקו שוב את האיות (אמור להיראות כמו yourstore.myshopify.com).",
      "Could not reach the shop — the domain isn't resolving. Double-check the spelling (should look like yourstore.myshopify.com)."
    );
  }
  if (r.includes("etimedout") || r.includes("timeout")) {
    return lang(
      "Shopify לקחה יותר מדי זמן להגיב. נסו שוב בעוד רגע.",
      "Shopify took too long to respond. Try again in a moment."
    );
  }
  return raw;
}

// Soft client-side check: warn if the pasted value clearly isn't a custom
// app access token. Doesn't block submission — just nudges. shpat_ is the
// 2023+ format; older tokens may have other prefixes which we don't fail.
function tokenFormatWarning(token: string, lang: LangFn): string | null {
  const t = token.trim();
  if (!t) return null;
  if (t.startsWith("shpat_")) return null;
  if (t.length < 20)
    return lang(
      "זה נראה קצר מדי — טוקני Admin של Shopify הם בדרך כלל באורך 40 תווים ומעלה.",
      "That looks too short — Shopify Admin tokens are usually 40+ characters."
    );
  if (/^[a-f0-9]{32}$/i.test(t)) {
    return lang(
      "נראה כמו API key ולא כמו טוקן הגישה. טוקן הגישה של Admin API מתחיל ב-shpat_ ומוצג ממש מתחת לAPI key בלוח הבקרה של האפליקציה בShopify.",
      "Looks like an API key, not the access token. The Admin API access token starts with shpat_ and is shown right below the API key in the Shopify app dashboard."
    );
  }
  return lang(
    "טוקני Admin API של אפליקציה פרטית מתחילים בדרך כלל ב-shpat_. אם שלכם לא, בדקו שוב שזה טוקן הגישה של Admin (לא API key ולא API secret).",
    "Custom-app Admin API tokens normally start with shpat_. If yours doesn't, double-check it's the Admin access token (not API key, not API secret)."
  );
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
  orLabel: string;
  orPasteToken: string;
  tokenGuide: {
    summary: string;
    step1: string;
    step2a: string;
    step2b: string;
    step3a: string;
    step3b: string;
    step3c: string;
    step3d: string;
    step4a: string;
    step4b: string;
    step5a: string;
    step5b: string;
    step5c: string;
    step5d: string;
    step6: string;
    docsLink: string;
  };
  syncBlockedTitle: string;
  syncFailedTitle: string;
  syncBlockedBodyA: string;
  syncBlockedBodyB: string;
  syncFailedBody: string;
}

export function ShopifyConnectionManager({
  initialConnection,
  initialSyncStatus,
  labels,
  locale = "he"
}: {
  initialConnection: ShopifyConnectionSummary | null;
  initialSyncStatus: SyncStatusPayload;
  labels: ShopifyLabels;
  locale?: "he" | "en";
}) {
  const lang: LangFn = (he, en) => (locale === "he" ? he : en);
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
      setError(humanizeShopifyError(raw, lang));
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
          <ShopifyOauthSection locale={locale} />

          <div className="rounded-md border border-border bg-slate-50/50 px-3 py-2 text-[11px] text-slate-700">
            <strong>{labels.orLabel}</strong> {labels.orPasteToken}{" "}
            <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">shpat_</code>).
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
              {tokenFormatWarning(adminAccessToken, lang) ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-5 text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                  <span>{tokenFormatWarning(adminAccessToken, lang)}</span>
                </p>
              ) : null}
            </label>
          </div>

          {labels.tokenHelp ? <p className="text-sm text-muted-foreground">{labels.tokenHelp}</p> : null}

          <details className="rounded-xl border border-border bg-slate-50/50 px-4 py-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
              <HelpCircle className="h-4 w-4" aria-hidden />
              {labels.tokenGuide.summary}
            </summary>
            <ol className="mt-3 list-decimal space-y-2 ps-5 text-xs leading-6 text-slate-700">
              <li>
                {labels.tokenGuide.step1}{" "}
                <strong dir="ltr">Settings → Apps and sales channels → Develop apps</strong>.
              </li>
              <li>
                {labels.tokenGuide.step2a} <strong dir="ltr">Create an app</strong> {labels.tokenGuide.step2b}
              </li>
              <li>
                {labels.tokenGuide.step3a} <strong dir="ltr">Configure Admin API scopes</strong>{" "}
                {labels.tokenGuide.step3b}
                <code className="ms-1 rounded bg-slate-200 px-1 text-[10px]" dir="ltr">read_products</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">read_orders</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">read_customers</code>,{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">read_inventory</code>{" "}
                {labels.tokenGuide.step3c}{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">write_discounts</code>{" "}
                {labels.tokenGuide.step3d}
              </li>
              <li>
                {labels.tokenGuide.step4a} <strong dir="ltr">Install app</strong> {labels.tokenGuide.step4b}
              </li>
              <li>
                {labels.tokenGuide.step5a} <strong dir="ltr">API credentials</strong>
                {labels.tokenGuide.step5b} <strong dir="ltr">Admin API access token</strong>,{" "}
                {labels.tokenGuide.step5c} <strong dir="ltr">Reveal token once</strong>{" "}
                {labels.tokenGuide.step5d}{" "}
                <code className="rounded bg-slate-200 px-1 text-[10px]" dir="ltr">shpat_</code>).
              </li>
              <li>{labels.tokenGuide.step6}</li>
            </ol>
            <a
              href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
            >
              {labels.tokenGuide.docsLink} <ExternalLink className="h-3 w-3" aria-hidden />
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
                    {isCredentialError ? labels.syncBlockedTitle : labels.syncFailedTitle}
                  </p>
                  {isCredentialError ? (
                    <p className="text-sm text-rose-800">
                      {labels.syncBlockedBodyA}{" "}
                      <code className="font-mono text-xs" dir="ltr">SHOPIFY_CREDENTIALS_ENCRYPTION_KEY</code>{" "}
                      {labels.syncBlockedBodyB}
                    </p>
                  ) : (
                    <p className="text-sm text-rose-800">{labels.syncFailedBody}</p>
                  )}
                  <p className="rounded-lg bg-rose-100/70 px-3 py-1.5 font-mono text-xs text-rose-900" dir="ltr">
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
