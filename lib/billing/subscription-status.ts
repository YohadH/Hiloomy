// Resolves the active org's subscription state into one of four buckets:
//
//   - "trial_active"   — trial started, not expired yet
//   - "trial_expired"  — trial expired AND no paid plan (paywall)
//   - "paid"           — paying customer
//   - "no_org"         — anonymous / no org context (shouldn't reach here)
//
// Used by:
//   - Trial paywall middleware that blocks app pages
//   - /billing page rendering
//   - Plan-limit enforcement at action time

import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { billingEnabled } from "./billing-flag";

export type SubscriptionStatus = "trial_active" | "trial_expired" | "paid" | "no_org";

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: Date | null;
  daysUntilTrialEnd: number | null;
  hasStripeCustomer: boolean;
}

export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  const auth = await getAuthContext();
  if (!auth.orgId) {
    return {
      status: "no_org",
      plan: "trial",
      trialEndsAt: null,
      daysUntilTrialEnd: null,
      hasStripeCustomer: false
    };
  }

  // Billing disabled in this environment? Treat every signed-in org as
  // a paying customer so the trial banner / paywall disappear entirely.
  if (!billingEnabled()) {
    return {
      status: "paid",
      plan: "agency", // pick the highest tier so plan-limit checks pass
      trialEndsAt: null,
      daysUntilTrialEnd: null,
      hasStripeCustomer: false
    };
  }
  const db = getDb();
  const org = (await db.organization.findUnique({
    where: { id: auth.orgId },
    select: {
      plan: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true
    }
  })) as {
    plan: string;
    trialEndsAt: Date | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;

  if (!org) {
    return {
      status: "no_org",
      plan: "trial",
      trialEndsAt: null,
      daysUntilTrialEnd: null,
      hasStripeCustomer: false
    };
  }

  const now = Date.now();
  const trialEndsAt = org.trialEndsAt;
  const daysUntilTrialEnd = trialEndsAt
    ? Math.ceil((trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000))
    : null;

  // Paid: an active subscription id exists.
  if (org.stripeSubscriptionId && org.plan !== "trial") {
    return {
      status: "paid",
      plan: org.plan,
      trialEndsAt,
      daysUntilTrialEnd,
      hasStripeCustomer: !!org.stripeCustomerId
    };
  }

  // Trial — check expiry.
  if (trialEndsAt && trialEndsAt.getTime() < now) {
    return {
      status: "trial_expired",
      plan: "trial",
      trialEndsAt,
      daysUntilTrialEnd: 0,
      hasStripeCustomer: !!org.stripeCustomerId
    };
  }

  return {
    status: "trial_active",
    plan: "trial",
    trialEndsAt,
    daysUntilTrialEnd,
    hasStripeCustomer: !!org.stripeCustomerId
  };
}
