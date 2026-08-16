// Plan-limit enforcement. Call `assertPlanAllowsAction()` before any
// action that consumes a billable quota (connecting a brand, inviting
// a teammate). Throws AppError 402 ("Payment required" — semantically
// "your plan doesn't allow this") which the UI catches and shows an
// "Upgrade" CTA.
//
// Limits map cleanly to plan tiers. The trial behaves like Starter.
// When BILLING_ENABLED=false, getSubscriptionStatus returns "agency"
// for every org, so all limits become the highest tier — effectively
// disabling enforcement during pre-billing development.

import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { PLANS, TRIAL_LIMITS } from "./plans";
import { getSubscriptionStatus } from "./subscription-status";

export type ActionType = "connect_brand" | "invite_teammate";

function getLimits(plan: string) {
  if (plan === "starter") return PLANS.starter.limits;
  if (plan === "growth") return PLANS.growth.limits;
  if (plan === "agency") return PLANS.agency.limits;
  return TRIAL_LIMITS;
}

export async function assertPlanAllowsAction(
  orgId: string,
  action: ActionType
): Promise<void> {
  const sub = await getSubscriptionStatus();
  const limits = getLimits(sub.plan);
  const db = getDb();

  if (action === "connect_brand") {
    const brandCount = (await db.store.count({
      where: { orgId, connected: true }
    })) as number;
    if (brandCount >= limits.maxBrands) {
      throw new AppError(
        `Your ${sub.plan} plan supports ${limits.maxBrands} brand${limits.maxBrands === 1 ? "" : "s"}. Upgrade to add more.`,
        402
      );
    }
  } else if (action === "invite_teammate") {
    const [memberCount, inviteCount] = await Promise.all([
      db.membership.count({ where: { orgId } }) as Promise<number>,
      db.invitation.count({ where: { orgId } }) as Promise<number>
    ]);
    const total = memberCount + inviteCount;
    if (total >= limits.maxTeammates) {
      throw new AppError(
        `Your ${sub.plan} plan supports ${limits.maxTeammates} teammate${limits.maxTeammates === 1 ? "" : "s"}. Upgrade to invite more.`,
        402
      );
    }
  }
}
