"use client";

// Admin tool: onboard a design partner (or your own extra store) in 2026's
// custom-distribution model. You paste the store's own Shopify app
// Client ID/Secret; Hiloomy creates the (isolated) org, registers the creds,
// and hands back an install link + invite link to send. The partner installs
// on their store and logs in — nothing else to configure on their side.

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Store, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type Mode = "partner" | "own";

interface OnboardingResult {
  brandName: string;
  shopDomain: string;
  mode: Mode;
  installUrl: string;
  inviteUrl: string | null;
  loginUrl: string;
  status: string;
}

interface ListItem {
  id: string;
  shopDomain: string;
  targetOrgName: string;
  invitedEmail: string | null;
  status: string;
  createdAt: string;
}

export function DesignPartnersManager({ isHe }: { isHe: boolean }) {
  const lang = (he: string, en: string) => (isHe ? he : en);

  const [mode, setMode] = useState<Mode>("partner");
  const [brandName, setBrandName] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const loadList = async () => {
    try {
      const res = await fetch("/api/admin/store-onboarding");
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) setItems(body.items as ListItem[]);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // clipboard blocked — value is selectable in the field
    }
  };

  const submit = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/store-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          shopDomain: shopDomain.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          mode,
          partnerEmail: mode === "partner" ? partnerEmail.trim() : undefined
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? lang("השמירה נכשלה", "Save failed"));
      setResult(body.result as OnboardingResult);
      toast.success(lang("המותג נרשם — שלחו את הקישורים", "Brand registered — send the links"));
      // Clear the secret from the form once it's stored (it's encrypted server-side).
      setClientSecret("");
      loadList();
    } catch (err) {
      toast.error(err, { fallback: lang("השמירה נכשלה", "Save failed") });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
  const labelCls = "text-xs font-semibold text-muted-foreground";

  const canSubmit =
    brandName.trim() &&
    shopDomain.trim() &&
    clientId.trim() &&
    clientSecret.trim() &&
    (mode === "own" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail.trim()));

  const statusPill = (status: string) =>
    status === "connected" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        <Check className="h-3 w-3" />
        {lang("מחובר", "Connected")}
      </span>
    ) : (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        {lang("ממתין להתקנה", "Awaiting install")}
      </span>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{lang("הוספת מותג / שותף עיצוב", "Add a brand / design partner")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {lang(
              "צרו אפליקציית Custom distribution לחנות ב-Partner Dashboard, הדביקו כאן את ה-Client ID וה-Secret שלה. Hiloomy תיצור ארגון (מבודד לשותף), ותחזיר קישור התקנה + קישור כניסה לשליחה. השותף מתקין ונכנס — בלי הגדרות נוספות.",
              "Create a Custom-distribution app for the store in the Partner Dashboard, then paste its Client ID + Secret here. Hiloomy creates the org (isolated for a partner) and returns an install link + a login link to send. The partner installs and logs in — nothing else to configure."
            )}
          </p>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("partner")}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                mode === "partner"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              {lang("שותף עיצוב (ארגון חדש)", "Design partner (new org)")}
            </button>
            <button
              type="button"
              onClick={() => setMode("own")}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                mode === "own"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Store className="h-4 w-4" />
              {lang("חנות שלי (לארגון הנוכחי)", "My own store (this org)")}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>{lang("שם המותג", "Brand name")}</span>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputCls} placeholder={lang("מותג לדוגמה", "Example Brand")} />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{lang("כתובת החנות", "Store domain")}</span>
              <input dir="ltr" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} className={inputCls} placeholder="store.myshopify.com" />
            </label>
            {mode === "partner" ? (
              <label className="space-y-1 sm:col-span-2">
                <span className={labelCls}>{lang("אימייל השותף (יהפוך לבעלים של הארגון)", "Partner email (becomes org owner)")}</span>
                <input dir="ltr" type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} className={inputCls} placeholder="partner@brand.com" />
              </label>
            ) : null}
            <label className="space-y-1">
              <span className={labelCls}>{lang("Client ID של האפליקציה", "App Client ID")}</span>
              <input dir="ltr" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} placeholder="a1b2c3…" />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{lang("Client Secret של האפליקציה", "App Client Secret")}</span>
              <input dir="ltr" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className={inputCls} placeholder="shpss_…" autoComplete="off" />
            </label>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={saving || !canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {lang("רישום ויצירת קישורים", "Register & generate links")}
          </button>

          {result ? (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {lang(`"${result.brandName}" מוכן — שלחו את הקישורים:`, `"${result.brandName}" is ready — send these links:`)}
              </p>
              {[
                { key: "install", label: lang("קישור התקנה (לפתוח בחנות)", "Install link (open on the store)"), value: result.installUrl },
                ...(result.inviteUrl
                  ? [{ key: "invite", label: lang("קישור הצטרפות לשותף", "Partner invite link"), value: result.inviteUrl }]
                  : []),
                { key: "login", label: lang("קישור כניסה", "Login link"), value: result.loginUrl }
              ].map((l) => (
                <div key={l.key} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={labelCls}>{l.label}</p>
                    <p className="truncate font-mono text-xs" dir="ltr">{l.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(l.key, l.value)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    {copied === l.key ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {lang("העתקה", "Copy")}
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {lang(
                  "השותף פותח את קישור ההתקנה → מאשר בחנות → נכנס עם קישור הכניסה. הדשבורד שלו יתחבר אוטומטית.",
                  "The partner opens the install link → approves on their store → signs in with the login link. Their dashboard connects automatically."
                )}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang("מותגים שנרשמו", "Registered brands")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {items.length === 0 ? (
            <p className="text-muted-foreground">{lang("עדיין לא נרשמו מותגים.", "No brands registered yet.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-start font-semibold">{lang("חנות", "Store")}</th>
                    <th className="px-2 py-2 text-start font-semibold">{lang("ארגון", "Org")}</th>
                    <th className="px-2 py-2 text-start font-semibold">{lang("שותף", "Partner")}</th>
                    <th className="px-2 py-2 text-start font-semibold">{lang("סטטוס", "Status")}</th>
                    <th className="px-2 py-2 text-end font-semibold">{lang("קישור התקנה", "Install")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const installUrl = `/api/shopify/oauth/install?shop=${encodeURIComponent(it.shopDomain)}`;
                    return (
                      <tr key={it.id} className="border-b border-border/60">
                        <td className="px-2 py-2 font-mono text-xs" dir="ltr">{it.shopDomain}</td>
                        <td className="px-2 py-2">{it.targetOrgName}</td>
                        <td className="px-2 py-2 font-mono text-xs" dir="ltr">{it.invitedEmail ?? "—"}</td>
                        <td className="px-2 py-2">{statusPill(it.status)}</td>
                        <td className="px-2 py-2 text-end">
                          <button
                            type="button"
                            onClick={() => copy(`row-${it.id}`, `${window.location.origin}${installUrl}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                          >
                            {copied === `row-${it.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            {lang("העתקה", "Copy")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
