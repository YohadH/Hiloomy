// Master billing flag — lets the app run with Stripe completely
// unconfigured. Use this in every code path that touches Stripe:
//
//   if (!billingEnabled()) {
//     // fall back: treat user as paid, skip checkout, no-op webhooks
//   }
//
// Truthy values: "1", "true", "yes", "on" (case-insensitive).
// Default: OFF — Stripe stays dormant until you flip the switch.
//
// When OFF:
//   - getSubscriptionStatus() returns "paid" for every authenticated org
//     (no trial paywall, no banner)
//   - /api/billing/checkout returns a clear "billing disabled" error
//   - /api/billing/portal returns a clear "billing disabled" error
//   - /api/billing/webhook returns 200 OK no-op (so accidentally-configured
//     Stripe webhooks don't error)
//   - /billing page shows a friendly "billing disabled" notice
//
// When ON:
//   - Full Stripe flow as designed

export function billingEnabled(): boolean {
  const raw = (process.env.BILLING_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
