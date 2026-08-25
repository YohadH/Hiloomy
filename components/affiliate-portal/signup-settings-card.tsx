"use client";

// "הרשמת שותפים" — the owner's signup control card (HLA-12/B7).
// Saving a slug here is the switch that turns on the whole in-app funnel:
// /join/{slug} (public signup), /r/{slug}/{code} (tracked links, and every
// member's referral link is regenerated to it), /my/{slug} (affiliate login).

import { useState } from "react";
import { Check, Copy, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import type { SignupSettings } from "@/lib/services/affiliate-signup-service";

export function SignupSettingsCard({
  initial,
  isHe
}: {
  initial: SignupSettings;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const [settings, setSettings] = useState<SignupSettings>(initial);
  const [slug, setSlug] = useState(initial.signupSlug ?? "");
  const [autoApprove, setAutoApprove] = useState(initial.autoApprove);
  const [commissionRatePct, setCommissionRatePct] = useState(String(initial.commissionRatePct));
  const [brandLogoUrl, setBrandLogoUrl] = useState(initial.brandLogoUrl ?? "");
  const [brandAccentColor, setBrandAccentColor] = useState(initial.brandAccentColor ?? "#047857");
  const [signupHeadline, setSignupHeadline] = useState(initial.signupHeadline ?? "");
  const [signupCopy, setSignupCopy] = useState(initial.signupCopy ?? "");
  const [termsText, setTermsText] = useState(initial.termsText ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate-portal/signup-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signupSlug: slug.trim().toLowerCase(),
          autoApprove,
          commissionRatePct: Number(commissionRatePct),
          brandLogoUrl: brandLogoUrl.trim() || null,
          brandAccentColor: brandAccentColor.trim() || null,
          signupHeadline: signupHeadline.trim() || null,
          signupCopy: signupCopy.trim() || null,
          termsText: termsText.trim() || null
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? lang("השמירה נכשלה", "Save failed"));
      setSettings(body.settings as SignupSettings);
      toast.success(lang("הגדרות ההרשמה נשמרו — הקישורים פעילים", "Signup settings saved — links are live"));
    } catch (err) {
      toast.error(err, { fallback: lang("השמירה נכשלה", "Save failed") });
    } finally {
      setSaving(false);
    }
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const inputCls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
  const labelCls = "text-xs font-semibold text-muted-foreground";

  const links: Array<{ key: string; label: string; value: string | null }> = [
    { key: "join", label: lang("דף ההרשמה הציבורי", "Public signup page"), value: settings.joinUrl },
    { key: "home", label: lang("כניסת שותפים לדשבורד", "Affiliate dashboard login"), value: settings.affiliateHomeUrl },
    { key: "sample", label: lang("מבנה קישור מעקב", "Tracked link format"), value: settings.sampleTrackedLink }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lang("הרשמת שותפים", "Affiliate signup")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {lang(
            "דף הרשמה ממותג בתוך Hiloomy: שמירת סלאג מפעילה את דף ההצטרפות, קישורי המעקב ודשבורד השותפים — ומעדכנת את הקישור האישי של כל השותפות הקיימות.",
            "A branded signup page inside Hiloomy: saving a slug activates the join page, tracked links, and the affiliate dashboard — and regenerates every existing member's referral link."
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={labelCls}>{lang("סלאג ציבורי (באנגלית)", "Public slug")}</span>
            <input
              dir="ltr"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={settings.suggestedSlug}
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className={labelCls}>{lang("אחוז עמלה", "Commission %")}</span>
            <input
              dir="ltr"
              type="number"
              min={0}
              max={90}
              step="0.5"
              value={commissionRatePct}
              onChange={(e) => setCommissionRatePct(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className={labelCls}>{lang("לוגו (URL)", "Logo URL")}</span>
            <input
              dir="ltr"
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className={labelCls}>{lang("צבע מותג", "Accent color")}</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(brandAccentColor) ? brandAccentColor : "#047857"}
                onChange={(e) => setBrandAccentColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-background p-1"
              />
              <input
                dir="ltr"
                value={brandAccentColor}
                onChange={(e) => setBrandAccentColor(e.target.value)}
                className={inputCls}
              />
            </div>
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelCls}>{lang("כותרת דף ההרשמה", "Signup headline")}</span>
          <input
            value={signupHeadline}
            onChange={(e) => setSignupHeadline(e.target.value)}
            placeholder={lang("הצטרפו לתוכנית השותפות שלנו", "Join our affiliate program")}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>{lang("טקסט פתיחה", "Intro copy")}</span>
          <textarea
            value={signupCopy}
            onChange={(e) => setSignupCopy(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>{lang("תנאי התוכנית (מוצג בדף ההרשמה)", "Program terms (shown on the signup page)")}</span>
          <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={3} className={inputCls} />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-emerald-600"
          />
          <span>
            {lang("אישור אוטומטי — נרשמות מאושרות מיד ללא בדיקה ידנית", "Auto-approve — signups become active without manual review")}
          </span>
        </label>

        <button
          type="button"
          onClick={save}
          disabled={saving || !slug.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {lang("שמירה והפעלה", "Save & activate")}
        </button>

        {settings.joinUrl ? (
          <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            {links.map((l) =>
              l.value ? (
                <div key={l.key} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={labelCls}>{l.label}</p>
                    <p className="truncate font-mono text-xs" dir="ltr">
                      {l.value}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(l.key, l.value as string)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    {copied === l.key ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {lang("העתקה", "Copy")}
                  </button>
                </div>
              ) : null
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
