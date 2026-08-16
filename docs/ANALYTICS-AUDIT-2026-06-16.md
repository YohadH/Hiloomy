# Analytics Correctness Audit — 2026-06-16

10 analytics pages audited in parallel. 25 correctness bugs found.
**18 high-severity, 7 medium.** Most are concentrated in two repeated
patterns; fixing the patterns kills most of the list.

---

## High severity (18 — full list)

### 1. Returning Customer Rate is an average of daily rates
**Overview** · `lib/services/analytics-service.ts:37-39, 166`
Saturday 100 customers (50 returning) + Sunday 10 (0 returning) → page
shows 25% repeat rate. Real rate is 50/110 = 45.5%. Weekend-heavy
stores look like they have no loyalty.
**Fix:** Sum returning / sum total across the window.

### 2. Discount Rate and Refund Rate averaged the same wrong way
**Overview** · `lib/services/analytics-service.ts:170-171`
Day 1 $100/$20 disc (20%) + Day 2 $900/$9 (1%) → page shows 10.5%.
Truth: $29/$1,000 = 2.9%. Discounting looks 3× worse than reality.
**Fix:** Sum discounts / sum revenue across the window.

### 3. Cancelled and test orders inflate fallback metrics
**Overview** · `lib/data/prisma-analytics-repository.ts:127-146`
When Shopify-parity is down, the backup pipeline counts cancelled +
test orders that Shopify Admin excludes. Numbers stop matching Shopify.
**Fix:** Add `cancelledAt: null, test: false` to `getOrdersForRange`.

### 4. Affiliate commission missing from product profit
**Profit** · `lib/server/analytics.ts:154-204`
"40% margin" product is really 30% if you pay 10% affiliate. Page
promises "what's kept" but ignores affiliate cost.
**Fix:** Deduct affiliate commission proportionally, or relabel as
"gross profit before affiliate".

### 5. Profit page includes cancelled/test orders; contribution-margin doesn't
**Profit** · `lib/data/prisma-analytics-repository.ts:888-909`
Same product, two pages, different totals. One is wrong.
**Fix:** Apply same cancelled/test filter as `computeSalesSummary`.

### 6. COGS editor shows 100% margin on products that are actually 65%
**Profit costs** · `lib/services/product-cost-service.ts:136-155`
Editor compares price against `Product.estimatedCost = 0`. Owner
sees "100% margin", stops setting costs, Profit page silently uses
35% default. Two pages, two completely different truths.
**Fix:** Fall back to `price × defaultCostRatio` when no manual override.

### 7. Estimated Profit subtracts full refunds (incl. shipping+tax) but only line-item COGS
**Sales summary** · `lib/data/prisma-analytics-repository.ts:276-291`
$100 item + $18 shipping fully refunded → over-deducts $18 from
profit that was never goods cost. Refund days look worse than they are.
**Fix:** Use `returnsLineItems`, matching contribution-margin-service.

### 8. Daily profit chart has the same refund/COGS mismatch
**Sales summary** · `lib/data/prisma-analytics-repository.ts:400-410`
Daily chart dives on refund days for the same reason.
**Fix:** Sum `refundedLineItemsAmount` instead of `refundedAmount`.

### 9. Meta Ads weekly report silently drops the last day
**Weekly summary** · `lib/services/meta-ads-report-service.ts:276-277`
Filter is `dateStop <= input.end`, but Meta's `dateStop` is the
START of the next day. A 7-day report becomes 6 days. Every Meta
metric (spend, ROAS, CPC, CTR) reads ~14% low.
**Fix:** Extend boundary by one day, or filter by `dateStart`.

### 10. Same off-by-one in campaign attribution
**Weekly summary** · `lib/services/campaign-shopify-attribution-service.ts:94, 138`
Orders captured for 7 full days, spend captured for 6 — campaigns
look ~14% more efficient than they are.
**Fix:** Same as #9.

