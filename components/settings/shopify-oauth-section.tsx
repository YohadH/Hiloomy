"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Loader2, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSaasStrings, type UiLocale } from "@/lib/i18n/saas-strings";

// The OAuth section that lives at the top of the Shopify connection card.
// Two parts:
//   1. "Install via Shopify" button — operator types a shop domain, clicks
//      → redirected to Shopify's authorize screen → callback saves token.
//   2. "Shopify Partner app credentials" — collapsible form for storing the
//      App API Key + API Secret directly in the DB (alternative to env vars).
//      Saves to /api/settings/shopify-app-config.
//
// Either path is acceptable. DB-stored credentials win if both are set.

interface AppConfigStatus {
  clientId: string | null;
  clientSecretLastFour: string | null;
  hasEnvFallback: { clientId: boolean; clientSecret: boolean };
}

export function ShopifyOauthSection({ locale = "he" }: { locale?: UiLocale }) {
  const t = useSaasStrings(locale).shopifyOauth;
  const [shopDomain, setShopDomain] = useState("");
  const [config, setConfig] = useState<AppConfigStatus | null>(null);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Result of the OAuth round-trip. The install/callback routes redirect
  // back to /settings with ?shopify=connected&shop=… on success or
  // ?shopify_error=… on failure. Nothing used to READ those params, so a
  // failed install (bad domain, HMAC, plan limit, missing org) landed the
  // operator back on Settings with zero feedback — the flow looked broken
  // even when it was correctly reporting why it stopped.
  const [oauthResult, setOauthResult] = useState<
    | { kind: "success"; shop: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/settings/shopify-app-config");
      const body = await res.json();
      if (res.ok && body.ok) {
        setConfig(body);
        setClientIdInput(body.clientId ?? "");
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadConfig();

    // Surface the OAuth redirect result, then strip the params from the
    // URL so a refresh doesn't re-show a stale banner.
    try {
      const params = new URLSearchParams(window.location.search);
      const connectedShop = params.get("shopify") === "connected" ? params.get("shop") : null;
      const oauthError = params.get("shopify_error");
      if (connectedShop) {
        setOauthResult({ kind: "success", shop: connectedShop });
      } else if (oauthError) {
        setOauthResult({ kind: "error", message: oauthError });
      }
      if (connectedShop || oauthError) {
        params.delete("shopify");
        params.delete("shop");
        params.delete("shopify_error");
        const rest = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${rest ? `?${rest}` : ""}`
        );
      }
    } catch {
      // window unavailable (SSR) — effect only runs client-side anyway.
    }
  }, []);

  const handleInstall = () => {
    if (!shopDomain.trim()) {
      setError(t.domainRequired);
      return;
    }
    setError(null);
    // Top-level navigation to the install route — it issues a 302 redirect
    // to Shopify which a fetch() would refuse to follow cross-origin.
    window.location.href = `/api/shopify/oauth/install?shop=${encodeURIComponent(shopDomain.trim())}`;
  };

  const handleSaveCredentials = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings/shopify-app-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput.trim() || undefined,
          clientSecret: clientSecretInput.trim() || undefined
        })
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to save.");
      setSavedMsg(t.savedMsg);
      setClientSecretInput("");
      void loadConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  const credentialsReady =
    (config?.clientId || config?.hasEnvFallback.clientId) &&
    (config?.clientSecretLastFour || config?.hasEnvFallback.clientSecret);

  const credentialsSource: string[] = [];
  if (config?.clientId) credentialsSource.push("Client ID (DB)");
  else if (config?.hasEnvFallback.clientId) credentialsSource.push("Client ID (env var)");
  if (config?.clientSecretLastFour) credentialsSource.push("Secret (DB)");
  else if (config?.hasEnvFallback.clientSecret) credentialsSource.push("Secret (env var)");

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/40 to-indigo-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-700">
          <KeyRound className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{t.headline}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.subline}</p>
        </div>
      </div>

      {oauthResult?.kind === "success" ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {locale === "he"
              ? `${oauthResult.shop} חוברה בהצלחה! הסנכרון הראשון יתחיל תוך רגע.`
              : `${oauthResult.shop} connected! The first sync starts momentarily.`}
          </p>
        </div>
      ) : null}
      {oauthResult?.kind === "error" ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {locale === "he" ? "החיבור לShopify נכשל" : "Shopify install failed"}
          </p>
          <p className="mt-1 text-xs text-rose-800">{oauthResult.message}</p>
        </div>
      ) : null}

      {credentialsReady ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-900">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {t.credsReady}
          </p>
          <p className="mt-1 text-emerald-800">{credentialsSource.join(" · ")}</p>
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t.credsMissing}
          </p>
          <p className="mt-1 text-amber-900">{t.credsMissingBody}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="yourstore.myshopify.com"
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full sm:flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button
          type="button"
          onClick={handleInstall}
          disabled={!credentialsReady}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t.install}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <details
        open={!credentialsReady}
        onToggle={(e) => setShowCredentialsForm((e.target as HTMLDetailsElement).open)}
        className="rounded-lg border border-border bg-card p-4 text-sm"
      >
        <summary className="cursor-pointer font-medium">
          {showCredentialsForm ? t.credsCardTitle : t.credsCardTitleHidden}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t.credsFormSubtitle}
            <code className="rounded bg-slate-100 px-1 text-[10px]">shpss_</code>. {t.stored}
          </p>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.clientIdLabel}
            </span>
            <input
              type="text"
              placeholder={t.clientIdPlaceholder}
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {config?.clientSecretLastFour ? t.clientSecretLabelSet : t.clientSecretLabel}
            </span>
            <input
              type="password"
              placeholder="shpss_..."
              value={clientSecretInput}
              onChange={(e) => setClientSecretInput(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveCredentials}
              disabled={saving || (!clientIdInput.trim() && !clientSecretInput.trim())}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {saving ? t.saving : t.save}
            </button>
            <a
              href="https://partners.shopify.com/current/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
            >
              {t.openPartner}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>

          {savedMsg ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
              ✓ {savedMsg}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-800">
              ⚠ {error}
            </p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            {t.callbackHint}{" "}
            <code className="rounded bg-slate-100 px-1">
              {process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app-url"}/api/shopify/oauth/callback
            </code>
          </p>
        </div>
      </details>
    </div>
  );
}
