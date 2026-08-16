// Sentry browser-side init. Loaded automatically by Next.js's instrumentation
// hook. Captures unhandled errors and rejections in the React tree, plus
// route-change navigation transactions.
//
// We use NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN) because this config runs
// in the browser bundle — only NEXT_PUBLIC_* env vars are exposed to it.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Skip noisy navigations like the home page → keep traces useful.
    // Session Replay is great for debugging UI bugs but expensive to
    // enable for everyone — gate it to errors only.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })]
  });
}
