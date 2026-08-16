// Determines whether the signed-in user is "fresh" (no brands connected
// yet) and should see the onboarding wizard instead of an empty dashboard.
//
// Returns:
//   - needsOnboarding: true → no Store in the user's active org has been
//     connected (no `connected: true` row). Wizard takes over.
//   - needsOnboarding: false → at least one connected store; render the
//     normal Command Center.
//
// "Connected" means Shopify OAuth succeeded AND we have a ShopifyConnection
// row. Stores that exist in the DB but have no token are mid-install and
// counted as "not yet connected" — better UX to keep them in the wizard
// until the OAuth completes.

import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";

export interface OnboardingStatus {
  needsOnboarding: boolean;
  brandCount: number;
  connectedBrandCount: number;
  // Most recent Store created — used to seed the wizard's "your shop"
  // hint when a half-installed store exists.
  pendingShopDomain: string | null;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const auth = await getAuthContext();
  if (!auth.orgId) {
    return { needsOnboarding: true, brandCount: 0, connectedBrandCount: 0, pendingShopDomain: null };
  }
  const db = getDb();
  const stores = (await db.store.findMany({
    where: { orgId: auth.orgId },
    select: { id: true, domain: true, connected: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }
  })) as Array<{ id: string; domain: string; connected: boolean; updatedAt: Date }>;

  const connectedCount = stores.filter((s) => s.connected).length;
  return {
    needsOnboarding: connectedCount === 0,
    brandCount: stores.length,
    connectedBrandCount: connectedCount,
    pendingShopDomain: stores.find((s) => !s.connected)?.domain ?? null
  };
}
