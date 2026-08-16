// Shared cron-secret guard for cron-triggered routes that live OUTSIDE
// /api/cron/* (e.g. /api/daily-report/cron/run, /api/weekly-summary/cron/run).
//
// Routes under /api/cron/ are already protected by the middleware.ts gate.
// Routes that live in other API namespaces but are session-less cron calls
// must call requireCronSecret() at the top of their handler.
//
// Return value:
//   null  — request is authorized (caller should proceed)
//   Response — 401 to return immediately (caller should return it)
//
// CRON_SECRET MUST be set in all environments (local dev and production).
// When CRON_SECRET is absent the guard returns 401 (fail-closed, not fail-open).

export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    // fail-closed: deny when CRON_SECRET is not configured
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const provided = request.headers.get("x-cron-secret")?.trim();
  if (provided && provided === expected) return null; // authorized

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
}
