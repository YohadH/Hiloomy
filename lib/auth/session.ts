// Higher-level helpers for "who is the current user, which org are they
// in, which store are they viewing?" — wraps Supabase Auth + our User /
// Membership / Store tables into a single authenticated context.
//
// Pages, services, and route handlers should call `getAuthContext()`
// rather than touching Supabase directly. This keeps the "active org"
// resolution in one place and makes it easy to test.

import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";
import { getDb } from "@/lib/server/db";

export const ACTIVE_ORG_COOKIE = "active_org_id";
export const ACTIVE_STORE_COOKIE = "active_store_id";

// ── Local-QA auth bypass ────────────────────────────────────────────────
// Triple-locked escape hatch for LOCAL automated browser testing
// (Playwright screenshots/E2E), because Supabase-hosted email confirmation
// can't be completed headlessly:
//   1. NODE_ENV must NOT be "production"
//   2. DEV_QA_BYPASS_TOKEN must be set in the environment (never set on Render)
//   3. the gg_qa_bypass cookie must equal that token exactly
// When all three hold, the request authenticates as the synthetic QA user
// below. That user must still exist in our User table with a Membership
// (provisioned by the QA setup script) for org/store data to resolve —
// the bypass skips Supabase, not the app's own authorization model.
export const QA_BYPASS_COOKIE = "gg_qa_bypass";
export const QA_BYPASS_AUTH_USER = { id: "qa-bypass-user", email: "qa-bot@local.dev" };

async function getDevBypassUser(): Promise<{ id: string; email?: string } | null> {
  if (process.env.NODE_ENV === "production") return null;
  const token = process.env.DEV_QA_BYPASS_TOKEN?.trim();
  if (!token) return null;
  try {
    const jar = await cookies();
    if (jar.get(QA_BYPASS_COOKIE)?.value === token) return QA_BYPASS_AUTH_USER;
  } catch {
    // outside a request scope — no bypass
  }
  return null;
}

export interface AuthContext {
  // Auth user from Supabase. Null when not signed in.
  authUserId: string | null;
  email: string | null;
  // Our User row (lazy-created on first sign-in by ensureUserProvisioned).
  userId: string | null;
  locale: "he" | "en";
  // The org this request operates on. Resolved by:
  //   1. active_org_id cookie if it points to an org the user belongs to
  //   2. otherwise the user's most-recently-created org
  //   3. null when the user has no orgs yet (fresh signup → onboarding)
  orgId: string | null;
  role: "owner" | "admin" | "member" | null;
  // The store within the active org. Same fallback chain as orgId.
  storeId: string | null;
}

/**
 * Resolve the full auth context for the current request. Cheap — runs
 * once per request, results aren't cached so always fresh.
 */
export async function getAuthContext(): Promise<AuthContext> {
  let user: { id: string; email?: string } | null = await getDevBypassUser();
  if (!user) {
    const supabase = await createServerSupabaseClient();
    user = (await supabase.auth.getUser()).data.user;
  }

  const blank: AuthContext = {
    authUserId: null,
    email: null,
    userId: null,
    locale: "he",
    orgId: null,
    role: null,
    storeId: null
  };
  if (!user) return blank;

  const db = getDb();

  // Our User row — joined to memberships + their orgs + stores.
  const dbUser = (await db.user.findUnique({
    where: { authUserId: user.id },
    select: {
      id: true,
      locale: true,
      memberships: {
        select: {
          orgId: true,
          role: true,
          org: { select: { stores: { select: { id: true } } } }
        }
      }
    }
  })) as {
    id: string;
    locale: string;
    memberships: Array<{
      orgId: string;
      role: string;
      org: { stores: Array<{ id: string }> };
    }>;
  } | null;

  if (!dbUser) {
    // Not yet provisioned. ensureUserProvisioned() will run on the next
    // authenticated route; for now we hand back the auth identity only.
    return {
      ...blank,
      authUserId: user.id,
      email: user.email ?? null
    };
  }

  const jar = await cookies();
  const cookieOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const cookieStoreId = jar.get(ACTIVE_STORE_COOKIE)?.value ?? null;

  // Pick the active org: cookie if valid, otherwise the user's first.
  const memberships = dbUser.memberships;
  const cookieMembership = cookieOrgId
    ? memberships.find((m) => m.orgId === cookieOrgId)
    : undefined;
  const activeMembership = cookieMembership ?? memberships[0] ?? null;

  // Pick the active store within the active org: cookie if valid,
  // otherwise the first store in the org.
  let activeStoreId: string | null = null;
  if (activeMembership) {
    const orgStoreIds = activeMembership.org.stores.map((s) => s.id);
    if (cookieStoreId && orgStoreIds.includes(cookieStoreId)) {
      activeStoreId = cookieStoreId;
    } else {
      activeStoreId = orgStoreIds[0] ?? null;
    }
  }

  return {
    authUserId: user.id,
    email: user.email ?? null,
    userId: dbUser.id,
    locale: (dbUser.locale === "en" ? "en" : "he") as "he" | "en",
    orgId: activeMembership?.orgId ?? null,
    role: (activeMembership?.role as "owner" | "admin" | "member" | null) ?? null,
    storeId: activeStoreId
  };
}

/**
 * Create our `User` + a default `Organization` + `Membership` on first
 * sign-in. Idempotent — safe to call on every authenticated request,
 * but middleware-/route-only since it writes.
 */
export async function ensureUserProvisioned(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<{ userId: string; orgId: string }> {
  const db = getDb();
  const existing = (await db.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true, memberships: { select: { orgId: true }, take: 1 } }
  })) as { id: string; memberships: Array<{ orgId: string }> } | null;

  if (existing) {
    const orgId =
      existing.memberships[0]?.orgId ??
      (await createDefaultOrgFor(existing.id, authUser.email ?? "user"));
    return { userId: existing.id, orgId };
  }

  // Create User
  const user = (await db.user.create({
    data: {
      authUserId: authUser.id,
      email: authUser.email ?? `${authUser.id}@no-email.local`,
      displayName:
        (authUser.user_metadata?.["display_name"] as string | undefined) ?? null,
      lastSignInAt: new Date()
    },
    select: { id: true }
  })) as { id: string };

  const orgId = await createDefaultOrgFor(user.id, authUser.email ?? "user");
  return { userId: user.id, orgId };
}

async function createDefaultOrgFor(userId: string, emailHint: string): Promise<string> {
  const db = getDb();
  const baseName = emailHint.split("@")[0].slice(0, 24) || "brand";
  const slugCandidate = `${baseName}-${Math.random().toString(36).slice(2, 8)}`;
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const org = (await db.organization.create({
    data: {
      name: `${baseName}'s Brands`,
      slug: slugCandidate,
      plan: "trial",
      trialEndsAt,
      currency: "ILS",
      locale: "he"
    },
    select: { id: true }
  })) as { id: string };

  await db.membership.create({
    data: { userId, orgId: org.id, role: "owner" }
  });

  return org.id;
}
