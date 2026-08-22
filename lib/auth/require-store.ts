import { getAuthContext } from "@/lib/auth/session";

// Multi-tenant store guard for integration routes.
//
// THE RULE: every integration connect/status/sync route operates on the
// SESSION's active store, never on a client-supplied storeId. A storeId
// in the query/body is accepted only as a consistency check — if it names
// any other store, the request is rejected, not honored.
//
// Returns the session's storeId, or null when there is no authenticated
// session store or the requested id mismatches it.
export async function requireSessionStoreId(
  requestedStoreId?: string | null
): Promise<{ userId: string; storeId: string } | null> {
  const auth = await getAuthContext();
  if (!auth.userId || !auth.storeId) return null;
  const requested = requestedStoreId?.trim();
  if (requested && requested !== auth.storeId) return null;
  return { userId: auth.userId, storeId: auth.storeId };
}
