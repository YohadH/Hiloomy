import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe-client";
import { getStripePriceId, type PlanId, type Currency } from "@/lib/billing/plans";
import { requireOrgAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { billingEnabled } from "@/lib/billing/billing-flag";

// POST /api/billing/checkout
// body: { planId: "starter" | "growth" | "agency", interval: "monthly" | "annual" }
//
// Creates a Stripe Checkout session for the active org and returns the
// hosted-page URL. Caller redirects browser to it.
//
// Creates the Stripe Customer on first use and stores its ID on the Org.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!billingEnabled()) {
      throw new AppError("Billing is disabled in this environment.", 503);
    }
    const { orgId, userId } = await requireOrgAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      planId?: string;
      interval?: string;
    };
    const planId = (body.planId ?? "") as PlanId;
    const interval = (body.interval === "annual" ? "annual" : "monthly") as "monthly" | "annual";
    if (planId !== "starter" && planId !== "growth" && planId !== "agency") {
      throw new AppError("Invalid plan.", 400);
    }

    const db = getDb();
    const org = (await db.organization.findUnique({
      where: { id: orgId },
      select: {
        currency: true,
        stripeCustomerId: true,
        name: true
      }
    })) as { currency: string; stripeCustomerId: string | null; name: string } | null;
    if (!org) throw new AppError("Organization not found.", 404);

    const user = (await db.user.findUnique({
      where: { id: userId },
      select: { email: true }
    })) as { email: string } | null;
    if (!user) throw new AppError("User not found.", 404);

    const currency: Currency = org.currency === "USD" ? "USD" : "ILS";
    const priceId = getStripePriceId(planId, currency, interval);
    if (!priceId) {
      throw new AppError(
        `No Stripe price configured for ${planId}/${currency}/${interval}. Set STRIPE_PRICE_${planId.toUpperCase()}_${currency}_${interval.toUpperCase()} in Render env.`,
        500
      );
    }

    const stripe = getStripe();

    // First-time billing for this org → create a Stripe Customer + persist its id.
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { orgId, userId }
      });
      customerId = customer.id;
      await db.organization.update({
        where: { id: orgId },
        data: { stripeCustomerId: customerId }
      });
    }

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Stripe Tax handles VAT (IL 17%, EU per-country, etc.). Requires
      // billing_address_collection so the customer enters their country.
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      // Trial extension: only days remaining on the org's current trial,
      // so users who pay during trial don't get charged immediately.
      subscription_data: {
        metadata: { orgId },
        trial_period_days: 14
      },
      success_url: `${appUrl}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?status=canceled`
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
