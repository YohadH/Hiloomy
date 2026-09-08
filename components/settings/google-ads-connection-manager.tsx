"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSyncStatus } from "@/components/sync/sync-status-provider";

// Google Ads connection card — mirrors the GA4 card: OAuth connect + an ad
// account picker (the sync only runs once an account is chosen).

type GoogleAdsConnectionStatus = {
  status: string;
  tokenLastFour: string | null;
  healthMessage: string | null;
  lastSyncAt: string | null;
  customerName: string | null;
  customerId: string | null;
} | null;

export function GoogleAdsConnectionManager({
  storeId,
  initialConnection,
  connected,
  error: initialError,
  developerTokenConfigured,
  locale = "he"
}: {
  storeId: string;
  initialConnection: GoogleAdsConnectionStatus;
  connected?: boolean;
  error?: string | null;
  developerTokenConfigured: boolean;
  locale?: "he" | "en";
}) {
  const router = useRouter();
  const sync = useSyncStatus();
  const syncing = sync?.isRunning("google-ads") ?? false;
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [connection] = useState<GoogleAdsConnectionStatus>(initialConnection);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [successMsg, setSuccessMsg] = useState<string | null>(
    connected ? lang("Google Ads חובר — עכשיו בחרו את חשבון המודעות למטה.", "Google Ads connected — now pick the ad account below.") : null
  );
  const [customers, setCustomers] = useState<Array<{ customerId: string; name: string; currency: string | null; manager: boolean }> | null>(null);
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState<string | null>(initialConnection?.customerId ?? null);
  const [busy, setBusy] = useState(false);
  const isConnected = connection?.status === "connected";

  function startOAuth() {
    setError(null);
    setSuccessMsg(null);
    window.location.href = `/api/google-ads/oauth/start?storeId=${encodeURIComponent(storeId)}`;
  }

  async function loadCustomers() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/google-ads/customers?storeId=${encodeURIComponent(storeId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? lang("לא ניתן לטעון חשבונות Google Ads.", "Could not load Google Ads accounts."));
      const list = (body.customers ?? []) as Array<{ customerId: string; name: string; currency: string | null; manager: boolean }>;
      setCustomers(list);
      const first = list.find((c) => !c.manager)?.customerId ?? "";
      setSelected(body.selectedCustomerId ?? first);
      setSaved(body.selectedCustomerId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("לא ניתן לטעון חשבונות Google Ads.", "Could not load Google Ads accounts."));
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/google-ads/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, customerId: selected })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body?.error ?? lang("לא ניתן לשמור את החשבון.", "Could not save the account."));
      setSaved(selected);
      setSuccessMsg(lang("חשבון Google Ads נשמר. לחצו על סנכרון עכשיו כדי למשוך 90 יום של קמפיינים.", "Google Ads account saved. Press Sync now to pull 90 days of campaigns."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : lang("לא ניתן לשמור את החשבון.", "Could not save the account."));
    } finally {
      setBusy(false);
    }
  }

  function syncNow() {
    setError(null);
    setSuccessMsg(null);
    sync?.startSync({
      id: "google-ads",
      label: "Google Ads",
      url: "/api/google-ads/sync",
      body: { storeId },
      describeResult: (body) => lang(`סונכרנו ${body.campaigns} קמפיינים על פני ${body.days} ימים (${body.rowsUpserted} שורות)`, `Synced ${body.campaigns} campaigns over ${body.days} days (${body.rowsUpserted} rows)`),
      onDone: () => router.refresh()
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
          </span>
          <CardTitle className="text-base">Google Ads</CardTitle>
          {isConnected ? (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {lang("מחובר", "Connected")}
            </span>
          ) : (
            <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
              <XCircle className="h-3 w-3" aria-hidden />
              {lang("לא מחובר", "Not connected")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {lang(
            "הוצאה, המרות וערך המרות לכל קמפיין — חיפוש, שופינג ו־Performance Max — לצד Meta, באותו חלון זמן.",
            "Spend, conversions and conversion value per campaign — Search, Shopping and Performance Max — next to Meta, in the same window."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!developerTokenConfigured ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {lang(
              "חסר GOOGLE_ADS_DEVELOPER_TOKEN בסביבה. יש להעתיק את טוקן המפתח הקיים של אפליקציית Hiloomy ב־Google Ads למשתני הסביבה ב־Render. אפשר לחבר כבר עכשיו; הסנכרון יעבוד ברגע שהטוקן יוגדר.",
              "GOOGLE_ADS_DEVELOPER_TOKEN is missing from the environment. Copy the Hiloomy app's existing Google Ads developer token into the Render environment. You can connect now; sync works once the token is set."
            )}
          </p>
        ) : null}
        {successMsg ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">{successMsg}</p> : null}
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p> : null}

        {isConnected && connection ? (
          <div className="space-y-2 rounded-lg border border-border bg-background/70 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{lang("חשבון המודעות", "Ad account")}</span>
              <span className="font-mono text-xs" dir="ltr">
                {saved ? `${connection.customerName ?? ""} (${saved})`.trim() : lang("לא נבחר — הסנכרון מושהה עד שתבחרו חשבון", "not selected — sync is paused until you pick one")}
              </span>
            </div>
            {connection.lastSyncAt ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{lang("סנכרון אחרון", "Last synced")}</span>
                <span suppressHydrationWarning className="tabular-nums">{new Date(connection.lastSyncAt).toLocaleString()}</span>
              </div>
            ) : null}
            {customers === null ? (
              <Button variant="secondary" size="sm" onClick={loadCustomers} disabled={busy}>
                {busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {lang("בחרו חשבון מודעות", "Choose ad account")}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" dir="ltr">
                  {customers.map((c) => (
                    <option key={c.customerId} value={c.customerId} disabled={c.manager}>
                      {c.name} ({c.customerId}){c.currency ? ` · ${c.currency}` : ""}{c.manager ? ` · ${lang("חשבון מנהל", "manager")}` : ""}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={saveCustomer} disabled={busy || !selected || selected === saved}>
                  {busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  {lang("שמרו", "Save")}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {isConnected ? (
            <>
              <Button size="sm" onClick={syncNow} disabled={busy || syncing}>
                {syncing ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {syncing ? lang("מסנכרן ברקע…", "Syncing in background…") : lang("סנכרון עכשיו", "Sync now")}
              </Button>
              <Button variant="secondary" size="sm" onClick={startOAuth}>
                {lang("חיבור מחדש", "Reconnect")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startOAuth}>
              {lang("חברו את Google Ads", "Connect Google Ads")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {lang("משתמש באותה התחברות ל־Google כמו Search Console ו־GA4. מתבקשת גישת קריאה לחשבון המודעות.", "Uses the same Google sign-in as Search Console and GA4. Read access to the ad account is requested.")}
        </p>
      </CardContent>
    </Card>
  );
}
