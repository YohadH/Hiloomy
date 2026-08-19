# Hiloomy — Five Insight Engines Plan

*Created 2026-08-19 · Owner: Yoad · Source: founder notes (traffic, attribution, discounts, collections, returns)*

Every engine follows the house rule: it must answer **what happened AND what to do** — a finding without a suggested action doesn't ship. Each engine feeds three surfaces: its own screen, the alerts/command center, and the weekly report.

---

## Engine 1 — Affiliate Commission Intelligence ("commission leakage")

**Merchant question:** "Am I paying affiliates for customers I already own?"

**Today:** `AffiliateAttribution` links every conversion to an order; orders link to customers; customer order history exists; retention layer already classifies new vs returning. All data needed is in the DB — this is a query + UI feature, no new sync.

**Build:**
- *Data/service:* per-conversion enrichment — `customerType: new | returning`, days since customer's previous order, customer's first-ever source. Backfill across the existing ~20k attribution rows.
- *UI:* new column + filter on the conversions ledger; a "Leakage" summary card on the affiliate portal: commissions paid on returning customers this month (₪ + %), top affiliates by leakage.
- *Policy:* per-program commission rules — full / reduced / zero for returning customers; optional protection window (credit only within N days of first touch). Enforced at commission calculation, shown at payout approval.
- *Alerts/report:* monthly alert + weekly-report line: "₪X of commissions went to returning customers — consider a returning-customer rate."
- *Journey view (stretch):* per-customer timeline of order sources (first-touch vs last-touch).

**Done when:** every conversion shows new/returning; leakage card live; at least one program uses a returning-customer rule.
**Effort:** M (3–5 days). **Depends on:** nothing.

---

## Engine 2 — Discount Campaign Scorecards ("marketing vs discounts, live")

**Merchant question:** "Is this discount making me money right now, or burning margin?"

**Today:** `DiscountUsage` (code + amount per order), contribution-margin engine already subtracts discounts, Profit page has a discount-impact table, Gantt audit knows planned promos, 2-hour sync = near-live during sale days.

**Build:**
- *Data/service:* discount scorecard aggregation per code/automatic discount: uses, revenue influenced, discount cost, margin after discount, AOV vs baseline, % new customers, trend by day.
- *UI:* Discounts screen — one card per active discount styled like the weekly report's campaign table, with a verdict (expand / keep / stop). History for ended discounts.
- *Alerts:* **underwater discount** — orders under a code net negative contribution margin → high-priority alert mid-sale with action "stop the code".
- *BXGY (phase 2 of this engine):* sync Buy-X-Get-Y structure from Shopify's discount API → attach rate + effective margin including gift COGS.
- *Plan-vs-actual:* link Gantt planned promos to their measured scorecard.

**Done when:** every active code has a live scorecard; underwater alert fires in staging test; weekly report includes a discounts section.
**Effort:** M–L (5–8 days incl. BXGY). **Depends on:** nothing for core; Shopify discount API sync for BXGY.

---

## Engine 3 — Returns Intelligence ("which product comes back")

**Merchant question:** "Which products/variants are quietly bleeding margin through returns — and why?"

**Today:** `Refund` rows are order-level amounts only; refund impact in profit math; refund-spike alerts exist.

**Build:**
- *Data (the unlock):* sync **refund line items** from Shopify (product/variant/qty per refund) — currently we store only totals.
- *Service:* return rate per product / variant / collection vs store average; variant skew detection (one size returning disproportionately).
- *UI:* Returns tab on Profit — best/worst returners, variant breakdown.
- *Cross-signal (the differentiator):* **ROAS × return rate** — the Meta campaign verdict engine downgrades "scale" to "check" when the advertised product's return rate is above threshold. A 3.3-ROAS product with 15% returns is not a winner.
- *Alerts/report:* per-product return-rate alert with actions ("fix size chart", "pull from ads"); weekly-report line.
- *Stretch:* return reasons (where Shopify provides), serial-returner customers.

**Done when:** return rate per product live; one ROAS verdict visibly adjusted by returns in the weekly report.
**Effort:** M (4–6 days). **Depends on:** refund line-item sync (Shopify API, existing sync pipeline pattern).

---

## Engine 4 — Collection Rhythm ("what works by day")

**Merchant question:** "Which collection sells on which day — and when should I schedule its promo?"

**Today:** `ProductCollectionMembership`, per-collection revenue/profit, daily metrics, an existing heatmap component (retention cohorts) to reuse.

