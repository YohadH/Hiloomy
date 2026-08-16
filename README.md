# Shopify Profit Ops System

Shopify Profit Ops System is a founder-facing analytics and automation service for Shopify brands. It is built to turn store data into profit visibility, retention insight, rule-based alerts, and structured weekly reporting without positioning itself as a replacement for the full Shopify analytics surface.

## What is implemented

- Premium analytics UI across Overview, Profit, Retention, Weekly Summary, Alerts, and Settings
- Phase 2 Shopify ingestion foundation using the Shopify Admin GraphQL API
- Secure server-side storage for custom app credentials
- Initial and incremental sync services with normalized database writes
- Sync run tracking and admin-facing sync status
- DB-backed analytics query services powered by synced Shopify data
- Rule-based alerts and structured founder-summary inputs derived from normalized data

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Recharts
- Prisma ORM
- PostgreSQL
- Shopify Admin GraphQL API

## Environment setup

Copy `.env.example` to `.env` and provide values for:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shopify_profit_ops"
SHOPIFY_CREDENTIALS_ENCRYPTION_KEY="replace-with-a-long-random-secret"
SHOPIFY_ADMIN_API_VERSION="2025-01"
```

Notes:

- `SHOPIFY_CREDENTIALS_ENCRYPTION_KEY` is required before saving Shopify credentials because admin tokens are encrypted at rest.
- `SHOPIFY_ADMIN_API_VERSION` defaults to `2025-01` if omitted.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Generate the Prisma client:

```bash
npm run prisma:generate
```

3. Start PostgreSQL and push the schema:

```bash
npx prisma db push
```

4. Start the app:

```bash
npm run dev
```

5. In Settings, use a Shopify custom app token to:

- test the Shopify connection
- save Shopify credentials
- run an initial sync
- run incremental syncs

## Shopify custom app setup

Phase A uses a private custom app token workflow rather than OAuth.

The merchant provides:

- shop domain, for example `example.myshopify.com`
- Admin API access token from a custom app

The token never goes to the client after submission. It is stored encrypted server-side.

## Likely required Shopify scopes

For this analytics MVP, the custom app will typically need read access for:

- `read_products`
- `read_orders`
- `read_customers`
- `read_discounts`
- `read_inventory`

Depending on your Shopify setup and refund details needed, you may also need order- and return-related read scopes available to your app configuration.

Verify the exact scopes in Shopify admin when creating the custom app. The code assumes read-only analytics ingestion, not storefront or checkout modification privileges.

## Ingestion architecture

- `lib/shopify/client.ts`
  Server-side GraphQL client with auth handling, retry behavior, and pagination support
- `lib/shopify/queries/`
  Separate GraphQL modules for shop, products, customers, and orders
- `lib/shopify/mappers/`
  Shopify-to-internal normalization helpers
- `lib/services/shopify-connection-service.ts`
  Credential validation, connection testing, secure storage, and connection summary access
- `lib/services/shopify-sync-service.ts`
  Store metadata, product, customer, and order sync services plus full/incremental orchestration
- `app/api/shopify/`
  Internal endpoints for connection test/save and sync execution/status

## Analytics architecture

- `lib/data/prisma-analytics-repository.ts`
  DB-backed analytics repository for stores with synced data
- `lib/repositories.ts`
  Chooses the active analytics data source
- `lib/services/analytics-service.ts`
  App-level analytics payloads used by the UI
- `lib/services/alert-service.ts`
  Stored alerts with fallback rule generation from real analytics
- `lib/services/summary-service.ts`
  Structured founder-summary output backed by real analytics inputs

## Data model highlights

The Prisma schema now supports:

- `Store`
- `ShopifyConnection`
- `SyncRun`
- `Product`
- `ProductVariant`
- `Customer`
- `Order`
- `OrderLineItem`
- `DiscountUsage`
- `Refund`
- `DailyMetric`
- `Summary`
- `Alert`

This model keeps both internal IDs and Shopify IDs and is structured for incremental syncs and later webhook/event extensions.

## Sync modes

- Initial sync:
  Pulls a broad historical dataset through paginated GraphQL queries and normalizes records into the internal database.
- Incremental sync:
  Uses Shopify `updated_at` query filters to fetch only changed records since the last successful sync.

The current implementation is pagination-based for simplicity and MVP reliability.

TODO:

- Plug in Shopify bulk operations for large stores
- Add background-job orchestration for scheduled syncs
- Add webhooks for order, customer, and product updates

## Profit and retention modeling

- Estimated profit uses `revenue - discounts - refunds - estimated_cost`
- Store-level `defaultCostRatio` supports estimated cost when true COGS is unavailable
- Product-level `costOverrideAmount` is ready for more precise cost inputs later
- Retention modeling supports first order, second order, returning customer rate, and repeat purchase analysis

## Security

- Shopify Admin API tokens are kept server-side only
- Tokens are encrypted before storage
- Shop domain and token inputs are validated
- Internal API routes return app-level payloads rather than raw Shopify responses

## Local data population

- `prisma/seed.ts` does not insert sample data.
- Populate local data by connecting Shopify in Settings and running an initial sync.

## Future work

- TODO: Add Shopify OAuth install flow for multi-merchant production onboarding
- TODO: Add webhook registration and background sync scheduling
- TODO: Add richer product cost ingestion from ERP or spreadsheet sources
- TODO: Replace structured summary generation with an LLM provider pipeline
- TODO: Add delivery adapters for email, WhatsApp, and Slack
- TODO: Add authentication and store scoping for multi-tenant usage

## Growth Agent module

The app now includes a `Growth Agent` feature area for anomaly detection, safe automations, and merchant-controlled monitoring.

### What it adds

- `app/growth-agent/`
  Overview, Configuration, Connections, Rules & Automations, Alerts / History, and Action Center pages
- `lib/services/growth-agent-*.ts`
  Service layer for settings persistence, connector status, metric snapshot sync, anomaly detection, and action orchestration
- `app/api/growth-agent/`
  Internal endpoints for overview, configuration, findings, actions, manual sync, manual scan, and health checks
- `prisma/schema.prisma`
  `AgentSettings`, `AgentFinding`, `AgentAction`, `PlatformConnection`, and `MetricSnapshot` models

### Growth Agent environment notes

Additional optional connector env vars are scaffolded in `.env.example` for future OAuth work:

- `META_ADS_CLIENT_ID`
- `META_ADS_CLIENT_SECRET`
- `TIKTOK_ADS_CLIENT_ID`
- `TIKTOK_ADS_CLIENT_SECRET`
- `GA4_CLIENT_ID`
- `GA4_CLIENT_SECRET`

These are not required for the current build. Shopify remains the primary live data source today.

### Growth Agent safety model

- Recommendation-only, approval-required, and auto-execute modes are supported
- Auto-execution is blocked when confidence is too low, a connector is missing, or guardrails are violated
- Every action is stored as an audit record with status and failure reason when applicable
- Paid/social execution remains connector-gated rather than pretending to be live without auth

### Webhooks and link-only attribution

- APP_URL is used to generate tracked affiliate redirect links through /api/affiliate-portal/redirect.
- SHOPIFY_WEBHOOK_SECRET is used to verify Shopify webhook signatures on /api/webhooks/shopify/orders.
- Link-only attribution improves Growth Agent tracking confidence by measuring click/session coverage and webhook match health.

### Storefront ref tracking

For better link-only attribution matching, the app now supports `ref` and `agent_click_id` instead of relying on `bg_ref`.

- Redirect links can go through `/api/affiliate-portal/redirect`
- Shopify order webhooks can reconcile orders back to attribution sessions
- A ready-to-use storefront script lives at `public/shopify/affiliate-ref-tracking.js`
- A theme snippet example lives at `docs/shopify-theme-affiliate-ref-snippet.liquid`

The storefront script writes `ref` and `agent_click_id` into cart attributes and cart note so those values are easier to recover from Shopify webhook payloads.
