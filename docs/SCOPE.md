# SCOPE — Feature Classification

> Honest map of what this app actually contains, as of 2026-06-07.
>
> The README ("Shopify Profit Ops System") describes a founder-facing **analytics
> and reporting** product (Overview, Profit, Retention, Weekly Summary, Alerts,
> Settings). The codebase under `app/` and `lib/services/` is substantially
> larger than that: it also ships creative/AI generation, an affiliate/creator
> portal, an autonomous "growth agent", and a marketing planner. This document
> labels each area so we agree on what is **core**, what is **experimental**
> (built but not production-proven), and what is **deprecated** (dead/remove).

Legend:
- **core** — critical analytics/business path. Stable, expected in production.
- **experimental** — built but not production-proven. Ships in repo, not load-bearing.
- **deprecated** — dead code or stray artifacts; should be removed.

## `app/` top-level routes

| Area | Classification | Description |
|------|----------------|-------------|
| `app/page.tsx` + `layout.tsx` | **core** | App shell and Overview dashboard landing surface. |
| `app/api` | **core** (mixed) | API route layer. Sub-routes inherit their feature's classification (see below). |
| `app/profit` | **core** | Profit / contribution-margin analytics view. |
| `app/retention` | **core** | Cohort retention analytics view. |
| `app/weekly-summary` | **core** | Structured weekly founder report surface. |
| `app/sales-summary` | **core** | Sales summary / offline-sales reporting view. |
| `app/alerts` | **core** | Rule-based alert configuration and feed. |
| `app/settings` | **core** | Shopify connection, credentials, recipients, setup health. |
| `app/creative` | **experimental** | AI creative/packshot generation studio (Konva editor, image/video providers). |
| `app/creator-flow` | **experimental** | Creator content analytics page (pairs with `creator-analytics-service`). Linked from the sidebar as "Creator Commerce" (`nav.creatorFlow`) as of SA-HIGH-06; previously had no nav reference. |
| `app/affiliate-portal` | **experimental** | Affiliate/influencer portal, link tracking, conversion import. |
| `app/growth-agent` | **experimental** | Autonomous "growth agent": anomaly detection, action engine, crawlers. |
| `app/marketing-planner` | **experimental** | Marketing/influencer planning, readiness, learning loop. |
| `app/product-follow-ups` | **experimental** | Post-purchase / restock follow-up surface. |
| `app/print` | **experimental** | Printable report rendering (supports weekly/monthly export). |
| `app/globals.css` | **core** | Global styles (not a feature; listed for completeness). |

### `app/api/` major areas

Mirror the feature classification above; listed explicitly so the API surface
is auditable. (Source: real listing of `app/api/*/`.)

| API area | Classification | Drives |
|----------|----------------|--------|
| `app/api/shopify` | **core** | Connection test/save, sync execute/status — the ingestion backbone. |
| `app/api/settings` | **core** | Settings / connection management endpoints. |
| `app/api/alerts` | **core** | Alert feed/config endpoints. |
| `app/api/reporting` | **core** | Report data/export endpoints (weekly/monthly). |
| `app/api/weekly-summary` | **core** | Weekly founder-summary endpoints. |
| `app/api/sales-summary` | **core** | Offline/online sales summary endpoints. |
| `app/api/webhooks` | **core** | Shopify webhook receivers. |
| `app/api/cron` | **core** (dispatch) | In-process cron self-fetch targets; each job inherits its feature's class. |
| `app/api/creative` | **experimental** | Creative AI generation jobs/projects. |
| `app/api/creator` | **experimental** | Creator portal/admin endpoints. |
| `app/api/affiliate-portal` | **experimental** | Affiliate portal, attribution, conversion import. |
| `app/api/growth-agent` | **experimental** | Growth-agent actions, connections, rules, history. |
| `app/api/marketing-planner` | **experimental** | Marketing planner brief/plan endpoints. |
| `app/api/meta-ads` | **experimental** | Meta/Instagram ads ingestion (API-only; no top-level page). |

## `lib/services/` significant areas