**Build:**
- *Service:* collection × weekday aggregation (revenue, profit, orders), rolling 8–12 weeks.
- *UI:* heatmap on the Profit/collections view; "best day" chip per collection.
- *Planner hook:* marketing planner suggests scheduling a collection's banner/post/discount on its strongest day; weekly report picks one scheduling recommendation.
- *Later:* traffic per collection page once Engine 5's data lands.

**Done when:** heatmap live; planner shows at least one day-based recommendation.
**Effort:** S (2–3 days). **Depends on:** nothing.

---

## Engine 5 — Product Traffic Funnel (**gated on Google connection**)

**Merchant question:** "Which products get seen but not bought — and which convert great but nobody sees?"

**Today:** we know what sells, not what's viewed. No product-level traffic source yet. **This engine starts when the Google connectors are live** — agreed direction:
- *Stage A — GSC (connector already built, needs `GOOGLE_OAUTH_*` env + merchant connect):* organic clicks/impressions per product page → "found but not bought" list.
- *Stage B — GA4 (roadmap tile):* sessions + conversion rate per product → full funnel.
- *(Alternative/bridge):* lightweight page-view ping in the storefront script we already ship for affiliate tracking — only if GA4 adoption lags.

**Build (once gated data exists):**
- *Service:* per-product traffic + conversion join with sales.
- *UI:* Product funnel table — traffic, CR, revenue, profit; two spotlight lists: high-traffic/low-CR (fix page) and high-CR/low-traffic (push budget/SEO).
- *Alerts/report:* one spotlight product per week with a concrete action.

**Done when:** with GSC connected, the "found but not bought" list renders on real data.
**Effort:** M after gate (3–5 days). **Depends on:** GSC connect (env vars + merchant OAuth), later GA4 connector.

---

## Platform Expansion Track (runs alongside the engines)

**Goal:** stop being "a Shopify app" and become "a commerce profit platform" — reachable by API, and ingesting more than one store platform. The Agency plan already sells "API access (beta)", so track A also closes a pricing promise.

### A. Public Hiloomy API
- **What:** read-only REST API v1 — profit/contribution margin, conversions, affiliate ledger, weekly-report data; per-org API keys with scopes; rate limiting; docs page.
- **Today:** all internal API routes exist but are session-authed; the Agency plan advertises API beta.
- **Build:** API-key model (hashed keys, per-org, revocable) -> key management UI in settings -> /api/v1/* read endpoints reusing existing services -> docs. Outbound webhooks (new-alert, weekly-report-ready) as stage 2.
- **Effort:** M (4-6 days for keys + 4 core read endpoints). **Phase 3.**

### B. WooCommerce connector
- **What:** second commerce source — WooCommerce REST API (consumer key/secret per store) syncing orders, products, customers into the same normalized models.
- **Today:** sync layer is Shopify-specific; core models (Order/Product/Customer) are near-platform-neutral but carry shopify*Id columns.
- **Build:** introduce a **commerce-adapter interface** (one contract: fetch orders/products/customers since X; Shopify becomes the first adapter) -> generalize external-ID columns (platform + externalId) -> Woo adapter -> connect card in the integrations hub. Profit, retention, alerts, and the weekly report work unchanged on top of normalized data.
- **Effort:** L (2-3 weeks for a reliable MVP sync). **Phase 4 — after Engines 1-4.**

### C. Wix Stores connector
- **What:** third source via the Wix eCommerce API (OAuth app in the Wix App Market). Strategically strong for the Israeli ICP, where Wix has real share.
- **Build:** second implementation of the same commerce-adapter interface — the abstraction cost is paid once in track B.
- **Effort:** M-L (1-2 weeks once the adapter exists). **Phase 4, after Woo.**

*Order rationale: API first (small, closes a plan promise, no schema risk) -> Woo (biggest market, forces the adapter abstraction) -> Wix (cheap second adapter, IL wedge).*

---

## Build order

| Phase | Engines | Rationale |
|---|---|---|
| **1 (now)** | 1 Commission leakage → 2 Discount scorecards (core + underwater alert) | Pure existing-data wins; leakage is unique to Hiloomy and saves real money; discounts are urgent every sale season |
| **2** | 3 Returns (line-item sync + ROAS cross-signal) → 4 Collection rhythm | One new sync unlocks the strongest cross-signal; rhythm is a small reuse win |
| **3 (after Google connect)** | 5 Traffic funnel (GSC stage first, GA4 stage later) | Gated on connectors — exactly as decided |
| **3 (parallel)** | Public API v1 (keys + core read endpoints) | Small, closes the Agency-plan "API beta" promise |
| **4** | WooCommerce connector -> Wix connector | Commerce-adapter abstraction built once, reused for every next platform |

Rough total: Phases 1–2 ≈ 3 weeks of focused work; Phase 3 ≈ 1 week once Google is connected.
