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
        // Deterministic order so the "default" active org (memberships[0],
        // used when no active_org_id cookie is set) is stable across requests
        // for a multi-org user — otherwise which brand's data they see could
        // flip request to request. Most-recently-created org wins.
        orderBy: { org: { createdAt: "desc" } },
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
    // Not yet provisioned. This happens when the session was created
    // without passing through /api/auth/callback — e.g. password sign-in
    // (signInWithPassword sets the session client-side) or a cookie
    // carried over from another domain. Without a User row every API
    // route that checks auth.userId returns 401 "Unauthorized", so
    // lazy-provision right here. ensureUserProvisioned is idempotent.
    try {
      const provisioned = await ensureUserProvisioned({
        id: user.id,
        email: user.email
      });
      return {
        authUserId: user.id,
        email: user.email ?? null,
        userId: provisioned.userId,
        locale: "he",
        orgId: provisioned.orgId,
        role: "owner",
        storeId: null
      };
    } catch {
      // Provisioning failed (e.g. read-only DB) — fall back to the
      // auth-identity-only context rather than breaking the request.
      return {
        ...blank,
        authUserId: user.id,
        email: user.email ?? null
      };
    }
  }

  const jar = await cookies();
  const cookieOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const cookieStoreId = jar.get(ACTIVE_STORE_COOKIE)?.value ?? null;

  // Pick the active org. Priority:
  //   1. the active_org_id cookie, if it names an org the user belongs to
  //   2. otherwise the first membership whose org actually HAS a store
  //   3. otherwise the first membership (deterministic — memberships are
  //      ordered most-recently-created-org first)
  //
  // Step 2 is what keeps an invited teammate out of the "connect a store"
  // trap: every signup auto-creates an empty personal org, so a member
  // invited into someone else's (populated) org would otherwise default
  // into their own empty one and be shown onboarding. Preferring an org
  // with stores lands them where the data is.
  const memberships = dbUser.memberships;
  const cookieMembership = cookieOrgId
    ? memberships.find((m) => m.orgId === cookieOrgId)
    : undefined;
  const membershipWithStores = memberships.find((m) => m.org.stores.length > 0);
  const activeMembership = cookieMembership ?? membershipWithStores ?? memberships[0] ?? null;

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

export interface UserOrgOption {
  orgId: string;
  name: string;
  storeCount: number;
  role: string;
  isActive: boolean;
}

/**
 * Every organization the current user belongs to, for the org switcher.
 * Marks which one is currently active. Returns [] for anonymous users.
 */
export async function listUserOrgsForSwitcher(): Promise<UserOrgOption[]> {
  const auth = await getAuthContext().catch(() => null);
  if (!auth?.userId) return [];
  const db = getDb();
  const user = (await db.user.findUnique({
    where: { id: auth.userId },
    select: {
      memberships: {
        orderBy: { org: { createdAt: "desc" } },
        select: {
          role: true,
          org: {
            select: { id: true, name: true, _count: { select: { stores: true } } }
          }
        }
      }
    }
  })) as {
    memberships: Array<{
      role: string;
      org: { id: string; name: string; _count: { stores: number } };
    }>;
  } | null;
  if (!user) return [];
  return user.memberships.map((m) => ({
    orgId: m.org.id,
    name: m.org.name,
    storeCount: m.org._count.stores,
    role: m.role,
    isActive: m.org.id === auth.orgId
  }));
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
