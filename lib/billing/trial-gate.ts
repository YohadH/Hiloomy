// Trial-expiry paywall guard, callable from any server component.
//
// Middleware can't import Prisma (not edge-compatible), so the paywall
// check happens inside AppShell (or any page that wants to enforce it).
// Pages that should NOT trigger paywall (e.g. /billing itself, account
// settings, signout) pass `allowList: true` or simply don't call this.

import { redirect } from "next/navigation";
import { getSubscriptionStatus } from "./subscription-status";

const PAYWALL_EXEMPT_PATHS = new Set([
  "/billing",
  "/trial-expired",
  "/settings/account",
  "/settings/organization"
]);

export async function gateTrialAccess(currentPath: string): Promise<void> {
  if (PAYWALL_EXEMPT_PATHS.has(currentPath)) return;
  if (currentPath.startsWith("/api/")) return;
  const sub = await getSubscriptionStatus();
  if (sub.status === "trial_expired") {
    redirect("/trial-expired" as never);
  }
}
