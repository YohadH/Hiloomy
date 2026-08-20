"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

export interface MetaOauthResult {
  connected?: boolean;
  account?: string | null;
  multi?: boolean;
  error?: string | null;
}

// NOTE: callers that render this value directly in JSX must add
// suppressHydrationWarning on the containing element — toLocaleString()
// uses Node.js locale on the server and the browser locale on the client,
// which produces different strings and triggers React hydration error #418.
function formatDateTime(value: string | null | undefined, never: string, unknown: string) {
  if (!value) return never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknown;
  return date.toLocaleString();
}

// "Unsupported state or unable to authenticate data" is Node's AES-GCM
// decryption failure — the stored token was encrypted with a different
// SHOPIFY_CREDENTIALS_ENCRYPTION_KEY than the server currently has.
const DECRYPT_ERROR_RE = /unable to authenticate data|unsupported state|decrypt/i;

const STRINGS = {
  he: {
    oneClickTitle: "חיבור בלחיצה אחת",
    oneClickBody: "מתחברים עם חשבון הפייסבוק שמנהל את המודעות — אנחנו כבר נמשוך את חשבון המודעות והטוקן לבד.",
    oneClickCta: "התחברות עם פייסבוק",
    oauthOkPrefix: "מחובר! חשבון המודעות שנבחר:",
    oauthMulti: "נמצאו כמה חשבונות מודעות — בחרנו את הפעיל הראשון. אפשר להחליף בבחירת החשבון למטה.",
    pickerToggle: "החלפת חשבון מודעות",
    pickerLoading: "טוען חשבונות…",
    pickerLabel: "בחרו את חשבון המודעות הנכון (מוצג לפי עסק):",
    pickerApply: "החלפה לחשבון הזה",
    pickerApplying: "מחליף…",
    pickerSwitched: (name: string) => `חשבון המודעות הוחלף ל־${name}. מומלץ להריץ סנכרון עכשיו.`,
    pickerInactive: "לא פעיל",
    pickerNoBusiness: "ללא עסק",
    manualToggle: "חיבור ידני (מתקדם)",
    description:
      "שומרים טוקן גישה של Meta וחשבון מודעות בצד השרת, כדי לסנכרן מדי יום ביצועי קמפיינים, קריאייטיבים, רכישות, ROAS ועוד.",
    tokenLabel: "טוקן גישה של Meta",
    tokenSavedPlaceholder: (last4: string) => `נשמר טוקן שמסתיים ב־${last4}`,
    tokenHelp: "הדביקו טוקן קצר מGraph Explorer להמרה, או טוקן System User אם מכבים את ההמרה למטה.",
    adAccountLabel: "מזהה חשבון מודעות",
    appIdLabel: "Meta App ID",
    appSecretLabel: "Meta App Secret",
    appSecretSaved: "סוד האפליקציה שמור",
    permissionsNote: "הרשאות נדרשות: ads_read וbusiness_management. הטוקן והסוד מוצפנים בצד השרת ולא מוצגים שוב אחרי שמירה.",
    exchangeTitle: "המרה לטוקן משתמש ארוך־טווח",
    exchangeBody: "השאירו דלוק לטוקנים מGraph Explorer. כבו רק אם הדבקתם טוקן System User מBusiness Manager.",
    save: "שמירת טוקן Meta",
    saving: "שומר…",
    regenerate: "חידוש טוקן ארוך־טווח",
    regenerating: "מחדש…",
    sync: "סנכרון קמפיינים וקריאייטיבים",
    syncing: "מסנכרן…",
    presets: { last_7d: "7 ימים אחרונים", last_14d: "14 ימים אחרונים", last_30d: "30 ימים אחרונים", this_month: "החודש", last_month: "חודש שעבר" },
    notConnected: "Meta Ads לא מחובר",
    notConnectedHint: "הדרך המהירה: כפתור ההתחברות עם פייסבוק למעלה. אפשר גם ידנית עם טוקן וחשבון מודעות.",
    accountFallback: "חשבון Meta",
    currencyTz: "מטבע/אזור זמן",
    appLine: "אפליקציה",
    secretSaved: "סוד שמור",
    secretMissing: "סוד חסר",
    tokenLine: "טוקן",
    tokenEnding: (last4: string) => `מסתיים ב־${last4}`,
    tokenSaved: "שמור",
    tokenHealthLine: "תוקף הטוקן",
    tokenHealthUnknown: "תוקף לא ידוע",
    scopesLine: "הרשאות",
    lastSync: "סנכרון אחרון",
    latestRun: (status: string, created: number, updated: number) => `ריצה אחרונה: ${status}, נוצרו ${created}, עודכנו ${updated}`,
    never: "אף פעם",
    unknown: "לא ידוע",
    decryptHint:
      "השגיאה הזו אומרת שהטוקן השמור הוצפן עם מפתח הצפנה אחר (המפתח בשרת התחלף). הפתרון: להתחבר מחדש עם פייסבוק למעלה, או להדביק טוקן וסוד מחדש ולשמור.",
    requestFailed: "הבקשה לMeta נכשלה.",
    saveFailed: "שמירת חיבור Meta נכשלה.",
    savedAs: (name: string) => `Meta Ads חובר אל ${name}.`,
    regenerated: "הטוקן חודש.",
    synced: (c: number, a: number, created: number, updated: number) =>
      `סונכרנו ${c} שורות קמפיין יומיות ו־${a} שורות קריאייטיב: ${created} חדשות, ${updated} עודכנו.`
  },
  en: {
    oneClickTitle: "One-click connect",
    oneClickBody: "Sign in with the Facebook account that manages the ads — we'll pull the ad account and token automatically.",
    oneClickCta: "Continue with Facebook",
    oauthOkPrefix: "Connected! Selected ad account:",
    oauthMulti: "Several ad accounts were found — we picked the first active one. You can switch it in the account picker below.",
    pickerToggle: "Switch ad account",
    pickerLoading: "Loading accounts…",
    pickerLabel: "Pick the correct ad account (shown with its business):",
    pickerApply: "Switch to this account",
    pickerApplying: "Switching…",
    pickerSwitched: (name: string) => `Ad account switched to ${name}. Run a sync now.`,
    pickerInactive: "inactive",
    pickerNoBusiness: "no business",
    manualToggle: "Manual connection (advanced)",
    description:
      "Save a server-side Meta access token and ad account so the planner can sync daily campaign performance, creatives, purchases, ROAS and more.",
    tokenLabel: "Meta access token",
    tokenSavedPlaceholder: (last4: string) => `Saved token ending ${last4}`,
    tokenHelp: "Paste a short-lived Graph Explorer token to exchange, or a System User token if you turn off exchange below.",
    adAccountLabel: "Ad account ID",
    appIdLabel: "Meta App ID",
    appSecretLabel: "Meta App Secret",
    appSecretSaved: "Saved app secret",
    permissionsNote: "Required permissions: ads_read and business_management. The token and app secret are encrypted server-side and never shown again after save.",
    exchangeTitle: "Exchange token into a long-lived user token",
    exchangeBody: "Keep this on for Graph API Explorer/user tokens. Turn it off only if you paste a Business Manager System User token.",
    save: "Save Meta Ads token",
    saving: "Saving…",
    regenerate: "Regenerate long-lived token",
    regenerating: "Regenerating…",
    sync: "Sync campaigns + creatives",
    syncing: "Syncing…",
    presets: { last_7d: "Last 7 days", last_14d: "Last 14 days", last_30d: "Last 30 days", this_month: "This month", last_month: "Last month" },
    notConnected: "Meta Ads not connected",
    notConnectedHint: "Fastest path: the Facebook button above. Manual token + ad account works too.",
    accountFallback: "Meta account",
    currencyTz: "Currency/timezone",
    appLine: "App",
    secretSaved: "secret saved",
    secretMissing: "secret missing",
    tokenLine: "Token",
    tokenEnding: (last4: string) => `ending ${last4}`,
    tokenSaved: "saved",
    tokenHealthLine: "Token health",
    tokenHealthUnknown: "Expiry unknown",
    scopesLine: "Scopes",
    lastSync: "Last sync",
    latestRun: (status: string, created: number, updated: number) => `Latest run: ${status}, created ${created}, updated ${updated}`,
    never: "Never",
    unknown: "Unknown",
    decryptHint:
      "This error means the saved token was encrypted with a different encryption key (the server key changed). Fix: reconnect with Facebook above, or paste the token + secret again and save.",
    requestFailed: "Meta Ads request failed.",
    saveFailed: "Could not save the Meta Ads connection.",
    savedAs: (name: string) => `Meta Ads connected to ${name}.`,
    regenerated: "Token regenerated.",
    synced: (c: number, a: number, created: number, updated: number) =>
      `Synced ${c} daily campaign row(s) and ${a} creative row(s): ${created} new, ${updated} updated.`
  }
};

