// Outcome-validation extractor for the three July–August Incense decisions:
//   A. LOVE — 20% sitewide Tu B'Av promo, 21–31 Jul
//   B. INTENSE 50 — NEW50 (20%) + PAZ (gift-with-purchase), ongoing Jul–Aug
//   C. RECETTE 702 — 10% coupon (702) on restock, ~1 Jul
//
// READ-ONLY. Pulls the real before/during/after numbers + coupon-level usage so
// the recommendations for A/B/C can be validated against what actually happened
// (not against hindsight aggregates). Windows are store-local (Asia/Jerusalem,
// UTC+3 in summer). Revenue = Σ lineSubtotal (ex-VAT, pre-discount); net = minus
// line discounts; contribution = net − Σ estimatedCostAmount (verified per-line
// COGS). All figures are what the DB holds today for orders created in-window.
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   node scripts/decision-backtest-abc.mjs [storeId]

import { PrismaClient } from "@prisma/client";

const STORE = process.argv[2] || "cmofolt410000wkzw93wecvf7"; // Incense
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the store's database.");
  process.exit(1);
}
const p = new PrismaClient({ log: [] });
const J = (o) => console.log(JSON.stringify(o));
// Store-local day boundary → UTC Date (Israel = +03:00 in Jul/Aug).
const d = (iso) => new Date(`${iso}T00:00:00+03:00`);

// Aggregate real orders in [start,end) — orders/units/gross/discount/net/COGS/
// contribution/AOV, plus refunds booked in-window and weekday mix.
async function windowStats(start, end) {
  const [agg] = await p.$queryRaw`
    SELECT
      COUNT(DISTINCT o.id)::int AS orders,
      COALESCE(SUM(li.quantity),0)::int AS units,
      COALESCE(SUM(li."lineSubtotal"),0)::float AS gross,
      COALESCE(SUM(li."lineDiscountAmount"),0)::float AS line_discount,
      COALESCE(SUM(li."lineSubtotal" - li."lineDiscountAmount"),0)::float AS net,
      COALESCE(SUM(li."estimatedCostAmount"),0)::float AS cogs
    FROM "Order" o
    JOIN "OrderLineItem" li ON li."orderId" = o.id
    WHERE o."storeId" = ${STORE} AND o."cancelledAt" IS NULL AND o.test = false
      AND o."createdAt" >= ${start} AND o."createdAt" < ${end}`;
  const [ref] = await p.$queryRaw`
    SELECT COALESCE(SUM(r."refundedLineItemsAmount"),0)::float AS refunds
    FROM "Refund" r
    WHERE r."storeId" = ${STORE} AND r."createdAt" >= ${start} AND r."createdAt" < ${end}`;
  const net = agg.net;
  return {
    orders: agg.orders,
    units: agg.units,
    gross: round(agg.gross),
    line_discount: round(agg.line_discount),
    net: round(net),
    cogs: round(agg.cogs),
    contribution: round(net - agg.cogs),
    aov_net: agg.orders ? round(net / agg.orders) : 0,
    refunds_in_window: round(ref.refunds)
  };
}

// Coupon usage in [start,end): distinct orders + ₪ given away.
async function couponUsage(code, start, end) {
  const [r] = await p.$queryRaw`
    SELECT COUNT(DISTINCT du."orderId")::int AS orders, COALESCE(SUM(du.amount),0)::float AS amount
    FROM "DiscountUsage" du JOIN "Order" o ON o.id = du."orderId"
    WHERE du."storeId" = ${STORE} AND UPPER(du.code) = ${code.toUpperCase()}
      AND o."cancelledAt" IS NULL AND o.test = false
      AND o."createdAt" >= ${start} AND o."createdAt" < ${end}`;
  return { code, orders: r.orders, amount: round(r.amount) };
}

// All coupons active in a window, by ₪ given away (reveals overlap/stacking).
async function topCoupons(start, end) {
  return (await p.$queryRaw`
    SELECT du.code, COUNT(DISTINCT du."orderId")::int AS orders, SUM(du.amount)::float AS amount
    FROM "DiscountUsage" du JOIN "Order" o ON o.id = du."orderId"
    WHERE du."storeId" = ${STORE} AND o."cancelledAt" IS NULL AND o.test = false
      AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY du.code ORDER BY amount DESC LIMIT 15`).map((r) => ({ code: r.code, orders: r.orders, amount: round(r.amount) }));
}

// Per-SKU units + net + COGS for line items whose title matches a pattern.
async function skuStats(pattern, start, end) {
  return (await p.$queryRaw`
    SELECT li.title,
      SUM(li.quantity)::int AS units,
      SUM(li."lineSubtotal")::float AS gross,
      SUM(li."lineSubtotal" - li."lineDiscountAmount")::float AS net,
      SUM(li."estimatedCostAmount")::float AS cogs
    FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${STORE} AND o."cancelledAt" IS NULL AND o.test = false
      AND li.title ILIKE ${pattern}
      AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY li.title ORDER BY units DESC`).map((r) => ({
      title: r.title, units: r.units, gross: round(r.gross), net: round(r.net), cogs: round(r.cogs),
      contribution: round(r.net - r.cogs)
    }));
}

