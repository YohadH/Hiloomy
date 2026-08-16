// Stockout-imminent detection engine.
//
// The forward-looking counterpart to restock-hero. Instead of reacting to a
// product coming back in stock, this engine projects when each product will
// RUN OUT at its current sales pace and flags products about to hit zero.
// This is the most preventable lost-revenue alert in the whole app: an OOS
// on a hero product can cost more in a week than the founder makes from
// any single ad campaign.
//
// Math:
//   trailing_14_day_units / 14 = daily_velocity
//   current_inventory / daily_velocity = days_to_stockout
//
// Tiers:
//   0-7   days  → critical  (reorder today)
//   8-14  days  → high      (reorder this week)
//   15-30 days  → medium    (plan reorder this month)
//   30+   days  → healthy   (no alert)
//
// Filters:
//   - Skip products with zero historical velocity (irrelevant)
//   - Skip products with currentInventory = null (untracked — can't reason)
//   - Skip products with currentInventory <= 0 ALREADY (that's a different
//     alert — and the restock engine will pick it up when stock returns)
//   - Skip very-low-revenue products (< ₪500 trailing 14-day revenue) — we
//     don't want to spam the founder about every long-tail SKU running out.
//     The threshold is intentionally low so anything earning real money
//     surfaces; tune via `MIN_TRAILING_REVENUE`.

import { getDb } from "@/lib/server/db";
import {
  upsertAlert,
  resolveStaleAlerts,
  type AlertSeverity
} from "@/lib/services/alert-writer-service";

export interface StockoutFlag {
  productId: string;
  shopifyProductId: string;
  title: string;
  sku: string | null;
  currentInventory: number;
  dailyVelocity: number;
  daysToStockout: number;
  trailingRevenue: number;
  trailingUnits: number;
  severity: AlertSeverity;
  suggestedReorder: { he: string; en: string };
}

export interface StockoutImminentReport {
  flags: StockoutFlag[];
  productsConsidered: number;
  productsSkippedNoVelocity: number;
  productsSkippedNoInventory: number;
  // Snapshot age — null if no sync has ever run. UI uses this to warn
  // the founder that the underlying inventory numbers may be stale, and
  // the report builder DOWNGRADES alert severity by one tier when the
  // snapshot is older than INVENTORY_STALE_HOURS — a "10 days to OOS"
  // claim against 5-day-old data is really "5 days" and shouldn't read
  // as critical without that caveat.
  inventorySyncedAt: string | null;
  inventoryStaleHours: number | null;
  inventoryIsStale: boolean;
}

// Beyond this age, stockout forecasts are downgraded and the UI shows a
// staleness warning. Set to ~2× the data-refresh cron interval (currently
// 2h) so a single missed cron tick doesn't trigger the warning, but a
// failed/disabled cron does.
const INVENTORY_STALE_HOURS = 6;

export interface BuildStockoutImminentInput {
  storeId: string;
  // The report window's end date — anchors the trailing 14-day velocity
  // calculation. Defaults to "now" if omitted.
  asOf?: Date;
}

const VELOCITY_WINDOW_DAYS = 14;
const MIN_TRAILING_REVENUE = 500; // ₪ — skip long-tail products
const HEALTHY_THRESHOLD_DAYS = 30;

