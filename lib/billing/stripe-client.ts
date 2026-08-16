// Singleton Stripe SDK client. Pulled from STRIPE_SECRET_KEY at runtime.
// Server-only — never import this from a Client Component.

import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure it in Render env vars (test key for dev, live key for prod)."
    );
  }
  cached = new Stripe(key, {
    // Pin an explicit API version. Stripe ships a new "LatestApiVersion"
    // type with each SDK bump; pinning to a string avoids churn.
    apiVersion: "2024-12-18.acacia" as never,
    typescript: true,
    appInfo: { name: "Hiloomy", version: "1.0.0" }
  });
  return cached;
}
