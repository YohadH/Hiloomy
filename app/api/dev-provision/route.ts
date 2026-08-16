import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/auth/supabase-server";
import { ensureUserProvisioned } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";

// TEMPORARY local-dev helper — delete after use.
//
// Password sign-in never hits /api/auth/callback, so on a fresh local DB the
// User/Organization rows are never provisioned and the app shows the
// "connect your first brand" onboarding instead of the dashboard. Visiting
// this route (while signed in) provisions the current Supabase user and
// links any org-less stores to their org.

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not signed in — log in at /signin first, then revisit this URL." },
      { status: 401 }
    );
  }

  const { userId, orgId } = await ensureUserProvisioned({
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata as Record<string, unknown> | undefined
  });

  const db = getDb();
  const linked = await db.store.updateMany({
    where: { orgId: null },
    data: { orgId }
  });
  const stores = await db.store.findMany({
    where: { orgId },
    select: { name: true, domain: true }
  });

  return NextResponse.json({
    ok: true,
    email: user.email,
    userId,
    orgId,
    storesLinkedNow: linked.count,
    storesInYourOrg: stores,
    next: "Open http://localhost:3000 — the dashboard should now show your data."
  });
}
