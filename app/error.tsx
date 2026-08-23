"use client";

// Segment-level error boundary. Fires for errors thrown inside any
// route below `app/` when the root layout itself is still fine. Sentry
// captures the exception; the UI keeps the app shell so navigation
// still works (unlike global-error, which replaces the whole document).
//
// Locale: error boundaries are client components rendered outside the
// server locale plumbing, so we read the `app-locale` cookie directly
// (the same cookie middleware sets from ?lang=). Defaults to Hebrew.

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

function readLocaleCookie(): "he" | "en" {
  if (typeof document === "undefined") return "he";
  return /(?:^|;\s*)app-locale=en\b/.test(document.cookie) ? "en" : "he";
}

export default function RouteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Cookie is read after mount so SSR and first paint agree (Hebrew),
  // then corrects for English users without a hydration mismatch.
  const [locale, setLocale] = useState<"he" | "en">("he");
  useEffect(() => setLocale(readLocaleCookie()), []);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      dir={isHe ? "rtl" : "ltr"}
      lang={locale}
      className="mx-auto max-w-2xl px-6 py-16 text-slate-900"
    >
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="mb-2 text-lg font-bold">
          {lang("משהו השתבש בטעינת המסך הזה", "Something went wrong loading this screen")}
        </h2>
        <p className="mb-4 text-sm leading-6 text-slate-700">
          {lang(
            "שלחנו את השגיאה לצוות. אפשר לטעון מחדש את המסך או לחזור לעמוד הראשי.",
            "We've sent the error to our team. You can reload this screen or go back to the main page."
          )}
        </p>
        {error.digest ? (
          <p className="mb-4 font-mono text-xs text-slate-500">
            {lang("קוד זיהוי", "Reference code")}: <span dir="ltr">{error.digest}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {lang("נסו שוב", "Try again")}
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-500"
          >
            {lang("חזרה לעמוד הראשי", "Back to the main page")}
          </a>
        </div>
      </div>
    </div>
  );
}
