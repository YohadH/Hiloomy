import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe-client";
import { getDb } from "@/lib/server/db";
import { billingEnabled } from "@/lib/billing/billing-flag";
import { sendTransactionalEmail } from "@/lib/email/email-client";
import {
  subscriptionStartedEmail,
  subscriptionCanceledEmail
} from "@/lib/email/templates";
import { PLANS } from "@/lib/billing/plans";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import type Stripe from "stripe";

// Stripe webhook handler.
//
// Stripe sends signed events to this endpoint when subscription state
// changes. We verify the signature, then update the matching Org row:
//
//   - checkout.session.completed       → set plan + subscription id
//   - customer.subscription.created    → keep plan in sync (covers subs
//                                        created via API/Dashboard, not
//                                        only via our Checkout flow)
//   - customer.subscription.updated    → keep plan in sync (upgrade/downgrade)
//   - customer.subscription.deleted    → revert org to "trial" (frozen)
//   - invoice.payment_failed           → leave plan as-is; the customer
//                                        portal will prompt them. We may
//                                        flag the org for an email later.
//
// Add the webhook in Stripe Dashboard → Developers → Webhooks:
//   URL: https://shopifyappanalytics.onrender.com/api/billing/webhook
//   Events:
//     - checkout.session.completed
//     - customer.subscription.created
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_failed
// Copy the "Signing secret" → STRIPE_WEBHOOK_SECRET env var.

export const dynamic = "force-dynamic";

// Send a "you're now a paying customer" email to whichever Membership
// row holds the owner role on the org tied to this Stripe customer.
async function notifyOrgOwnerSubscriptionStarted(
  customerId: string,
  plan: "starter" | "growth" | "agency"
) {
  const db = getDb();
  const owner = (await db.membership.findFirst({
    where: {
      role: "owner",
      org: { stripeCustomerId: customerId }
    },
    select: {
      user: { select: { id: true, email: true, displayName: true, locale: true } },
      org: { select: { id: true } }
    }
  })) as {
    user: { id: string; email: string; displayName: string | null; locale: string };
    org: { id: string };
  } | null;
  if (!owner?.user?.email) return;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const locale = owner.user.locale === "en" ? "en" : "he";
  const planName = PLANS[plan].name[locale];
  const template = subscriptionStartedEmail({
    displayName: owner.user.displayName,
    planName,
    appUrl,
    locale: locale as "he" | "en"
  });
  await sendTransactionalEmail({
    to: owner.user.email,
    subject: template.subject,
    html: template.html
  });
  await recordAuditEvent({
    orgId: owner.org.id,
    actorUserId: null, // Stripe webhook is the actor
    eventType: "billing.subscription_started",
    description: `Subscription started on ${plan} plan`,
    targetType: "subscription",
    targetId: customerId
  });
}

async function notifyOrgOwnerSubscriptionCanceled(customerId: string) {
  const db = getDb();
  const owner = (await db.membership.findFirst({
    where: {
      role: "owner",
      org: { stripeCustomerId: customerId }
    },
    select: {
      user: { select: { email: true, displayName: true, locale: true } },
      org: { select: { id: true } }
    }
  })) as {
    user: { email: string; displayName: string | null; locale: string };
    org: { id: string };
  } | null;
  if (!owner?.user?.email) return;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const locale = owner.user.locale === "en" ? "en" : "he";
  const template = subscriptionCanceledEmail({
    displayName: owner.user.displayName,
    appUrl,
    locale: locale as "he" | "en"
  });
  await sendTransactionalEmail({
    to: owner.user.email,
    subject: template.subject,
    html: template.html
  });
  await recordAuditEvent({
    orgId: owner.org.id,
    actorUserId: null,
    eventType: "billing.subscription_canceled",
    description: "Subscription canceled",
    targetType: "subscription",
    targetId: customerId
  });
}

function priceIdToPlan(priceId: string): "starter" | "growth" | "agency" | null {
  // Match against any configured price id env var. This avoids hardcoding
  // mappings — anyone can rotate prices without code changes.
  const variants = ["STARTER", "GROWTH", "AGENCY"] as const;
  for (const plan of variants) {
    for (const ccy of ["ILS", "USD"]) {
      for (const intv of ["MONTHLY", "ANNUAL"]) {
        if (process.env[`STRIPE_PRICE_${plan}_${ccy}_${intv}`] === priceId) {
          return plan.toLowerCase() as "starter" | "growth" | "agency";
        }
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  // If billing is disabled, accept the webhook silently so Stripe's
  // retry mechanism doesn't queue up — but don't try to verify the
  // signature (we may not have STRIPE_WEBHOOK_SECRET configured).
  if (!billingEnabled()) {
    return NextResponse.json({ received: true, billingDisabled: true });
  }
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json(
      { ok: false, error: "Missing signature or webhook secret." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  const db = getDb();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!customerId) break;

        // Pull plan from the subscription's first price item.
        let plan: "starter" | "growth" | "agency" | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          if (priceId) plan = priceIdToPlan(priceId);
        }

        await db.organization.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: plan ?? "starter",
            stripeSubscriptionId: subscriptionId ?? undefined
          }
        });
        // Fire welcome-to-paid email to the org's owner.
        await notifyOrgOwnerSubscriptionStarted(customerId, plan ?? "starter");
        break;
      }

      // `created` and `updated` are handled identically: read the plan off
      // the subscription's first price and sync it onto the matching org.
      // Handling `created` (not only checkout.session.completed) covers
      // subscriptions created directly via the Stripe API or Dashboard,
      // and is resilient to webhook delivery ordering. The org row already
      // carries stripeCustomerId (set by the checkout route before the
      // Stripe Customer is used), so updateMany matches by customer id.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = priceId ? priceIdToPlan(priceId) : null;
        if (!plan) break;
        await db.organization.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan,
            stripeSubscriptionId: sub.id
          }
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await db.organization.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "trial", stripeSubscriptionId: null }
        });
        await notifyOrgOwnerSubscriptionCanceled(customerId);
        break;
      }

      case "invoice.payment_failed": {
        // Stripe Customer Portal handles the retry / update-card UX.
        // We could mark the org with a `billing_failed_at` field and
        // surface a banner in the UI. Deferred — out of scope for v1.
        const inv = event.data.object as Stripe.Invoice;
        console.warn(`[stripe webhook] payment failed for customer ${inv.customer}`);
        break;
      }

      default:
        // No-op for events we don't handle.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    // Return 500 so Stripe retries — but be careful: a buggy handler
    // can create a retry storm. Monitor failures via Stripe's webhook
    // dashboard.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
