"use client";

import { useEffect, useState } from "react";
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
  // Re-connect kept the store's locked account instead of asking again.
  kept?: boolean;
  // The Facebook login is parked; the owner must pick the ad account now.
  pick?: boolean;
  error?: string | null;
}

// One ad account as the picker API returns it (lib/services/meta-ads-accounts.ts).
type AccountOption = {
  id: string;
  name: string;
  businessId: string | null;
  businessName: string | null;
  active: boolean;
  currency: string | null;
};

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
    oneClickBody: "מתחברים עם חשבון הפייסבוק שמנהל את המודעות, ואז בוחרים במפורש את העסק וחשבון המודעות של החנות. שום חשבון לא נבחר אוטומטית.",
    oneClickCta: "התחברות עם פייסבוק",
    oauthOkPrefix: "מחובר! חשבון המודעות:",
    oauthKept: "החיבור חודש ונשאר על חשבון המודעות הנעול של החנות.",
    oauthPick: "ההתחברות לפייסבוק הצליחה. עכשיו בוחרים את חשבון המודעות למטה — עד אז לא נמשכים נתונים.",
    pickTitle: "בחירת חשבון המודעות",
    pickBody: (store: string) =>
      `בחרו את העסק וחשבון המודעות ששייכים ל־${store}. הבחירה נועלת את החנות לחשבון הזה, ורק אז מתחילים למשוך נתונים.`,
    pickStore: (store: string) => `מחברים את החנות: ${store}`,
    pickChoose: "בחרו חשבון מודעות…",
    pickConfirm: "חיבור ונעילה לחשבון הזה",
    pickConfirming: "מחבר ונועל…",
    pickDone: (store: string, name: string) => `${store} חוברה ל־${name} וננעלה. אפשר להריץ סנכרון.`,
    pickNone: "ההתחברות הזו לא רואה אף חשבון מודעות. בקשו גישה לחשבון בבזנס מנג'ר והתחברו שוב.",
    pickExpired: "ההתחברות לפייסבוק פגה לפני שנבחר חשבון. התחברו שוב עם הכפתור למעלה.",
    pendingStatus: "מחובר לפייסבוק · טרם נבחר חשבון מודעות",
    pinTitle: "נעילת חשבון המודעות",
    pinLockedLine: (id: string) => `נעול ל־${id}. חיבור מחדש, חידוש טוקן ובחירת חשבון לא ישנו אותו עד שתבטלו את הנעילה.`,
    pinUnlockedLine: "לא נעול — הסנכרון מושהה עד לנעילה. נעלו לחשבון הזה כדי להתחיל למשוך נתונים, או החליפו חשבון בבורר למטה (ההחלפה נועלת).",
    pinLock: "נעילה לחשבון הזה",
    pinUnlock: "ביטול נעילה",
    pinWorking: "מעדכן…",
    pinLocked: (id: string) => `חשבון המודעות נעול ל־${id}.`,
    pinReleased: "הנעילה בוטלה והסנכרון מושהה. הבחירה הבאה בבורר תנעל את החנות מחדש.",
    pickerLockedHint: "החשבון נעול — בטלו את הנעילה למעלה כדי להחליף.",
    pickerToggle: "החלפת חשבון מודעות",
    pickerLoading: "טוען חשבונות…",
    pickerLabel: "בחרו את חשבון המודעות הנכון (מקובץ לפי עסק):",
    pickerApply: "החלפה ונעילה לחשבון הזה",
    pickerApplying: "מחליף…",
    pickerSwitched: (name: string) => `חשבון המודעות הוחלף ל־${name} וננעל. מומלץ להריץ סנכרון עכשיו.`,
    pickerInactive: "לא פעיל",
    pickerNoBusiness: "ללא עסק (חשבון אישי)",
    syncLockedHint: "הסנכרון זמין רק אחרי נעילת חשבון המודעות.",
    manualToggle: "חיבור ידני (מתקדם)",
    description:
      "שומרים טוקן גישה של Meta וחשבון מודעות בצד השרת, כדי לסנכרן מדי יום ביצועי קמפיינים, קריאייטיבים, רכישות, ROAS ועוד. השמירה נועלת את החנות לחשבון שהזנתם.",
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
    savedAs: (name: string) => `Meta Ads חובר אל ${name} וננעל.`,
    regenerated: "הטוקן חודש.",
    synced: (c: number, a: number, created: number, updated: number) =>
      `סונכרנו ${c} שורות קמפיין יומיות ו־${a} שורות קריאייטיב: ${created} חדשות, ${updated} עודכנו.`
  },
  en: {
    oneClickTitle: "One-click connect",
    oneClickBody: "Sign in with the Facebook account that manages the ads, then explicitly pick the store's business and ad account. Nothing is chosen automatically.",
    oneClickCta: "Continue with Facebook",
    oauthOkPrefix: "Connected! Ad account:",
    oauthKept: "Reconnected and kept the store's locked ad account.",
    oauthPick: "Facebook login succeeded. Now pick the ad account below — no data is pulled until you do.",
    pickTitle: "Choose the ad account",
    pickBody: (store: string) =>
      `Pick the business and ad account that belong to ${store}. The choice locks the store to that account; only then does data start flowing.`,
    pickStore: (store: string) => `Connecting store: ${store}`,
    pickChoose: "Choose an ad account…",
    pickConfirm: "Connect and lock to this account",
    pickConfirming: "Connecting and locking…",
    pickDone: (store: string, name: string) => `${store} is connected to ${name} and locked. You can run a sync.`,
    pickNone: "This login sees no ad accounts. Ask for access in Business Manager and sign in again.",
    pickExpired: "The Facebook login expired before an account was chosen. Sign in again with the button above.",
    pendingStatus: "Signed in to Facebook · ad account not chosen yet",
    pinTitle: "Ad account lock",
    pinLockedLine: (id: string) => `Locked to ${id}. Reconnecting, token renewal and the account picker will not change it until you unlock.`,
    pinUnlockedLine: "Not locked — syncing is paused until you lock. Lock to this account to start pulling data, or switch accounts in the picker below (switching locks).",
    pinLock: "Lock to this account",
    pinUnlock: "Unlock",
    pinWorking: "Updating…",
    pinLocked: (id: string) => `Ad account locked to ${id}.`,
    pinReleased: "Unlocked and syncing paused. The next choice in the picker locks the store again.",
    pickerLockedHint: "The account is locked — unlock it above to switch.",
    pickerToggle: "Switch ad account",
    pickerLoading: "Loading accounts…",
    pickerLabel: "Pick the correct ad account (grouped by business):",
    pickerApply: "Switch and lock to this account",
    pickerApplying: "Switching…",
    pickerSwitched: (name: string) => `Ad account switched to ${name} and locked. Run a sync now.`,
    pickerInactive: "inactive",
    pickerNoBusiness: "No business (personal account)",
    syncLockedHint: "Syncing is available only after the ad account is locked.",
    manualToggle: "Manual connection (advanced)",
    description:
      "Save a server-side Meta access token and ad account so the planner can sync daily campaign performance, creatives, purchases, ROAS and more. Saving locks the store to the account you enter.",
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
    savedAs: (name: string) => `Meta Ads connected to ${name} and locked.`,
    regenerated: "Token regenerated.",
    synced: (c: number, a: number, created: number, updated: number) =>
      `Synced ${c} daily campaign row(s) and ${a} creative row(s): ${created} new, ${updated} updated.`
  }
};

