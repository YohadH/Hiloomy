// Admin-managed store onboarding (design partners / multi-brand) — the
// 2026 custom-distribution OAuth model. The operator registers a store's
// own Shopify app credentials + the target org up front; the OAuth
// install/callback (shopify-oauth-service) then resolves those creds by
// shopDomain and binds the connected store to the target org.
//
// Two modes:
//   partner → create a fresh ISOLATED org for the partner + invite them as
//             its owner. Their store lands there; they never see other
//             brands and other brands never see theirs.
//   own     → the store lands in the operator's OWN active org (multiple
//             brands under one account).

import crypto from "node:crypto";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret } from "@/lib/security/encryption";
import { getAuthContext } from "@/lib/auth/session";
import { normalizeOauthShopDomain } from "@/lib/services/shopify-oauth-service";

function appBaseUrl(): string {
  return (process.env.APP_URL?.trim() || "https://www.hiloomy.com").replace(/\/$/, "");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 24) || "brand"
  );
}

export type StoreOnboardingMode = "partner" | "own";

export interface RegisterStoreOnboardingInput {
  brandName: string;
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  mode: StoreOnboardingMode;
  partnerEmail?: string;
}

export interface StoreOnboardingResult {
  onboardingId: string;
  brandName: string;
  shopDomain: string;
  targetOrgId: string;
  mode: StoreOnboardingMode;
  // Send this to whoever will install the app on the store (the partner, or
  // the operator opens it for their own store).
  installUrl: string;
  // Partner mode only: the accept-invite link that makes them owner of the
  // new org. Null for own-store mode.
  inviteUrl: string | null;
  loginUrl: string;
  status: string;
}

export async function registerStoreOnboarding(
  input: RegisterStoreOnboardingInput
): Promise<StoreOnboardingResult> {
  const auth = await getAuthContext();
  if (!auth.userId) throw new AppError("Sign in to add a store.", 401);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.storeOnboarding) {
    throw new AppError(
      "Store-onboarding table is missing. Apply prisma/migrations/20260830_store_onboarding.",
      500
    );
  }

  const brandName = String(input.brandName ?? "").trim().slice(0, 120);
  const shopDomain = normalizeOauthShopDomain(input.shopDomain);
  const clientId = String(input.clientId ?? "").trim();
  const clientSecret = String(input.clientSecret ?? "").trim();
  if (!brandName) throw new AppError("Brand name is required.", 400);
  if (!clientId || !clientSecret) {
    throw new AppError("The app's Client ID and Client Secret are both required.", 400);
  }

  // Refuse to overwrite a store that already belongs to a DIFFERENT org via
  // an existing connection — re-registering a live store could reparent it.
  const existingStore = await db.store.findUnique({
    where: { domain: shopDomain },
    select: { orgId: true, connected: true }
  });

  let targetOrgId: string;
  let invitedEmail: string | null = null;
  let inviteToken: string | null = null;

  if (input.mode === "partner") {
    const email = String(input.partnerEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("A valid partner email is required.", 400);
    }
    invitedEmail = email;

    // Fresh isolated org for the partner. Not tied to the operator — the
    // partner becomes its owner via the invitation below.
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    const slug = `${slugify(brandName)}-${crypto.randomBytes(3).toString("hex")}`;
    const org = (await db.organization.create({
      data: {
        name: brandName,
        slug,
        plan: "trial",
        trialEndsAt,
        currency: "ILS",
        locale: "he"
      },
      select: { id: true }
    })) as { id: string };
    targetOrgId = org.id;

    // Invite the partner as OWNER of their new org. Rotate any prior invite.
    await db.invitation.deleteMany({ where: { orgId: targetOrgId, email } });
    inviteToken = crypto.randomBytes(24).toString("hex");
    const inviteExpires = new Date();
    inviteExpires.setDate(inviteExpires.getDate() + 14);
    await db.invitation.create({
      data: {
        orgId: targetOrgId,
        email,
        role: "owner",
        invitedById: auth.userId,
        token: inviteToken,
        expiresAt: inviteExpires
      }
    });
  } else {
    // Own store → the operator's active org.
    if (!auth.orgId) {
      throw new AppError("No active organization — pick a brand first, then add the store.", 400);
    }
    targetOrgId = auth.orgId;
    // Guard: never point an own-store onboarding at a store that already
    // belongs to a different org.
    if (existingStore?.orgId && existingStore.orgId !== targetOrgId) {
      throw new AppError(
        "That store is already connected to a different organization.",
        409
      );
    }
  }

  const encrypted = encryptSecret(clientSecret);
  const row = (await db.storeOnboarding.upsert({
    where: { shopDomain },
    update: {
      appClientId: clientId,
      appClientSecretEnc: encrypted,
      targetOrgId,
      invitedEmail,
      createdByUserId: auth.userId,
      status: "pending"
    },
    create: {
      shopDomain,
      appClientId: clientId,
      appClientSecretEnc: encrypted,
      targetOrgId,
      invitedEmail,
      createdByUserId: auth.userId,
      status: "pending"
    },
    select: { id: true, status: true }
  })) as { id: string; status: string };

  const base = appBaseUrl();
  return {
    onboardingId: row.id,
    brandName,
    shopDomain,
    targetOrgId,
    mode: input.mode,
    installUrl: `${base}/api/shopify/oauth/install?shop=${encodeURIComponent(shopDomain)}`,
    inviteUrl: inviteToken ? `${base}/accept-invite?token=${inviteToken}` : null,
    loginUrl: `${base}/login`,
    status: row.status
  };
}

export interface StoreOnboardingListItem {
  id: string;
  shopDomain: string;
  targetOrgName: string;
  invitedEmail: string | null;
  status: string;
  createdAt: string;
}

/** Onboardings the current operator set up, newest first. */
export async function listStoreOnboardings(): Promise<StoreOnboardingListItem[]> {
  const auth = await getAuthContext().catch(() => null);
  if (!auth?.userId) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  if (!db?.storeOnboarding) return [];
  const rows = (await db.storeOnboarding.findMany({
    where: { createdByUserId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      shopDomain: true,
      invitedEmail: true,
      status: true,
      createdAt: true,
      targetOrg: { select: { name: true } }
    }
  })) as Array<{
    id: string;
    shopDomain: string;
    invitedEmail: string | null;
    status: string;
    createdAt: Date;
    targetOrg: { name: string } | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    shopDomain: r.shopDomain,
    targetOrgName: r.targetOrg?.name ?? "—",
    invitedEmail: r.invitedEmail,
    status: r.status,
    createdAt: r.createdAt.toISOString()
  }));
}
