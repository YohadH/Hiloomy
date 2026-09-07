# Decision Inbox — implementation plan (2026-09-07)

Hiloomy's new home screen: **Today — Commercial Decision Inbox**. The product idea is
that Hiloomy reviews everything, suppresses routine noise, and surfaces only the few
commercial decisions that deserve a Brand Manager's attention. This document is the plan
that the implementation follows; it is kept next to the code so future work stays on it.

## 1. Principles that shape the build

- **Decision Objects, not dashboards.** Every screen is built from one typed shape
  (`Decision`) with status, question, evidence with sources, options, confidence,
  missing evidence, and "what would change this".
- **Real evidence only.** Nothing is invented. Every number comes from an existing
  service; when a fact is not available it is rendered as *Unavailable* and lowers the
  confidence. Evidence quality is one of `known / calculated / estimated / unavailable`.
- **The Alert table is the ledger.** It already has status, resolvedBy, payloadJson
  (outcomes measured 3 days after resolve) and per-store fingerprints. Decisions map
  1:1 to alert rows; derived decisions that have no engine yet are upserted into it by
  the inbox service so they get a stable ID and a human-decision record.
- **DO NOT ACT and WATCH are first-class.** The ranking is by ₪ exposure, not severity
  label, and the inbox holds at most five cards. Everything else is on the Watchlist.
- **Zero decisions is a success state** and is rendered as such.

## 2. Data composition (what feeds each decision)

| Decision kind | Status | Sources (all existing) | Rule |
|---|---|---|---|
| Stockout × paid traffic | ACT / WATCH | `stockout_imminent` alerts (payload: inventory, velocity, days cover, trailing revenue, active campaigns) + `getActiveCampaignsByProduct` | ACT when a live Meta campaign is still spending on the SKU, else WATCH |
| Returning-customer affiliate commission | TEST | `getCommissionLeakageSummary` (30d) | TEST when returning commission ≥ ₪500 and ≥ 15 % of classified commission; smaller → Watchlist |
| Product unprofitable standalone | DO NOT ACT | per-product SQL over `OrderLineItem` (90d: units, net, discounts, COGS, cost coverage) + `BundleComponent` presence | DO NOT ACT when contribution < 0 with ≥ 95 % cost coverage and basket economics are not modelled |
| Competitor promotion | WATCH / ACT | `competitor_promo` alerts + 7d vs prior-7d sales velocity (`getShopifySalesSummaryForWindow`) + GA4 conversion when available | WATCH unless velocity −12 % or conversion −8 % |
| Campaign ROAS collapse | CHANGE PLAN | `roas_collapse` alerts | surfaced as-is with campaign evidence |

The Today page first runs the same idempotent engines the Command Center runs
(stockout, ROAS, competitor, outcome measurement) so the ledger is fresh, then reads.

Summary numbers are derived, not decorative: *signals reviewed* = products considered
by the stockout engine + Meta campaigns in the window + affiliate conversions
classified + competitor snapshots + open alerts; *suppressed* = reviewed − surfaced −
watched; *data confidence* = the setup-health score.

## 3. Files

Domain and service
- `lib/domain/decision.ts` — `Decision`, `DecisionStatus`, `EvidenceFact`, `Confidence`,
  `EvidenceQuality`, `DecisionInbox`, `WatchItem`, `MemoryEntry`.
- `lib/services/decision-inbox-service.ts` — `buildDecisionInbox(storeId)`,
  `getDecision(storeId, id)`, `listDecisionMemory(storeId)`, `buildDataHealth(storeId)`,
  `buildMarketView(storeId)`; decision builders per kind; ledger upsert for derived kinds.
- `app/api/decisions/[id]/decide/route.ts` — POST `{ choice: approve | alternative |
  ignore, optionKey? }` → alert status + `payloadJson.humanDecision`.

Components (`components/decisions/`)
- `status-pill.tsx` — the five statuses; status is the strongest visual cue, one accent.
- `evidence.tsx` — evidence fact with source + quality tag; grouped evidence list.
- `decision-card.tsx` — inbox card (title, question, evidence chips, exposure,
  recommendation, confidence, missing evidence, actions).
- `decision-receipt.tsx` — full detail: Decision, Trigger, Evidence by source, What
  Hiloomy connected, Options, Recommendation, Confidence, Missing evidence, What would
  change this, Human decision buttons, receipt footer.
- `decision-drawer.tsx` — client side-sheet (portal) hosting the receipt.
- `decision-inbox.tsx` — client list + drawer state + human-decision calls.
- `today-summary.tsx` — greeting, headline count, context line, brand and freshness.

Pages
- `app/today/page.tsx` (+ `loading.tsx`), `app/today/[id]/page.tsx` (deep link to a receipt)
- `app/watchlist/page.tsx`, `app/market/page.tsx`, `app/memory/page.tsx`, `app/data-health/page.tsx`

Navigation
- `components/layout/sidebar.tsx` — primary: Today, Watchlist, Market, Plan
  (`/marketing-planner`), Memory, Data Health. Bottom "Tools" section: Command Center,
  Creative Studio, Affiliates, Discounts, Weekly summary, Creators, Offline, Product
  follow-ups, Retention, Product costs, Alerts, Settings. Module flags still apply.
- `middleware.ts` + `app/page.tsx` — signed-in home becomes `/today`.

## 4. Copy and locale

Hebrew is the default; English is complete. Strings live next to the components as
`{ he, en }` pairs, matching the rest of the app. Currency is ₪ with no decimals.

## 5. Verification

Done on 2026-09-07:
- `tsc --noEmit` clean, unit tests (110) pass, production `next build` run.
- The five new routes were added to `tests/e2e/smoke.spec.ts` so CI renders them.

Still owed (needs a running server with a database, which this workstation does not have):
- Today with 0 decisions and with 1–5 decisions, drawer open/close, approve /
  alternative / ignore round-trip, Memory showing the decision after a choice, RTL + EN,
  phone width.

## 6. Out of scope for this pass

- Competitor ↔ product matching with a relevance score (no data source yet; the card
  shows the match as unavailable rather than inventing one).
- Supplier lead time and purchase cost (rendered as missing evidence).
- Basket-level contribution when no bundles are defined.
