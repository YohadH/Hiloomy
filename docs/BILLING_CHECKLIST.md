# Billing Go-Live Checklist (`BILLING_ENABLED=true`)

This is the operator checklist for turning on Stripe billing in
ShopifyAppAnalytics. Until every box here is checked, keep
`BILLING_ENABLED` **unset/false** — the app then treats every signed-in org
as a paying "agency"-tier customer and all Stripe code paths no-op safely.

Task ref: **SA-HIGH-09** — verify the Stripe webhook handler end-to-end and
document what's needed to flip the flag.

---

## 0. What "billing off" does today (baseline)

`lib/billing/billing-flag.ts` → `billingEnabled()` reads `BILLING_ENABLED`
(truthy = `1` / `true` / `yes` / `on`; default OFF). While OFF:

- `getSubscriptionStatus()` returns `status: "paid"`, `plan: "agency"` for
  every authenticated org → no paywall, all plan-limit checks pass
  (`lib/billing/subscription-status.ts`, `lib/billing/plan-limits.ts`).
- `/api/billing/checkout` and `/api/billing/portal` return `503 "Billing is
  disabled in this environment."`.
- `/api/billing/webhook` returns `200 { received: true, billingDisabled: true }`
  WITHOUT verifying the signature — so an accidentally-configured Stripe
  endpoint won't error or retry-storm while you're still setting things up.

Implication: flipping the flag is the LAST step, after Stripe + env + DB are
all ready. Once ON, the webhook starts verifying signatures and mutating org
rows for real.

---

## 1. Required Stripe setup

### 1a. Products + Prices
Create three Products in the Stripe Dashboard (Test mode first), each with the
currencies/intervals you actually sell. The code looks up price IDs by env var
(`lib/billing/plans.ts`, `priceIdToPlan()` in the webhook), so price IDs never
appear in code — you can rotate them freely.

| Plan    | maxBrands | maxTeammates | Display (ILS/mo) | Display (USD/mo) |
|---------|-----------|--------------|------------------|------------------|
| starter | 1         | 1            | 179 (143 annual) | 49 (39 annual)   |
| growth  | 3         | 3            | 549 (439 annual) | 149 (119 annual) |
| agency  | 10        | 10           | 1499 (1199 ann.) | 399 (319 annual) |

Display numbers come from `PLANS[*].display` and are for the picker UI only —
the **amount actually charged is whatever the Stripe Price says**, so set the
Stripe prices to match these (or update `plans.ts` if they diverge).

For each plan create a recurring Price per currency × interval you support:
- `starter` ILS monthly, ILS annual, USD monthly, USD annual
- `growth`  ILS monthly, ILS annual, USD monthly, USD annual
- `agency`  ILS monthly, ILS annual, USD monthly, USD annual

You only need the cells your customers will buy; an unset price returns a clear
500 from checkout ("No Stripe price configured for …") rather than charging the
wrong amount. ILS is the org default (`Organization.currency` default `"ILS"`).

### 1b. Stripe Tax (already wired in checkout)
`app/api/billing/checkout/route.ts` sets `automatic_tax.enabled = true`,
`billing_address_collection: "required"`, and `customer_update.address: "auto"`.
→ Enable **Stripe Tax** in the Dashboard and register the tax origin (IL 17%
VAT, plus any other jurisdictions). Without Stripe Tax enabled, checkout
sessions will error.

### 1c. Webhook endpoint
Dashboard → Developers → Webhooks → Add endpoint:
- **URL:** `https://<your-host>/api/billing/webhook`
  (prod host, e.g. the Render/Vercel service URL or mapped custom domain; must
  match where the app is actually served — same origin as `APP_URL`).
- **Events to send** (the handler switches on exactly these):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copy the endpoint's **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

> Note: the webhook route is in `PUBLIC_PREFIXES` (`middleware.ts`) so it is
> NOT behind auth or the `CRON_SECRET` cron lock. It is authenticated SOLELY by
> the Stripe signature (`stripe.webhooks.constructEvent`). Do not expect
> `CRON_SECRET` to protect it.

### 1d. Customer Portal
Dashboard → Settings → Billing → Customer portal → enable it and configure
which plans customers may switch to / cancel. `/api/billing/portal` creates
portal sessions; plan switches there fire `customer.subscription.updated`,
cancels fire `customer.subscription.deleted` — both handled.

---

## 2. Required env vars

