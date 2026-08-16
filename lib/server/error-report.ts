// Error-reporting helper.
//
// Wraps @sentry/nextjs so services don't have to know whether Sentry is
// configured. Two flavors:
//
//   reportError(op, err, context?)
//     Fired for things that already tripped a `.catch()` but shouldn't
//     kill the request. Always logs to console.error with a structured
//     shape; when SENTRY_DSN is live it also captures to Sentry with the
//     op as fingerprint + context as tags/extras. Silent-fail audit sites
//     route through here.
//
//   reportBreadcrumb(op, message, context?)
//     Fired for expected/handled degradations that we want to see in
//     Sentry breadcrumbs when a LATER error surfaces (e.g. "Meta refresh
//     failed but we continued and returned degraded data — if the caller
//     hits an error 200ms later, this breadcrumb shows why"). Logs at
//     console.warn locally.
//
// Both are no-op safe when Sentry isn't installed / DSN missing.

import * as Sentry from "@sentry/nextjs";

export interface ErrorReportContext {
  storeId?: string | null;
  userId?: string | null;
  orgId?: string | null;
  mode?: string | null;
  // Free-form extras — anything the caller thinks helps a human diagnose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Sentry.captureException takes any Error/object; we normalize non-Error
// values into a proper Error so stack traces attach cleanly.
function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : JSON.stringify(value));
}

export function reportError(
  op: string,
  err: unknown,
  context: ErrorReportContext = {}
): void {
  const error = toError(err);
  // Console — always. This survives when Sentry is off (local dev, DSN
  // missing) and matches the shape existing catch blocks already print.
  console.error(`[SA-SILENT-FAIL] ${op} failed:`, {
    op,
    err: error.message,
    ...context
  });

  // Sentry — only when configured.
  try {
    Sentry.withScope((scope) => {
      scope.setTag("op", op);
      if (context.storeId) scope.setTag("storeId", context.storeId);
      if (context.userId) scope.setTag("userId", context.userId);
      if (context.orgId) scope.setTag("orgId", context.orgId);
      if (context.mode) scope.setTag("mode", context.mode);
      // Group sibling failures of the same op together so Sentry's issue
      // list doesn't fragment into one issue per storeId.
      scope.setFingerprint(["silent-fail", op]);
      // Extras carry the full context object.
      scope.setExtras(context as Record<string, unknown>);
      Sentry.captureException(error);
    });
  } catch {
    // If Sentry init failed for any reason we don't want error-reporting
    // itself to throw and mask the original failure.
  }
}

export function reportBreadcrumb(
  op: string,
  message: string,
  context: ErrorReportContext = {}
): void {
  console.warn(`[SA-BREADCRUMB] ${op}: ${message}`, context);
  try {
    Sentry.addBreadcrumb({
      category: op,
      message,
      level: "warning",
      data: context as Record<string, unknown>
    });
  } catch {
    // Same defensive behavior as reportError.
  }
}