export async function buildStockoutImminentReport(
  input: BuildStockoutImminentInput
): Promise<StockoutImminentReport> {
  const db = getDb();
  const asOf = input.asOf ?? new Date();
  const windowEnd = new Date(asOf);
  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - VELOCITY_WINDOW_DAYS);

  // How fresh is the inventory snapshot we're about to forecast off?
  // Shopify's product.updated_at doesn't bump for inventory-only changes,
  // so the only signal that our cached `ProductVariant.inventoryQuantity`
  // is current is the timestamp of the last full product re-sync — which
  // the data-refresh cron runs every 2h. If that cron is disabled or
  // failing, the inventory we're forecasting against could be days old.
  const connection = await db.shopifyConnection.findFirst({
    where: { storeId: input.storeId },
    select: { lastProductsSyncAt: true }
  });
  const inventorySyncedAt = connection?.lastProductsSyncAt ?? null;
  const inventoryStaleHours = inventorySyncedAt
    ? Math.max(0, (asOf.getTime() - inventorySyncedAt.getTime()) / (60 * 60 * 1000))
    : null;
  const inventoryIsStale =
    inventoryStaleHours === null || inventoryStaleHours > INVENTORY_STALE_HOURS;

  // Step 1 — aggregate the last 14 days of orders per product. We pull
  // (productId, units sold, revenue) for everything that sold even once
  // in the window. Anything that didn't sell has zero velocity → skipped.
  const sold = (await db.orderLineItem.groupBy({
    by: ["productId"],
    where: {
      storeId: input.storeId,
      productId: { not: null },
      order: {
        storeId: input.storeId,
        createdAt: { gte: windowStart, lte: windowEnd },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { quantity: true, lineSubtotal: true, refundedSubtotal: true }
  })) as any[];

  const candidates = sold
    .map((row: any) => ({
      productId: row.productId as string,
      units: Number(row._sum.quantity ?? 0),
      revenue:
        Number(row._sum.lineSubtotal ?? 0) - Number(row._sum.refundedSubtotal ?? 0)
    }))
    .filter((r) => r.units > 0 && r.revenue >= MIN_TRAILING_REVENUE);

  let skippedNoVelocity = sold.length - candidates.length;

  if (candidates.length === 0) {
    return {
      flags: [],
      productsConsidered: sold.length,
      productsSkippedNoVelocity: skippedNoVelocity,
      productsSkippedNoInventory: 0,
      inventorySyncedAt: inventorySyncedAt ? inventorySyncedAt.toISOString() : null,
      inventoryStaleHours,
      inventoryIsStale
    };
  }

  // Step 2 — fetch product metadata + variant inventory totals.
  interface ProductWithInventory {
    id: string;
    shopifyProductId: string;
    title: string;
    variants: Array<{ sku: string | null; inventoryQuantity: number | null }>;
  }
  const candidateIds = candidates.map((c) => c.productId);
  const products = (await db.product.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true,
      shopifyProductId: true,
      title: true,
      variants: { select: { sku: true, inventoryQuantity: true } }
    }
  })) as unknown as ProductWithInventory[];
  const byId = new Map<string, ProductWithInventory>(products.map((p) => [p.id, p]));

  const flags: StockoutFlag[] = [];
  let skippedNoInventory = 0;

  for (const c of candidates) {
    const product = byId.get(c.productId);
    if (!product) continue;

    // Total tracked inventory across variants. We treat null as "untracked"
    // (separate from zero) so we don't alert on missing data.
    let inventoryTotal = 0;
    let hasAnyTrackedVariant = false;
    for (const v of product.variants) {
      if (v.inventoryQuantity != null) {
        inventoryTotal += v.inventoryQuantity;
        hasAnyTrackedVariant = true;
      }
    }
    if (!hasAnyTrackedVariant) {
      skippedNoInventory += 1;
      continue;
    }
    if (inventoryTotal <= 0) {
      // Already OOS — that's a different alert (and restock engine handles
      // the come-back). We don't double-flag here.
      continue;
    }

    const dailyVelocity = c.units / VELOCITY_WINDOW_DAYS;
    if (dailyVelocity <= 0) continue;
    const daysToStockout = inventoryTotal / dailyVelocity;
    if (daysToStockout > HEALTHY_THRESHOLD_DAYS) continue;

    // Base severity tier from the forecasted days-to-stockout.
    let severity: AlertSeverity =
      daysToStockout <= 7 ? "critical" : daysToStockout <= 14 ? "high" : "medium";
    // Stale inventory snapshot → downgrade one tier. A "critical" claim
    // built on inventory we last saw N hours ago is dishonest; surface
    // it as high or medium so the founder still sees it but understands
    // it's not real-time. The freshness banner on the page makes this
    // explicit to the user.
    if (inventoryIsStale) {
      severity = severity === "critical" ? "high" : severity === "high" ? "medium" : "low";
    }

    const sku = product.variants.find((v) => v.sku)?.sku ?? null;
    const reorderUnits = Math.max(
      Math.ceil(dailyVelocity * 30), // 30 days of cover at current pace
      10 // minimum batch
    );

    flags.push({
      productId: product.id,
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      sku,
      currentInventory: inventoryTotal,
      dailyVelocity,
      daysToStockout,
      trailingRevenue: c.revenue,
      trailingUnits: c.units,
      severity,
      suggestedReorder: {
        he:
          severity === "critical"
            ? `יוצא ממלאי בעוד ${daysToStockout.toFixed(1)} ימים. לבצע הזמנה היום של ~${reorderUnits} יחידות (30 ימי כיסוי).`
            : `יוצא ממלאי בעוד ${daysToStockout.toFixed(1)} ימים. כדאי להזמין השבוע ~${reorderUnits} יחידות (30 ימי כיסוי).`,
        en:
          severity === "critical"
            ? `Stocks out in ${daysToStockout.toFixed(1)} days — reorder today, ~${reorderUnits} units (30-day cover).`
            : `Stocks out in ${daysToStockout.toFixed(1)} days — plan a reorder this week, ~${reorderUnits} units (30-day cover).`
      }
    });
  }

  // Most urgent first.
  flags.sort((a, b) => a.daysToStockout - b.daysToStockout);

  // Push to alert table + sweep stale.
  const writtenFingerprints: string[] = [];
  for (const f of flags) {
    const fp = `stockout_imminent:${f.productId}`;
    writtenFingerprints.push(fp);
    await upsertAlert({
      storeId: input.storeId,
      type: "stockout_imminent",
      fingerprint: fp,
      severity: f.severity,
      source: "Shopify",
      detectedBy: "stockout-imminent-service",
      title: `${f.title} עומד להיגמר במלאי`,
      description: `מלאי נוכחי: ${f.currentInventory} · קצב מכירה יומי: ${f.dailyVelocity.toFixed(1)} · יוצא ממלאי בעוד ${f.daysToStockout.toFixed(1)} ימים · הכנסה ב14 ימים: ₪${Math.round(f.trailingRevenue).toLocaleString("en-US")}.`,
      recommendedAction: f.suggestedReorder.he,
      metricName: "days_to_stockout",
      currentValue: f.daysToStockout,
      relatedEntityType: "product",
      relatedEntityId: f.productId,
      payloadJson: {
        shopifyProductId: f.shopifyProductId,
        sku: f.sku,
        currentInventory: f.currentInventory,
        dailyVelocity: f.dailyVelocity,
        daysToStockout: f.daysToStockout,
        trailingRevenue: f.trailingRevenue,
        trailingUnits: f.trailingUnits,
        suggestedReorder: f.suggestedReorder
      },
      periodLabel: `Trailing ${VELOCITY_WINDOW_DAYS}d → ${windowEnd.toISOString().slice(0, 10)}`
    }).catch((err) => {
      console.error("[stockout-imminent] alert-writer upsert failed:", err);
    });
  }
  await resolveStaleAlerts({
    storeId: input.storeId,
    detectedBy: "stockout-imminent-service",
    type: "stockout_imminent",
    keepFingerprints: writtenFingerprints
  }).catch((err) => {
    console.error("[stockout-imminent] alert-writer sweep failed:", err);
  });

  return {
    flags,
    productsConsidered: sold.length,
    productsSkippedNoVelocity: skippedNoVelocity,
    productsSkippedNoInventory: skippedNoInventory,
    inventorySyncedAt: inventorySyncedAt ? inventorySyncedAt.toISOString() : null,
    inventoryStaleHours,
    inventoryIsStale
  };
}
