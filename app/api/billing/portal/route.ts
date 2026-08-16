import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe-client";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { billingEnabled } from "@/lib/billing/billing-flag";

// POST /api/billing/portal
//
// Creates a Stripe Customer Portal session and returns the URL.
// The portal lets the user update payment method, switch plans, cancel,
// see invoices — all hosted by Stripe, no code on our side.

export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  try {
    if (!billingEnabled()) {
      throw new AppError("Billing is disabled in this environment.", 503);
    }
    const { orgId } = await requireOrgAdmin();
    const db = getDb();
    const org = (await db.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true }
    })) as { stripeCustomerId: string | null } | null;
    if (!org?.stripeCustomerId) {
      throw new AppError(
        "Organization has no Stripe customer yet. Start a checkout first.",
        400
      );
    }
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/billing`
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
