---
name: bi-metrics
description: Definitions of the business metrics that matter for this store and how to read them. Invoke when analyzing business performance or producing growth insights. Sourced from the app's own Postgres database (Shopify data synced into it).
---

# BI Metrics (app Postgres DB)

Data source: the **app's Postgres database** (`DATABASE_URL` in `C:\Work\ShopifyApp\ShopifyAppAnalytics\.env`), which holds Shopify data synced into it. NOT `shopify-dev-mcp` (that's docs only).

Where each metric comes from (schema: `prisma/schema.prisma`):
- Orders / revenue / AOV → `Order`, `OrderLineItem` (prefer pre-aggregated `DailyMetric` / `Summary` / `MetricSnapshot`).
- Sessions / conversion → `AttributionSession` (CR = orders ÷ sessions).
- Refunds / returns → `Refund`. Customers / repeat → `Customer`.
- Data freshness → `SyncRun` (latest run; if stale, flag it before reporting numbers).

If a metric isn't in the DB, say so and state what would provide it (e.g. a Shopify Admin API field not yet synced).

## Core growth metrics
- **Conversion rate (CR)** = orders ÷ sessions. The headline number. Segment by device and traffic source when possible.
- **Average order value (AOV)** = total sales ÷ orders.
- **Sessions** and trend vs prior period — volume of demand.
- **Add-to-cart rate** = carts ÷ sessions — product/merchandising signal.
- **Checkout completion rate** = orders ÷ checkouts started — funnel/friction signal.
- **Revenue** = sessions × CR × AOV. Decompose changes into these three drivers.

## Funnel (where growth leaks)
session → product view → add to cart → checkout started → order.
Report the drop-off at each step; the biggest leak is the highest-leverage fix.

## Reading the numbers
- Always report TREND vs the last reading (improving / flat / degrading), not just a snapshot — pull prior values from memory.
- Flag a metric as significant only if the move is beyond normal day-to-day noise; note the comparison window.
- Tie every insight to one of the drivers above so the planner gets an actionable task (e.g. "checkout completion fell 6pts → investigate shipping-cost surprise at checkout").

> Replace the example thresholds and add store-specific KPIs (returning-customer rate, repeat purchase, margin) as priorities are set.