### 11. Inventory snapshot age never checked before forecasting stockouts
**Product follow-ups** · `lib/services/stockout-imminent-service.ts:138-165`
If last sync was 5 days ago, "10 days to stockout" might really be 5
days. With 2-week restock lead times, you lose a week of revenue.
**Fix:** Validate `lastProductsSyncAt`; downgrade confidence on stale data.

### 12. Inventory-only changes in Shopify never trigger a sync
**Product follow-ups** · `lib/services/shopify-sync-service.ts:238-264`
Shopify doesn't bump `product.updatedAt` for inventory changes.
Restocks are invisible until someone edits the product. The
restock-hero "back in stock" alert (north-star feature!) never fires.
**Fix:** Add `inventory_levels/update` webhook, or full re-sync every
24-48h.

### 13. Restock-hero "win" measurement counts refunded sales
**Alerts** · `lib/services/alert-outcome-service.ts:213-227`
Ledger says "RECETTE 702 → ₪3.2k/wk again" but if those orders
refunded, ledger still claims success.
**Fix:** Subtract `refundedSubtotal` from `lineSubtotal`.

### 14. Stockout reorder "win" measurement counts refunded units
**Alerts** · `lib/services/alert-outcome-service.ts:289-302`
"45 units sold since reorder" when 30 refunded — you think the
restock was enough, then re-stockout.
**Fix:** Subtract `refundedQuantity` from `quantity`.

### 15. Marketing planner discount rate uses post-discount revenue as denominator
**Marketing planner** · `lib/services/marketing-planner-service.ts:370`
₪100 order with ₪10 discount → shows 11.1%, truth is 10%. Owner
thinks they discounted harder than they did, tightens promotions.
**Fix:** Divide by `(totalPrice + totalDiscounts)`.

### 16. Marketing planner refund rate has the same denominator bug
**Marketing planner** · `lib/services/marketing-planner-service.ts:371`
Refund rate over-reports by ~25%. Owner over-orders inventory or
raises prices to fight a problem that's smaller than the dashboard says.
**Fix:** Divide by `(totalPrice + totalRefunds)`.

### 17. Affiliate sales/commission ignore refunds
**Affiliate portal** · `lib/services/affiliate-portal-service.ts:620-621`
$100 affiliate order refunded → dashboard still shows "$100, $10 owed".
You pay commission on revenue that bounced.
**Fix:** Join `AffiliateAttribution` to `Order.totalRefunds`, subtract.

### 18. Affiliate "top products" includes refunded line items
**Affiliate portal** · `lib/services/affiliate-portal-service.ts:716`
10 affiliate-driven candle orders shown as $500 — 5 refunded.
Product strategy decisions made on inflated winners.
**Fix:** Use `(lineSubtotal − refundedSubtotal)`.

### 19. Affiliate trend chart shows refunded sales on the original date
**Affiliate portal** · `lib/services/affiliate-portal-service.ts:688`
Day-1 spike of $5k stays $5k forever even after $2k refunds. Trend
lies about which affiliates are actually working.
**Fix:** Subtract `Order.totalRefunds` when building daily buckets.

---

## Medium severity (7)

### 20. Average Order Value averaged across days instead of summed
**Overview** · `lib/services/analytics-service.ts:169, 181`
Day 1 (10 orders, $100 AOV) + Day 2 (100 orders, $90 AOV) → page
shows $95. Truth: $90.91. Sale-day spikes distort the headline.
**Fix:** Total revenue / total orders.

### 21. Cost coverage % is product-count-weighted, not revenue-weighted
**Profit costs** · `lib/services/product-cost-service.ts:161-168`
1 hero (40% of revenue, costed) + 99 niche SKUs → reads "1% cost
coverage", panic, when margin is mostly trustworthy.
**Fix:** Weight by revenue, not SKU count.