Set these in the production host's env (Render/Vercel) AND mirror the
placeholders into `.env.example` for the next developer. **Never commit real
keys** — `.env.example` was previously sanitized of a leaked secret; keep all
example values empty/placeholder.

| Var | Required | Notes |
|-----|----------|-------|
| `BILLING_ENABLED` | yes (flip LAST) | `true` to turn billing on. Leave unset until 1+3 done. |
| `STRIPE_SECRET_KEY` | yes | `sk_test_…` in staging, `sk_live_…` in prod. Read by `lib/billing/stripe-client.ts`. |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_…` from the endpoint (1c). Without it the webhook 400s "Missing signature or webhook secret." |
| `APP_URL` | yes (already used) | Public origin. Drives checkout success/cancel URLs + email links. Must match the webhook host origin. |
| `STRIPE_PRICE_STARTER_ILS_MONTHLY` | per offering | One per plan × currency × interval you sell. |
| `STRIPE_PRICE_STARTER_ILS_ANNUAL` | per offering | |
| `STRIPE_PRICE_STARTER_USD_MONTHLY` | per offering | |
| `STRIPE_PRICE_STARTER_USD_ANNUAL` | per offering | |
| `STRIPE_PRICE_GROWTH_ILS_MONTHLY` | per offering | |
| `STRIPE_PRICE_GROWTH_ILS_ANNUAL` | per offering | |
| `STRIPE_PRICE_GROWTH_USD_MONTHLY` | per offering | |
| `STRIPE_PRICE_GROWTH_USD_ANNUAL` | per offering | |
| `STRIPE_PRICE_AGENCY_ILS_MONTHLY` | per offering | |
| `STRIPE_PRICE_AGENCY_ILS_ANNUAL` | per offering | |
| `STRIPE_PRICE_AGENCY_USD_MONTHLY` | per offering | |
| `STRIPE_PRICE_AGENCY_USD_ANNUAL` | per offering | |
| `RESEND_API_KEY` | recommended | Subscription-started/canceled emails. Soft-fail: if unset, emails no-op (a warning is logged); billing still works. |
| `REPORT_FROM_EMAIL` | recommended | Verified Resend sender for the above emails. |

Env-var naming format for prices is literal:
`STRIPE_PRICE_<PLAN>_<CURRENCY>_<INTERVAL>` (UPPERCASE), e.g.
`STRIPE_PRICE_GROWTH_USD_MONTHLY`. `priceIdToPlan()` in the webhook reverse-maps
an incoming Stripe price ID back to a plan by scanning all 12 of these vars, so
**the exact same price IDs must be set both here and in `plans.ts`'s lookup**
(they read the same env vars — just don't typo).

---

## 3. Required DB state

The `Organization` model (`prisma/schema.prisma`) already has the columns the
webhook writes — no migration needed:

- `plan` (String, default `"trial"`) — `"trial" | "starter" | "growth" | "agency"`.
- `stripeCustomerId` (String?, `@unique`).
- `stripeSubscriptionId` (String?, `@unique`).
- `trialEndsAt` (DateTime?), `currency` (default `"ILS"`).

Confirm before go-live:
- `npx prisma migrate status` reports the schema is up to date (a baseline
  migration `0_baseline` exists; the live DB was schema-pushed). If you change
  the schema, run the project migrate/`db:push` before flipping the flag.
- The webhook matches orgs by `stripeCustomerId`. That id is set by the
  **checkout route** (`stripe.customers.create` → `Organization.update`)
  BEFORE the Stripe Customer is ever charged, so by the time
  `checkout.session.completed` / `customer.subscription.*` arrive, the org row
  already carries the matching `stripeCustomerId`. → A customer created
  directly in the Stripe Dashboard with NO matching `Organization.stripeCustomerId`
  will be silently ignored by `updateMany` (0 rows updated). Always start paid
  subscriptions via the in-app checkout, or set `stripeCustomerId` on the org
  first.
- Each org that will pay has exactly one `Membership` with `role = "owner"` and
  a `User.email` — that's who receives the subscription-started/canceled email.

---

## 4. Webhook handler behavior (verified — SA-HIGH-09)

`app/api/billing/webhook/route.ts`, event → effect:

| Event | DB effect | Side effect |
|-------|-----------|-------------|
| `checkout.session.completed` | `Organization.plan` ← plan from sub's first price (falls back `"starter"`), `stripeSubscriptionId` ← sub id, matched by `stripeCustomerId` | sends subscription-started email to org owner + audit event `billing.subscription_started` |
| `customer.subscription.created` | same as `updated` (plan + `stripeSubscriptionId` synced from the subscription) | none (avoids a duplicate email when it co-fires with `checkout.session.completed`) |
| `customer.subscription.updated` | `plan` + `stripeSubscriptionId` synced from the subscription's first price; **no-op if price doesn't map to a known plan** | none |
| `customer.subscription.deleted` | `plan` ← `"trial"`, `stripeSubscriptionId` ← `null` | sends subscription-canceled email + audit event `billing.subscription_canceled` |
| `invoice.payment_failed` | none (plan left as-is) | `console.warn` only; customer portal handles retry/update-card |
| any other | no-op | — |

Signature verification: reads the **raw** request body via `request.text()`
(route is `force-dynamic`, App Router does not pre-parse the body) and calls
`stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
Missing signature/secret → `400`; bad signature → `400`; handler throw → `500`
(so Stripe retries). **Correct.**

