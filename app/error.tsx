"use client";

// Segment-level error boundary. Fires for errors thrown inside any
// route below `app/` when the root layout itself is still fine. Sentry
// captures the exception; the UI keeps the app shell so navigation
// still works (unlike global-error, which replaces the whole document).

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RouteError({
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
    <div
      dir="rtl"
      className="mx-auto max-w-2xl px-6 py-16 text-slate-900"
    >
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="mb-2 text-lg font-bold">
          משהו השתבש בטעינת המסך הזה
        </h2>
        <p className="mb-4 text-sm leading-6 text-slate-700">
          שלחנו את השגיאה לצוות. אפשר לטעון מחדש את המסך או לחזור לעמוד
          הראשי.
        </p>
        {error.digest ? (
          <p className="mb-4 font-mono text-xs text-slate-500">
            קוד זיהוי: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            נסו שוב
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-500"
          >
            חזרה לעמוד הראשי
          </a>
        </div>
      </div>
    </div>
  );
}
