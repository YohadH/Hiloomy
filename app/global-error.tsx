"use client";

// Top-level React error boundary. Next.js renders this when the root
// layout itself throws (or any part of the tree bubbles up unhandled).
// Captures to Sentry when NEXT_PUBLIC_SENTRY_DSN is configured, then shows
// a minimal recovery UI that doesn't rely on the app shell (which may be
// what crashed).

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
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
            משהו השתבש בטעינת הדף
          </h1>
          <p
            style={{
              color: "#475569",
              lineHeight: 1.6,
              marginBottom: "1.25rem"
            }}
          >
            השגיאה נשלחה לצוות באופן אוטומטי. אפשר לנסות לטעון מחדש את הדף,
            ואם השגיאה חוזרת אנחנו כבר עובדים עליה.
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
              קוד זיהוי: {error.digest}
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
            נסו שוב
          </button>
        </div>
      </body>
    </html>
  );
}
