// Route-level authorization guards.
//
// Any API route or server action that accepts a `storeId` (or operates on
// data scoped to one) MUST call `assertStoreInActiveOrg(storeId)` first.
// This prevents the trivial multi-tenant data leak where Tenant A passes
// Tenant B's storeId in a request body and gets B's data back.
//
// The guard throws an AppError with status 403 — the caller can let it
// bubble to the standard error response.

import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { getAuthContext } from "./session";

/**
 * Throws 403 if the caller is not authenticated, OR if the storeId
 * given doesn't belong to the caller's active org.
 *
 * Returns the resolved orgId on success (handy for downstream queries
 * that also want to filter by org).
 */
export async function assertStoreInActiveOrg(storeId: string): Promise<{ orgId: string; role: string }> {
  const auth = await getAuthContext();
  if (!auth.userId) {
    throw new AppError("Authentication required.", 401);
  }
  if (!auth.orgId) {
    throw new AppError("No active organization for this user.", 403);
  }
  const db = getDb();
  const store = (await db.store.findUnique({
    where: { id: storeId },
    select: { orgId: true }
  })) as { orgId: string | null } | null;
  if (!store) {
    throw new AppError("Store not found.", 404);
  }
  if (store.orgId !== auth.orgId) {
    throw new AppError("You don't have access to this store.", 403);
  }
  return { orgId: auth.orgId, role: auth.role ?? "member" };
}

/**
 * Authenticated-only variant — for routes that don't operate on a
 * specific store (e.g. account settings, billing). Throws if anonymous.
 */
export async function requireAuth(): Promise<{
  userId: string;
  orgId: string | null;
  role: string | null;
}> {
  const auth = await getAuthContext();
  if (!auth.userId) {
    throw new AppError("Authentication required.", 401);
  }
  return { userId: auth.userId, orgId: auth.orgId, role: auth.role };
}

/**
 * Owner-or-admin guard — for org-management actions (invite, change plan,
 * delete brand, etc).
 */
export async function requireOrgAdmin(): Promise<{ orgId: string; userId: string }> {
  const auth = await getAuthContext();
  if (!auth.userId) throw new AppError("Authentication required.", 401);
  if (!auth.orgId) throw new AppError("No active organization.", 403);
  if (auth.role !== "owner" && auth.role !== "admin") {
    throw new AppError("This action requires admin permission.", 403);
  }
  return { orgId: auth.orgId, userId: auth.userId };
}
