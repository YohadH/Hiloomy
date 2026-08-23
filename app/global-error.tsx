"use client";

// Top-level React error boundary. Next.js renders this when the root
// layout itself throws (or any part of the tree bubbles up unhandled).
// Captures to Sentry when NEXT_PUBLIC_SENTRY_DSN is configured, then shows
// a minimal recovery UI that doesn't rely on the app shell (which may be
// what crashed).
//
// Locale: this replaces the whole document and renders outside every
// provider, so the `app-locale` cookie is read directly on the client.
// Defaults to Hebrew (Hebrew-first app).

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

function readLocaleCookie(): "he" | "en" {
  if (typeof document === "undefined") return "he";
  return /(?:^|;\s*)app-locale=en\b/.test(document.cookie) ? "en" : "he";
}

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<"he" | "en">("he");
  useEffect(() => setLocale(readLocaleCookie()), []);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={locale} dir={isHe ? "rtl" : "ltr"}>
      <body
        style={{
          margin: 0,
          padding: "3rem 1.5rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Heebo", sans-serif',
          color: "#0F172A",
          background: "#F8FAFC",
          minHeight: "100vh"
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "0.75rem"
            }}
          >
            {lang("משהו השתבש בטעינת הדף", "Something went wrong loading the page")}
          </h1>
          <p
            style={{
              color: "#475569",
              lineHeight: 1.6,
              marginBottom: "1.25rem"
            }}
          >
            {lang(
              "השגיאה נשלחה לצוות באופן אוטומטי. אפשר לנסות לטעון מחדש את הדף, ואם השגיאה חוזרת אנחנו כבר עובדים עליה.",
              "The error was sent to our team automatically. Try reloading the page — if it keeps happening, we're already on it."
            )}
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#94A3B8",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                marginBottom: "1.5rem"
              }}
            >
              {lang("קוד זיהוי", "Reference code")}: <span dir="ltr">{error.digest}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.6rem 1.25rem",
              border: "none",
              background: "#0F172A",
              color: "#F8FAFC",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: "0.375rem",
              cursor: "pointer"
            }}
          >
            {lang("נסו שוב", "Try again")}
          </button>
        </div>
      </body>
    </html>
  );
}
