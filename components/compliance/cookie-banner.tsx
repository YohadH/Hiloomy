"use client";

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

// GDPR-friendly cookie banner.
//
// Two consent levels:
//   - Essential — always on (auth cookies, session). No banner needed
//     for these under GDPR.
//   - Analytics — Plausible (cookieless anyway, but the banner still
//     gates loading the script in case we move to a heavier analytics
//     tool later).
//
// Stored in localStorage `cookie-consent` as JSON:
//   { analytics: boolean, decidedAt: number }
//
// Renders only after user hasn't made a decision yet (no key in
// localStorage). After Accept or Decline, the banner disappears for
// good (or until they clear storage).

interface ConsentState {
  analytics: boolean;
  decidedAt: number;
}

const STORAGE_KEY = "cookie-consent";

export function CookieBanner({ locale = "he" }: { locale?: "he" | "en" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Tiny delay so the banner doesn't flash before page settles.
        const t = window.setTimeout(() => setVisible(true), 600);
        return () => window.clearTimeout(t);
      }
    } catch {
      // localStorage blocked (private mode in some browsers) — skip banner.
    }
  }, []);

  const recordDecision = (analytics: boolean) => {
    try {
      const consent: ConsentState = { analytics, decidedAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch {
      // ignore
    }
    setVisible(false);
    // Tell any listening analytics script to start (or not).
    window.dispatchEvent(
      new CustomEvent("cookie-consent-changed", { detail: { analytics } })
    );
  };

  if (!visible) return null;

  const t =
    locale === "he"
      ? {
          title: "אנחנו משתמשים בעוגיות",
          body: "אנחנו משתמשים בעוגיות חיוניות לאימות ובאנליטיקה אנונימית לשיפור המוצר. בלי מעקב אישי.",
          accept: "אישור",
          essentialOnly: "רק חיוניות",
          learnMore: "למידע נוסף"
        }
      : {
          title: "We use cookies",
          body:
            "Essential cookies for sign-in, plus anonymous analytics to improve the product. No personal tracking.",
          accept: "Accept all",
          essentialOnly: "Essential only",
          learnMore: "Learn more"
        };

  return (
    <div
      dir={locale === "he" ? "rtl" : "ltr"}
      role="dialog"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-[100] mx-auto max-w-3xl px-4 pb-4"
    >
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-100 p-1.5 text-violet-700 shrink-0">
            <Cookie className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p id="cookie-banner-title" className="text-sm font-semibold">
              {t.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.body}{" "}
              <a href="/privacy" className="underline hover:text-foreground">
                {t.learnMore}
              </a>
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <button
            type="button"
            onClick={() => recordDecision(true)}
            className="inline-flex items-center justify-center rounded-md bg-violet-700 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-800"
          >
            {t.accept}
          </button>
          <button
            type="button"
            onClick={() => recordDecision(false)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted/60"
          >
            {t.essentialOnly}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper used by analytics-script gates: returns the user's recorded
// consent state, or null if they haven't decided yet.
export function getStoredCookieConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}