// Weekly units for a SKU pattern (to see the restock inflection for 702).
async function weeklyUnits(pattern, start, end) {
  return (await p.$queryRaw`
    SELECT date_trunc('week', o."createdAt")::date AS week, SUM(li.quantity)::int AS units,
           SUM(li."lineSubtotal" - li."lineDiscountAmount")::float AS net
    FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${STORE} AND o."cancelledAt" IS NULL AND o.test = false
      AND li.title ILIKE ${pattern}
      AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY 1 ORDER BY 1`).map((r) => ({ week: String(r.week).slice(0, 10), units: r.units, net: round(r.net) }));
}

function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

try {
  console.log(`# decision-backtest A/B/C · store ${STORE} · ${new Date().toISOString()}`);

  // ── A · LOVE 20% sitewide (Tu B'Av) — 11-day before/during/after ──────
  console.log("\n## A · LOVE 20% sitewide — before(10-20 Jul) / during(21-31 Jul) / after(1-11 Aug)");
  const A = {
    before: await windowStats(d("2026-07-10"), d("2026-07-21")),
    during: await windowStats(d("2026-07-21"), d("2026-08-01")),
    after: await windowStats(d("2026-08-01"), d("2026-08-12"))
  };
  J({ A_windows: A });
  J({ A_LOVE_usage_during: await couponUsage("LOVE", d("2026-07-21"), d("2026-08-01")) });
  J({ A_all_coupons_during: await topCoupons(d("2026-07-21"), d("2026-08-01")) });
  console.log("READ: incremental only if DURING net/contribution rose above BEFORE by more than the LOVE ₪ given away, and AFTER didn't collapse (pull-forward).");

  // ── B · INTENSE 50 (NEW50 20% + PAZ) — monthly + coupon attach ────────
  console.log("\n## B · INTENSE 50 — NEW50 + PAZ usage vs INTENSE 50 sales (Jul, Aug)");
  for (const [label, s, e] of [["Jul", d("2026-07-01"), d("2026-08-01")], ["Aug", d("2026-08-01"), d("2026-09-01")]]) {
    J({ B_month: label, intense50_skus: await skuStats("%INTENSE 50%", s, e),
        NEW50: await couponUsage("NEW50", s, e), NEW50_alt: await couponUsage("50NEW", s, e),
        PAZ: await couponUsage("PAZ", s, e) });
  }
  console.log("READ: if NEW50+PAZ orders are a large share of INTENSE 50 units with flat month-over-month units, the discount likely funded demand that would have happened anyway. INCREMENTALITY NOT PROVEN unless there is a discount-off control period.");

  // ── C · RECETTE 702 10% on restock — weekly velocity + coupon attach ──
  console.log("\n## C · RECETTE 702 — weekly units May–Aug (restock inflection) + 702 coupon attach");
  J({ C_702_weekly: await weeklyUnits("%702%", d("2026-05-01"), d("2026-09-01")) });
  J({ C_702_skus_JulAug: await skuStats("%702%", d("2026-07-01"), d("2026-09-01")) });
  J({ C_702_coupon_Jul: await couponUsage("702", d("2026-07-01"), d("2026-08-01")),
      C_702_coupon_Aug: await couponUsage("702", d("2026-08-01"), d("2026-09-01")) });
  console.log("READ: hypothesis '702 didn't need the 10%' is SUPPORTED only if pre-stockout velocity was strong AND post-restock units spiked regardless AND a large share of 702 units used coupon 702 (₪ given away without a matching incremental lift).");

  // ── Context: verified COGS coverage (are contribution figures trustworthy?) ──
  const [cov] = await p.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE li."estimatedCostAmount" > 0)::int AS lines_with_cost,
      COUNT(*)::int AS lines_total,
      SUM(li."lineSubtotal") FILTER (WHERE li."estimatedCostAmount" > 0)::float AS rev_with_cost,
      SUM(li."lineSubtotal")::float AS rev_total
    FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
    WHERE li."storeId" = ${STORE} AND o."cancelledAt" IS NULL AND o.test = false
      AND o."createdAt" >= ${d("2026-07-01")} AND o."createdAt" < ${d("2026-09-01")}`;
  J({ cogs_coverage_JulAug: {
    lines_with_cost: cov.lines_with_cost, lines_total: cov.lines_total,
    revenue_cost_coverage_pct: cov.rev_total ? Math.round((cov.rev_with_cost / cov.rev_total) * 100) : 0
  }});
  console.log("READ: if revenue_cost_coverage_pct is low, treat every 'contribution' number above as directional, not exact — the PROFIT verdict weakens accordingly.");
} finally {
  await p.$disconnect();
}