// Option groups for the account <select>: one per business portfolio,
// accounts without a business last.
function groupAccounts(accounts: AccountOption[], noBusinessLabel: string) {
  const groups = new Map<string, { key: string; label: string; items: AccountOption[] }>();
  for (const account of accounts) {
    const key = account.businessId ?? "__none";
    const group = groups.get(key) ?? { key, label: account.businessName ?? noBusinessLabel, items: [] };
    group.items.push(account);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function MetaAdsConnectionManager({
  storeId,
  initialConnection,
  isHe = false,
  oauthResult,
  pinnedAdAccountId = null,
  pendingLogin = false,
  storeName = null
}: {
  storeId: string;
  initialConnection: MetaAdsConnectionSummary | null;
  isHe?: boolean;
  oauthResult?: MetaOauthResult | null;
  // Ad account the store is locked to (lib/services/meta-ads-account-pin.ts).
  pinnedAdAccountId?: string | null;
  // A Facebook login is parked and no ad account has been chosen yet.
  pendingLogin?: boolean;
  storeName?: string | null;
}) {
  const t = STRINGS[isHe ? "he" : "en"];
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState(initialConnection?.adAccountId ?? "");
  const [appId, setAppId] = useState(initialConnection?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [exchangeToken, setExchangeToken] = useState(true);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [connection, setConnection] = useState(initialConnection);
  const [pinned, setPinned] = useState<string | null>(pinnedAdAccountId);
  const [pending, setPending] = useState<boolean>(pendingLogin || Boolean(oauthResult?.pick));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(!initialConnection && !pendingLogin && !oauthResult?.connected && !oauthResult?.pick);
  // Account list — from the parked login while pending, else from the saved
  // token. Shared by the "choose" panel and the "switch" picker.
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountsStore, setAccountsStore] = useState<string | null>(storeName);
  const [selection, setSelection] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  async function loadAccounts() {
    setLoading("accounts");
    setError(null);
    try {
      const response = await fetch(`/api/meta-ads/accounts?storeId=${encodeURIComponent(storeId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
      const list: AccountOption[] = payload.accounts ?? [];
      setAccounts(list);
      if (payload.storeName) setAccountsStore(payload.storeName);
      // Never preselect for a parked login — the whole point is an explicit
      // choice. For a switch, start from the current account.
      setSelection(payload.mode === "pending" ? "" : payload.selectedAdAccountId ?? "");
      if (payload.mode !== "pending" && pending) setPending(false);
      return list;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.requestFailed);
      return null;
    } finally {
      setLoading(null);
    }
  }

  // Pending login → load the accounts right away so the choice is one step.
  useEffect(() => {
    if (pending && accounts === null) void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function refreshStatus() {
    const response = await fetch(`/api/meta-ads/connection/status?storeId=${encodeURIComponent(storeId)}`);
    const payload = await response.json();
    if (response.ok && payload.ok) {
      setConnection(payload.connection ?? null);
      if (payload.connection?.adAccountId) setAdAccountId(payload.connection.adAccountId);
      if (payload.connection?.appId) setAppId(payload.connection.appId);
      if ("pinned" in payload) setPinned(payload.pinned ?? null);
      if ("pending" in payload) setPending(Boolean(payload.pending));
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

  // Attach the selected account: creates + locks for a parked login, or
  // switches + locks an unlocked connection. Same endpoint either way.
  async function chooseAccount(successText: (name: string) => string) {
    const response = await fetch("/api/meta-ads/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, adAccountId: selection })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
    setPinned(payload.adAccountId ?? selection);
    setPending(false);
    setPickerOpen(false);
    setAccounts(null);
    return successText(payload.adAccountName ?? payload.adAccountId);
  }

  const inputCls = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-0";
  const isDecryptError = !!connection?.lastSyncError && DECRYPT_ERROR_RE.test(connection.lastSyncError);
  const groups = accounts ? groupAccounts(accounts, t.pickerNoBusiness) : [];
  const selected = accounts?.find((a) => a.id === selection) ?? null;
  const storeLabel = accountsStore ?? storeName ?? "";

  const accountSelect = (placeholder: string | null) => (
    <select
      value={selection}
      onChange={(event) => setSelection(event.target.value)}
      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
      dir="ltr"
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {groups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.items.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.id}){account.active ? "" : ` · ${t.pickerInactive}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

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
            {oauthResult.kept ? <span className="mt-1 block font-normal text-muted-foreground">{t.oauthKept}</span> : null}
          </p>
        ) : null}
        {oauthResult?.pick && pending ? <p className="mt-3 text-sm font-semibold text-green-700">{t.oauthPick}</p> : null}
        {oauthResult?.error ? <p className="mt-3 text-sm text-danger">{oauthResult.error}</p> : null}
      </div>

      {/* Parked login → the explicit choice. This is the only way a store
          gets an ad account after "Continue with Facebook". */}
      {pending ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 text-sm dark:border-amber-500/40 dark:bg-amber-500/5">
          <p className="font-bold">{t.pickTitle}</p>
          {storeLabel ? <p className="mt-1 font-semibold">{t.pickStore(storeLabel)}</p> : null}
          <p className="mt-1 text-muted-foreground">{t.pickBody(storeLabel || "—")}</p>
          <div className="mt-4 space-y-3">
            {loading === "accounts" || accounts === null ? (
              <p className="text-muted-foreground">{t.pickerLoading}</p>
            ) : accounts.length === 0 ? (
              <p className="text-danger">{t.pickNone}</p>
            ) : (
              <>
                {accountSelect(t.pickChoose)}
                {selected ? (
                  <p className="text-muted-foreground" dir="ltr">
                    {selected.businessName ?? t.pickerNoBusiness} · {selected.name} · {selected.id}
                    {selected.currency ? ` · ${selected.currency}` : ""}
                  </p>
                ) : null}
                <Button
                  disabled={loading !== null || !selection}
                  onClick={() =>
                    runAction("pick-apply", () => chooseAccount((name) => t.pickDone(storeLabel || "—", name)))
                  }
                >
                  {loading === "pick-apply" ? t.pickConfirming : t.pickConfirm}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Connection status */}
      <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold" dir={connection ? "ltr" : undefined}>
            {connection
              ? `${connection.adAccountName ?? t.accountFallback} (${connection.adAccountId})`
              : pending
                ? t.pendingStatus
                : t.notConnected}
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
        ) : pending ? null : (
          <p className="mt-2 text-muted-foreground">{t.notConnectedHint}</p>
        )}
      </div>

      {/* Ad-account lock — a pinned store refuses every write that would
          move it to another account, and only a pinned store syncs. */}
      {connection ? (
        <div className={`rounded-2xl border p-4 text-sm ${pinned ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{t.pinTitle}</p>
              <p className="mt-1 text-muted-foreground">{pinned ? t.pinLockedLine(pinned) : t.pinUnlockedLine}</p>
            </div>
            <Button
              variant={pinned ? "secondary" : "default"}
              size="sm"
              disabled={loading !== null}
              onClick={() =>
                runAction("pin", async () => {
                  const response = await fetch("/api/meta-ads/connection/pin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeId, pinned: !pinned })
                  });
                  const payload = await response.json();
                  if (!response.ok || !payload.ok) throw new Error(payload.error ?? t.requestFailed);
                  setPinned(payload.pinned ?? null);
                  return payload.pinned ? t.pinLocked(payload.pinned) : t.pinReleased;
                })
              }
            >
              {loading === "pin" ? t.pinWorking : pinned ? t.pinUnlock : t.pinLock}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Ad-account picker — the sanctioned way to change the selected
          account after OAuth (the token stays; only the selection moves). */}
      {connection && !pending ? (
        <div className="rounded-2xl border border-border/70">
          <button
            type="button"
            onClick={() => {
              setPickerOpen((v) => !v);
              if (!pickerOpen && accounts === null) void loadAccounts();
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          >
            {t.pickerToggle}
            <span aria-hidden>{pickerOpen ? "−" : "+"}</span>
          </button>
          {pickerOpen ? (
            <div className="space-y-3 border-t border-border/70 p-4">
              {loading === "accounts" || accounts === null ? (
                <p className="text-sm text-muted-foreground">{t.pickerLoading}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t.pickerLabel}</p>
                  {accountSelect(null)}
                  {pinned ? <p className="text-xs text-muted-foreground">{t.pickerLockedHint}</p> : null}
                  <Button
                    disabled={loading !== null || !selection || selection === connection.adAccountId || Boolean(pinned)}
                    onClick={() => runAction("picker-apply", () => chooseAccount((name) => t.pickerSwitched(name)))}
                  >
                    {loading === "picker-apply" ? t.pickerApplying : t.pickerApply}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Sync controls — syncing needs a locked account. */}
      {connection ? (
        <div className="space-y-2">
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
              disabled={loading !== null || !pinned}
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
          {!pinned ? <p className="text-xs text-muted-foreground">{t.syncLockedHint}</p> : null}
        </div>
      ) : null}

      {/* Manual path — collapsed unless there's nothing connected at all. */}
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
