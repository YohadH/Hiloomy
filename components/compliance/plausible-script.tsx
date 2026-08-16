"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getStoredCookieConsent } from "./cookie-banner";

// Plausible analytics loader. Three reasons we chose Plausible over PostHog:
//   1. Cookieless by default — doesn't trip GDPR cookie consent
//      requirements (banner still shown for legal safety)
//   2. Lightweight (<1KB) — no perf impact
//   3. Privacy-first reputation matches our brand promise
//
// Still respects the user's cookie consent: if they pick "Essential only",
// we skip loading the script entirely. If they accept analytics, OR if
// they haven't decided yet (cookieless by default), we load.

const DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const SCRIPT_SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT ?? "https://plausible.io/js/script.js";

export function PlausibleScript() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // Initial check.
    const consent = getStoredCookieConsent();
    if (consent === null || consent.analytics) setAllowed(true);

    // React to consent changes — banner emits a custom event.
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ analytics: boolean }>;
      setAllowed(ev.detail?.analytics ?? false);
    };
    window.addEventListener("cookie-consent-changed", handler);
    return () => window.removeEventListener("cookie-consent-changed", handler);
  }, []);

  // Skip entirely if not configured or not allowed.
  if (!DOMAIN || !allowed) return null;

  return (
    <Script
      data-domain={DOMAIN}
      src={SCRIPT_SRC}
      strategy="afterInteractive"
      defer
    />
  );
}