| Service group | Classification | Description |
|---------------|----------------|-------------|
| `shopify-sync-*`, `shopify-ingestion-*`, `shopify-oauth-*`, `shopify-connection-*`, `shopify-webhook-*` | **core** | Shopify Admin GraphQL ingestion, sync runs, OAuth, webhooks — the data backbone. |
| `analytics-service`, `summary-service`, `insights-service` | **core** | Core analytics aggregation and summary inputs. |
| `contribution-margin-*`, `channel-cac-*`, `channel-performance-*` | **core** | Profit / margin / channel CAC computation. |
| `cohort-retention-service` | **core** | Retention cohort analytics. |
| `weekly-report-*`, `weekly-summary-insights-*`, `monthly-report-synthesis-*` | **core** | Weekly/monthly report generation and recipient handling. |
| `alert-service`, `alert-writer-service`, `notification-service` | **core** | Rule-based alerting and notification delivery. |
| `offline-sales-service`, `reconciliation-engine-*`, `recommendation-engine-*` | **core** | Offline sales ingest, reconciliation, recommendations feeding analytics. |
| `setup-health-service` | **core** | Connection/setup health checks for Settings. |
| `restock-hero-alert-*`, `stockout-imminent-*` | **core** | Inventory/stockout alerting (analytics-adjacent, production path). |
| `creative-ai-*`, `creative-job-*`, `creative-project-*`, `creative-storage-*`, `creative-shopify-publish-*`, `creative-video-config`, `creative-prompt-templates`, `creative-provider-availability` | **experimental** | AI creative generation (Replicate/OpenAI/Higgsfield/NanoBanana, ffmpeg video, S3 storage). Not production-proven. |
| `affiliate-*`, `bixgrow-service` | **experimental** | Affiliate portal, attribution, link tracking, conversion import, BixGrow integration. |
| `creator-*` | **experimental** | Creator admin, analytics, attribution. |
| `growth-agent-*` | **experimental** | Autonomous growth agent: anomaly, action engine, connectors, product crawler, sync. |
| `marketing-planner-*` | **experimental** | Marketing planner: influencer, learning, readiness, Shopify integration. |
| `instagram-*`, `meta-ads-*`, `roas-collapse-*`, `campaign-shopify-attribution-*` | **experimental** | Social/ads ingestion and ROAS analysis. Built, not production-proven. |
| `flashy-review-service`, `amazon-supplier-order-service` | **experimental** | Third-party integrations (reviews, Amazon supplier orders). |

## Stray artifacts (cleanup candidates)

| Path | Classification | Note |
|------|----------------|------|
| `creative-new.html`, `edit.html` | **deprecated** | Loose HTML prototypes at repo root; not wired into the Next.js app. |
| `tmp-test-file.txt` | **deprecated** | Temp file; remove. |
| `dev-server.log` | **deprecated** | Dev log present at repo root; should be gitignored. |

## Known gaps

- **AttributionSession table is EMPTY (0 rows).** Nothing is currently writing
  click/visit sessions, so conversion- and funnel-based metrics (click ->
  visit -> order attribution, affiliate conversion rate from sessions) are
  **unavailable**. Only **order-based** metrics work today (revenue, profit,
  retention, alerts, weekly summary), because those derive from synced Shopify
  orders rather than tracked sessions. Affiliate-portal conversion numbers that
  depend on sessions will read as zero until session ingestion is wired up.
- Treat any **experimental** area's "conversion" or "attribution" figures with
  caution while the session table stays empty.

## Notes / risks

- The README undersells the app: creative AI, affiliate, growth-agent and
  marketing-planner are real, sizeable surfaces with their own services and
  external dependencies (Replicate, OpenAI, ffmpeg, S3, Meta/Instagram).
  They are classified **experimental** here because they are not described as
  production-proven and sit outside the stated analytics core.
- `app/api/cron` schedules work across these areas; treat its targets by the
  classification of the feature each job drives.
- Reclassify any **experimental** area to **core** only once it has a production
  owner, monitoring, and is explicitly in scope.