### Change made under SA-HIGH-09
`customer.subscription.created` was previously NOT handled (fell through to the
default no-op). The task requires it. It is now handled identically to
`customer.subscription.updated` (merged into the same `case` block), which makes
the handler resilient to (a) subscriptions created via the Stripe API/Dashboard
that never fire `checkout.session.completed`, and (b) webhook delivery ordering.
No duplicate "subscription started" email results, because `created` does not
send an email (the checkout-completed path owns that).

---

## 5. Testing steps (Stripe CLI)

Do this in **Test mode** with `BILLING_ENABLED=true` and a `sk_test_…` key
BEFORE going live.

1. Install + log in:
   ```
   stripe login
   ```
2. Forward events to the running app and capture the signing secret:
   ```
   stripe listen --forward-to http://localhost:3000/api/billing/webhook
   ```
   The CLI prints a `whsec_…` — set it as `STRIPE_WEBHOOK_SECRET` for the local
   run (it differs from the Dashboard endpoint's secret).
3. Seed an org with a real `stripeCustomerId` first. Easiest real path: sign in
   to the app, hit "Upgrade" to run `/api/billing/checkout` (this creates the
   Stripe Customer and writes `stripeCustomerId` onto the org), complete the
   test checkout with card `4242 4242 4242 4242`. That alone exercises
   `checkout.session.completed` + `customer.subscription.created` end-to-end.
4. Trigger the remaining events from the CLI:
   ```
   stripe trigger checkout.session.completed
   stripe trigger customer.subscription.created
   stripe trigger customer.subscription.updated
   stripe trigger customer.subscription.deleted
   stripe trigger invoice.payment_failed
   ```
   > Note: bare `stripe trigger` creates a throwaway Customer whose id won't
   > match any `Organization.stripeCustomerId`, so `updateMany` updates 0 rows
   > (expected — it verifies the handler doesn't crash and returns 200). To see
   > a real row change, drive a real checkout (step 3) and switch/cancel the
   > plan from the Customer Portal, or `stripe trigger` with
   > `--add customer.subscription:customer=<your test cus_id>`.
5. Verify, after a real checkout + a portal plan switch + a portal cancel:
   - `Organization.plan` / `stripeSubscriptionId` reflect each transition
     (paid plan after checkout, new plan after switch, `"trial"` + `null` after
     cancel).
   - An `AuditEvent` row exists with `eventType` `billing.subscription_started`
     and one with `billing.subscription_canceled`.
   - Owner received the started + canceled emails (or, if `RESEND_API_KEY`
     unset, a "RESEND not configured" warning is logged and billing still
     succeeds).
   - Bad-signature request returns 400: replay with a tampered body, e.g.
     `curl -X POST .../api/billing/webhook -H 'stripe-signature: bad' -d '{}'`
     → `400 Signature verification failed`.

---

## 6. Flip the switch (last)

Only after 1–5 pass in test mode:
1. Set the LIVE `STRIPE_SECRET_KEY` (`sk_live_…`), the LIVE Dashboard webhook
   endpoint's `STRIPE_WEBHOOK_SECRET`, and all live `STRIPE_PRICE_*` ids.
2. Set `BILLING_ENABLED=true`.
3. Restart the service. Smoke test one real (or internal) checkout in live
   mode, confirm the org row + audit event + email, then refund/cancel.
4. Watch Stripe Dashboard → Developers → Webhooks for delivery failures over
   the first day (a 500 from the handler triggers Stripe retries).
