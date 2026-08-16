// Sentry server-side init. Loaded by Next.js automatically when the
// server starts. Captures unhandled errors in API routes, server
// components, and the background crons.
//
// Skips init entirely when SENTRY_DSN is not set — keeps local dev quiet
// and avoids accidental emission to a stale DSN.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Tracing — keep cheap by default. Bump later if traces are useful.
    tracesSampleRate: 0.1,
    // Don't capture PII (email addresses etc) unless explicitly tagged.
    sendDefaultPii: false,
    // Always tag with the deploy version if Render exposes it. RENDER_GIT_COMMIT
    // is set by Render automatically on every deploy.
    release: process.env.RENDER_GIT_COMMIT
      ? `brandzp@${process.env.RENDER_GIT_COMMIT.slice(0, 7)}`
      : undefined
  });
}