export function MetaAdsConnectionManager({
  storeId,
  initialConnection,
  isHe = false,
  oauthResult
}: {
  storeId: string;
  initialConnection: MetaAdsConnectionSummary | null;
  isHe?: boolean;
  oauthResult?: MetaOauthResult | null;
}) {
  const t = STRINGS[isHe ? "he" : "en"];
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState(initialConnection?.adAccountId ?? "");
  const [appId, setAppId] = useState(initialConnection?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [exchangeToken, setExchangeToken] = useState(true);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [connection, setConnection] = useState(initialConnection);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(!initialConnection && !oauthResult?.connected);
  // Ad-account picker — lists every account the saved token can see.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAccounts, setPickerAccounts] = useState<
    Array<{ id: string; name: string; businessName: string | null; active: boolean; currency: string | null }> | null
  >(null);
  const [pickerSelection, setPickerSelection] = useState("");

  async function openPicker() {
    setPickerOpen((v) => !v);
    if (pickerAccounts !== null) return;
    setLoading("picker-load");
    setError(null);
    try {
      const response = await fetch(`/api/meta-ads/accounts?storeId=${encodeURIComponent(storeId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
      setPickerAccounts(payload.accounts ?? []);
      setPickerSelection(payload.selectedAdAccountId ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.requestFailed);
      setPickerOpen(false);
    } finally {
      setLoading(null);
    }
  }

  async function refreshStatus() {
    const response = await fetch(`/api/meta-ads/connection/status?storeId=${encodeURIComponent(storeId)}`);
    const payload = await response.json();
    if (response.ok && payload.ok) {
      setConnection(payload.connection ?? null);
      if (payload.connection?.adAccountId) setAdAccountId(payload.connection.adAccountId);
      if (payload.connection?.appId) setAppId(payload.connection.appId);
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
      setError(caught instanceof Error ? caught.message : t.requestFailed);
    } finally {
      setLoading(null);
    }
  }

  const inputCls = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-0";
  const isDecryptError = !!connection?.lastSyncError && DECRYPT_ERROR_RE.test(connection.lastSyncError);

  return (
    <div className="space-y-4">
      {/* One-click OAuth — the headline path. */}
      <div className="rounded-2xl border border-green-200 bg-green-50/60 p-5">
        <p className="text-sm font-bold">{t.oneClickTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.oneClickBody}</p>
        <a
          href={`/api/meta-ads/oauth/start?storeId=${encodeURIComponent(storeId)}`}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.92 3.78-3.92 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.25 0-1.64.78-1.64 1.57v1.9h2.78l-.44 2.9h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
          </svg>
          {t.oneClickCta}
        </a>
        {oauthResult?.connected ? (
          <p className="mt-3 text-sm font-semibold text-green-700">
            {t.oauthOkPrefix} {oauthResult.account}
            {oauthResult.multi ? <span className="mt-1 block font-normal text-muted-foreground">{t.oauthMulti}</span> : null}
          </p>
        ) : null}
        {oauthResult?.error ? <p className="mt-3 text-sm text-danger">{oauthResult.error}</p> : null}
      </div>

      {/* Connection status */}
      <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold" dir="ltr">
            {connection ? `${connection.adAccountName ?? t.accountFallback} (${connection.adAccountId})` : t.notConnected}
          </p>
          <p className="text-muted-foreground">{connection?.syncStatus ?? ""}</p>
        </div>
        {connection ? (
          <div className="mt-3 space-y-1 text-muted-foreground">
            <p>
              {t.currencyTz}: <span dir="ltr">{connection.currency ?? "-"} / {connection.timezoneName ?? "-"}</span>
            </p>
            <p>
              {t.appLine}: <span dir="ltr">{(connection.appId ?? appId) || "-"}</span> · {connection.hasAppSecret ? t.secretSaved : t.secretMissing}
            </p>
            <p>
              {t.tokenLine}: {connection.tokenLastFour ? t.tokenEnding(connection.tokenLastFour) : t.tokenSaved}
              {connection.tokenType ? ` · ${connection.tokenType}` : ""}
            </p>
            {/* suppressHydrationWarning: toLocaleString() differs between server and browser locales. */}
            <p suppressHydrationWarning>
              {t.tokenHealthLine}: {connection.tokenHealth?.label ?? t.tokenHealthUnknown}
              {connection.tokenExpiresAt ? ` (${formatDateTime(connection.tokenExpiresAt, t.never, t.unknown)})` : ""}
            </p>
            {connection.tokenScopes?.length ? (
              <p dir="ltr">{t.scopesLine}: {connection.tokenScopes.slice(0, 8).join(", ")}{connection.tokenScopes.length > 8 ? "…" : ""}</p>
            ) : null}
            <p suppressHydrationWarning>
              {t.lastSync}: {formatDateTime(connection.lastSyncAt, t.never, t.unknown)}
            </p>
            {connection.latestRun ? (
              <p>{t.latestRun(connection.latestRun.status, connection.latestRun.recordsCreated, connection.latestRun.recordsUpdated)}</p>
            ) : null}
            {connection.lastSyncError ? <p className="text-danger">{connection.lastSyncError}</p> : null}
            {isDecryptError ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{t.decryptHint}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">{t.notConnectedHint}</p>
        )}
      </div>

      {/* Ad-account picker — the sanctioned way to change the selected
          account after OAuth (the token stays; only the selection moves). */}
      {connection ? (
        <div className="rounded-2xl border border-border/70">
          <button
            type="button"
            onClick={() => void openPicker()}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          >
            {t.pickerToggle}
            <span aria-hidden>{pickerOpen ? "−" : "+"}</span>
          </button>
          {pickerOpen ? (
            <div className="space-y-3 border-t border-border/70 p-4">
              {loading === "picker-load" || pickerAccounts === null ? (
                <p className="text-sm text-muted-foreground">{t.pickerLoading}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t.pickerLabel}</p>
                  <select
                    value={pickerSelection}
                    onChange={(event) => setPickerSelection(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    dir="ltr"
                  >
                    {pickerAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.businessName ?? t.pickerNoBusiness} — {account.name} ({account.id})
                        {account.active ? "" : ` · ${t.pickerInactive}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={loading !== null || !pickerSelection || pickerSelection === connection.adAccountId}
                    onClick={() =>
                      runAction("picker-apply", async () => {
                        const response = await fetch("/api/meta-ads/accounts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ storeId, adAccountId: pickerSelection })
                        });
                        const payload = await response.json();
                        if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
                        return t.pickerSwitched(payload.adAccountName ?? payload.adAccountId);
                      })
                    }
                  >
                    {loading === "picker-apply" ? t.pickerApplying : t.pickerApply}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Sync controls */}
      {connection ? (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value)}
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
          >
            {Object.entries(t.presets).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={loading !== null}
            onClick={() =>
              runAction("sync", async () => {
                const response = await fetch("/api/meta-ads/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storeId, datePreset })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
                return t.synced(payload.campaignsFetched, payload.adsFetched ?? 0, payload.recordsCreated, payload.recordsUpdated);
              })
            }
          >
            {loading === "sync" ? t.syncing : t.sync}
          </Button>
          <Button
            variant="secondary"
            disabled={loading !== null}
            onClick={() =>
              runAction("refresh", async () => {
                const response = await fetch("/api/meta-ads/connection/refresh", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ storeId, accessToken, appId, appSecret })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
                return `${t.regenerated} ${payload.connection.tokenHealth?.label ?? ""}`;
              })
            }
          >
            {loading === "refresh" ? t.regenerating : t.regenerate}
          </Button>
        </div>
      ) : null}

      {/* Manual path — collapsed unless there's no connection at all. */}
      <div className="rounded-2xl border border-border/70">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          {t.manualToggle}
          <span aria-hidden>{manualOpen ? "−" : "+"}</span>
        </button>
        {manualOpen ? (
          <div className="space-y-4 border-t border-border/70 p-4">
            <p className="text-sm leading-6 text-muted-foreground">{t.description}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t.tokenLabel}</span>
                <input
                  type="password"
                  className={inputCls}
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder={connection?.tokenLastFour ? t.tokenSavedPlaceholder(connection.tokenLastFour) : "EAAM..."}
                />
                <span className="block text-xs leading-5 text-muted-foreground">{t.tokenHelp}</span>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t.adAccountLabel}</span>
                <input
                  className={inputCls}
                  dir="ltr"
                  value={adAccountId}
                  onChange={(event) => setAdAccountId(event.target.value)}
                  placeholder="act_123456789"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t.appIdLabel}</span>
                <input
                  className={inputCls}
                  dir="ltr"
                  value={appId}
                  onChange={(event) => setAppId(event.target.value)}
                  placeholder="1205682261514110"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t.appSecretLabel}</span>
                <input
                  type="password"
                  className={inputCls}
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  placeholder={connection?.hasAppSecret ? t.appSecretSaved : "App secret"}
                />
              </label>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{t.permissionsNote}</p>
            <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={exchangeToken}
                onChange={(event) => setExchangeToken(event.target.checked)}
              />
              <span>
                <span className="block font-medium">{t.exchangeTitle}</span>
                <span className="mt-1 block text-muted-foreground">{t.exchangeBody}</span>
              </span>
            </label>
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
                  if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.saveFailed);
                  setAccessToken("");
                  setAppSecret("");
                  return t.savedAs(payload.connection.adAccountName ?? payload.connection.adAccountId);
                })
              }
            >
              {loading === "save" ? t.saving : t.save}
            </Button>
          </div>
        ) : null}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