### 22. Cost coverage filter only counts manual overrides
**Profit costs** · `lib/services/product-cost-service.ts:162`
Store on default 35% ratio everywhere reads "0% coverage" — looks
like no data when costs are actually estimated on every line item.
**Fix:** Count manual override OR sync-time ratio.

### 23. Stock-alerts page never shows inventory freshness
**Product follow-ups** · `app/product-follow-ups/page.tsx`
"15 units (red flag)" might be 10 days stale. Owner reorders against
phantom data.
**Fix:** Display `lastProductsSyncAt` with age-based warning color.

### 24. ROAS-collapse outcome window starts at exact resolution timestamp
**Alerts** · `lib/services/alert-outcome-service.ts:355-365`
Resolve at 11:59 PM → 3-day window; resolve at midnight → ~4 days.
Identical performance reads differently based on click time.
**Fix:** Snap to next UTC midnight.

### 25. Action Center stat cards omit "blocked" actions
**Growth agent** · `app/growth-agent/action-center/page.tsx:14-36`
Cards say "3 actions" but list has 5 because 2 are blocked on missing
Meta/Instagram tokens. Owner misses the real remediation work.
**Fix:** Add a "Blocked" stat card.

---

## Patterns — fix these centrally, kill most of the list

### Pattern A: Refunds don't propagate (8 bugs)
#7, #8, #13, #14, #17, #18, #19, plus denominators #15/#16 — all
share the same shape: revenue / unit counts computed at order time,
never reconciled against refunds. Affiliate, alert ledger, profit,
and planner all share this blind spot.

**Highest-leverage fix in the audit.** One helper that returns
`(amount − refundedAmount)` everywhere we currently use raw
`lineSubtotal` / `salesAmount` / `quantity`. Single PR knocks down
8 bugs.

### Pattern B: "Average of daily rates" instead of "window total / window total" (5 bugs)
#1, #2, #15, #16, #20 — whoever wrote the daily-rollup pattern reused
it for window aggregation, which is mathematically wrong for any rate
or ratio.

**Fix:** One shared `windowRate(numerators, denominators)` utility
and ban averaging rates across days in code review.

### Pattern C: Cancelled/test order filter applied inconsistently (2 bugs)
#3 Overview fallback and #5 Profit disagree with
contribution-margin. The filter exists and works in one place — it
just isn't shared.

**Fix:** Replace inline filters with the existing
`withAnalyticsOrderFilters({ ... })` helper everywhere.

### Pattern D: Date-window off-by-one on Meta data (2 bugs)
#9 + #10 — `dateStop` is exclusive on Meta's side but treated as
inclusive in our filter. Every weekly Meta number is ~14% low.

**Fix:** Centralize the Meta date-window logic; one fix
covers both queries.

### Pattern E: Inventory freshness is invisible (3 bugs)
#11, #12, #23 — trusting `ProductVariant.inventoryQuantity` without
checking sync age. Shopify never tells us about pure inventory
changes. The whole stockout pipeline needs the
`inventory_levels/update` webhook before any stockout alert is
trustworthy.

### Pattern F: Profit page label vs. profit page math (2 bugs)
#4 affiliate commission + #6 COGS editor 100% margin — tell the
owner one thing and compute another. Erodes trust in every other
number on the page.

---

## Suggested fix order (by leverage)

1. **Pattern A (refunds)** — single helper, knocks out 8 bugs, fundamental to truth.
2. **Pattern B (window rates)** — single utility, knocks out 5 bugs, fundamental to truth.
3. **Pattern D (Meta date)** — 1-line fix, knocks out 2 bugs, restores ~14% of every Meta metric.
4. **Pattern C (filter consistency)** — code-hygiene fix, 2 bugs.
5. **Pattern F (Profit label vs math)** — 2 bugs, but they erode trust the most.
6. **Pattern E (inventory freshness)** — bigger lift (webhook integration), but unblocks the restock-hero feature.
7. **Loose ends:** #24, #25 — cleanup.
