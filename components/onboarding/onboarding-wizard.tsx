"use client";

import { useState } from "react";
import { ExternalLink, Loader2, ShoppingBag, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";

// New-user onboarding wizard. Renders in place of the empty Command
// Center for users whose org has no connected Shopify stores yet.
//
// Two steps:
//   1. Welcome — short pitch + "Let's connect your first brand" CTA
//   2. Connect Shopify — paste shop domain, click "Install via Shopify",
//      we redirect to the OAuth install URL. After Shopify redirects
//      back, the page reloads → onboarding status flips → user lands
//      on a fresh Command Center (which then waits for first sync).
//
// We don't put plan picker / billing here yet — that's deferred to
// post-trial. The goal of v1 onboarding is "get them to first data".

type Step = "welcome" | "connect";

export function OnboardingWizard({
  email,
  pendingShopDomain,
  locale = "he"
}: {
  email: string;
  pendingShopDomain: string | null;
  locale?: "he" | "en";
}) {
  const [step, setStep] = useState<Step>(pendingShopDomain ? "connect" : "welcome");
  const [shopDomain, setShopDomain] = useState(pendingShopDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const t =
    locale === "he"
      ? {
          welcome: {
            kicker: "ברוכים הבאים",
            title: "בואו נחבר את החנות הראשונה שלכם",
            body:
              "נציג לכם את ההכנסות, הרווח, הקמפיינים, הלקוחות החוזרים והשותפים — הכל במקום אחד. נתחיל בחיבור Shopify.",
            cta: "בואו נתחיל",
            ttwc: "מה צריך כדי להתחבר?",
            ttwc1: "כתובת החנות (לדוגמה: yourstore.myshopify.com)",
            ttwc2: "הרשאת בעלים בחשבון Shopify",
            ttwc3: "כ30 שניות"
          },
          connect: {
            kicker: "חיבור Shopify",
            title: "כתובת החנות שלכם",
            body: "הזינו את הדומיין המלא של החנות. נפנה אתכם לShopify לאישור.",
            shopLabel: "כתובת Shopify",
            shopPlaceholder: "yourstore.myshopify.com",
            cta: "התקינו דרך Shopify",
            ctaLoading: "ממתינים לShopify…",
            back: "חזרה",
            note: "אנחנו לא רואים את הסיסמה שלכם — Shopify מנהלת את האימות."
          }
        }
      : {
          welcome: {
            kicker: "Welcome",
            title: "Let's connect your first brand",
            body:
              "We'll surface your revenue, margin, ads, retention, and affiliates — all in one place. Start with your Shopify store.",
            cta: "Let's go",
            ttwc: "What you'll need",
            ttwc1: "Your shop domain (e.g. yourstore.myshopify.com)",
            ttwc2: "Owner access on Shopify",
            ttwc3: "About 30 seconds"
          },
          connect: {
            kicker: "Connect Shopify",
            title: "Your shop domain",
            body: "Enter your full Shopify domain. We'll send you to Shopify to approve.",
            shopLabel: "Shopify domain",
            shopPlaceholder: "yourstore.myshopify.com",
            cta: "Install via Shopify",
            ctaLoading: "Redirecting to Shopify…",
            back: "Back",
            note: "We never see your password — Shopify handles auth."
          }
        };

  const handleConnect = () => {
    setError(null);
    const cleanDomain = shopDomain.trim().toLowerCase();
    if (!cleanDomain) {
      setError(locale === "he" ? "נדרשת כתובת חנות." : "Shop domain is required.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*(\.myshopify\.com)?$/.test(cleanDomain)) {
      setError(
        locale === "he"
          ? "כתובת לא תקינה. דוגמה: yourstore.myshopify.com"
          : "Invalid domain. Example: yourstore.myshopify.com"
      );
      return;
    }
    setLoading(true);
    // Use the OAuth install endpoint we already built. After Shopify
    // approves, it redirects back to /api/shopify/oauth/callback which
    // sets up the ShopifyConnection and redirects to /settings or /.
    window.location.href = `/api/shopify/oauth/install?shop=${encodeURIComponent(cleanDomain)}`;
  };

  return (
    <div
      dir={locale === "he" ? "rtl" : "ltr"}
      className="min-h-[60vh] flex items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-xl">
        {step === "welcome" ? (
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/40 to-indigo-50/40 p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-200 text-violet-700">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                {t.welcome.kicker}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t.welcome.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t.welcome.body}</p>

            <div className="mt-6 rounded-lg border border-border bg-card p-4 text-xs">
              <p className="font-semibold mb-2">{t.welcome.ttwc}</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShoppingBag className="h-3.5 w-3.5 mt-0.5 text-violet-600" aria-hidden />
                  {t.welcome.ttwc1}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600" aria-hidden />
                  {t.welcome.ttwc2}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600" aria-hidden />
                  {t.welcome.ttwc3}
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setStep("connect")}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
            >
              {t.welcome.cta}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <ShoppingBag className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                {t.connect.kicker}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t.connect.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t.connect.body}</p>

            <label className="mt-6 block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.connect.shopLabel}
              </span>
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder={t.connect.shopPlaceholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t.connect.note}</p>
            </label>

            {error ? (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="text-xs text-muted-foreground hover:text-foreground underline order-2 sm:order-1"
              >
                {t.connect.back}
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading || !shopDomain.trim()}
                className="order-1 sm:order-2 sm:ms-auto inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                {loading ? t.connect.ctaLoading : t.connect.cta}
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          {email}
        </p>
      </div>
    </div>
  );
}
