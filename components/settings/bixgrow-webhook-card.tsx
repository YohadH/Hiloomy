"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Loader2, AlertTriangle, Webhook } from "lucide-react";
import { useSaasStrings, type UiLocale } from "@/lib/i18n/saas-strings";

// BixGrow per-brand webhook configuration card. Shows the public webhook
// URL the merchant pastes into BixGrow ("send order webhook to") for the
// active brand. Lets them edit the slug if they want it to match their
// brand name (e.g. /api/webhooks/bixgrow/aftershower instead of a cuid).

export function BixGrowWebhookCard({
  initialSlug,
  publicAppUrl,
  storeName,
  locale = "he"
}: {
  initialSlug: string | null;
  publicAppUrl: string;
  storeName: string;
  locale?: UiLocale;
}) {
  const router = useRouter();
  const t = useSaasStrings(locale).bixgrow;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [savedSlug, setSavedSlug] = useState(initialSlug);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webhookUrl = savedSlug
    ? `${publicAppUrl.replace(/\/$/, "")}/api/webhooks/bixgrow/${savedSlug}`
    : null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/bixgrow-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? "Failed to save slug.");
      }
      setSavedSlug(body.slug);
      setSlug(body.slug);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
          <Webhook className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">{t.title} {storeName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.slugLabel}
          </span>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t.slugPlaceholder}
              maxLength={32}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 w-full sm:flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !slug.trim()}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {saving ? t.savingButton : t.saveButton}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t.slugHint}</p>
        </label>

        {webhookUrl ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.webhookUrl}
            </p>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 w-full sm:flex-1 truncate rounded-md border border-border bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                    {t.copied}
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden />
                    {t.copy}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
            {t.saveSlugFirst}
          </p>
        )}

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            ⚠ {error}
          </p>
        ) : null}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            {t.payloadDetails}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-[11px] leading-5 text-slate-800">{`POST /api/webhooks/bixgrow/<slug>
Content-Type: application/json

{
  "order": {
    "date": "2026-06-08 10:00:00",
    "order": "#31701",
    "affiliate_name": "Dana",
    "affiliate_email": "dana@example.com",
    "affiliate_id": "AFF-123",
    "total": 198.5,
    "commissionable_sales": 198.5,
    "commission": 19.85,
    "coupons": "DANA15",
    "status": "approved",
    "tracking_by": "coupon"
  }
}`}</pre>
          <p className="mt-2">{t.payloadAfter}</p>
        </details>
      </div>
    </div>
  );
}
