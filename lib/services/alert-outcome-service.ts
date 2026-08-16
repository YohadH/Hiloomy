// Alert outcome measurement — closes the loop on every recommendation.
//
// THE move that makes the report feel like an operating system instead of
// a static export. Last week's "🚩 reorder RECETTE 702" becomes next
// week's "✅ You reordered RECETTE 702 → now selling ₪3.2k/wk again."
//
// Data model: we reuse the existing Alert table as the recommendation
// ledger. No schema change needed — the alert already carries:
//   • status: open | acknowledged | resolved | ignored (lifecycle)
//   • resolvedAt + resolvedBy (when the founder acted)
//   • recommendedAction (what we told them to do)
//   • payloadJson (engine-specific context)
//   • relatedEntityType + relatedEntityId (what the action was about)
//
// We extend this by writing back into payloadJson under a new `outcome`
// key after the founder marks an alert resolved. Outcomes are measured 3-7
// days after resolution (configurable) so we let the action's effect land
// before grading it.
//
// Per-type outcome semantics:
//   restock_hero      → did the product sell after resolution? Units +
//                       revenue in the N days after resolvedAt for the
//                       related product. "Win" if revenue > 0.
//   stockout_imminent → did inventory recover (reorder landed)? Did the
//                       product actually OOS? "Win" if no OOS happened.
//   roas_collapse     → did the campaign's ROAS recover above the band?
//                       Was budget cut? "Win" if ROAS returned >= band
//                       OR spend was materially reduced.
//
// Outputs:
//   measureOutcomesForResolvedAlerts() — measurement pass. Idempotent;
//     skips alerts whose outcome was already measured.
//   getRecentlyResolvedWithOutcomes() — reader for renderers (Command
//     Center, weekly PDF, offline-status narrative).

import { getDb } from "@/lib/server/db";

export interface AlertOutcome {
  measuredAt: string; // ISO timestamp when the outcome was computed
  // "win" = the action worked. "neutral" = no clear signal yet.
  // "miss" = the action didn't help (e.g. campaign still bleeding).
  // "no_data" = we couldn't measure (e.g. metric is null).
  verdict: "win" | "neutral" | "miss" | "no_data";
  // 1-sentence Hebrew + English copy ready to drop into a report.
  summary: { he: string; en: string };
  // Type-specific numeric snapshot — what we measured. Renderer can drill
  // in if it wants, but most surfaces just use `summary`.
  detail?: Record<string, unknown>;
}

export interface ResolvedAlertWithOutcome {
  id: string;
  type: string;
  severity: string;
  title: string;
  recommendedAction: string;
  resolvedAt: Date;
  resolvedBy: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  outcome: AlertOutcome;
}

const DEFAULT_MEASUREMENT_DELAY_DAYS = 3; // wait at least this long after resolution
const DEFAULT_OUTCOME_LOOKBACK_DAYS = 14; // surface outcomes from this far back

// Run a measurement pass — finds resolved alerts that don't have an
// outcome yet, computes one, and writes it back to payloadJson.
//
// Safe to invoke on every Command Center load and at the start of the
// weekly bundle build — idempotent (skips already-measured) and cheap
// (one query per alert type, plus per-alert measurement which is bounded
// by how many alerts the founder actually closes).
export async function measureOutcomesForResolvedAlerts(input: {
  storeId: string;
  measurementDelayDays?: number;
}): Promise<{ measured: number; skipped: number }> {
  const db = getDb();
  const delay = input.measurementDelayDays ?? DEFAULT_MEASUREMENT_DELAY_DAYS;
  const measurableBefore = new Date();
  measurableBefore.setUTCDate(measurableBefore.getUTCDate() - delay);

  // Pull alerts that are resolved, old enough to measure, AND don't yet
  // have an outcome in their payloadJson. We do the "no outcome yet"
  // filter in-memory because Prisma can't query inside Json columns
  // portably; volume is small.
  const candidates = (await db.alert.findMany({
    where: {
      storeId: input.storeId,
      status: "resolved",
      resolvedAt: { lte: measurableBefore, not: null }
    },
    orderBy: { resolvedAt: "desc" },
    take: 100 // backstop; we don't want to fire 1000 measurements at once
  })) as any[];

  let measured = 0;
  let skipped = 0;

  for (const alert of candidates) {
    const payload = (alert.payloadJson ?? {}) as Record<string, any>;
    if (payload.outcome) {
      skipped += 1;
      continue;
    }
    const outcome = await computeOutcome({
      storeId: input.storeId,
      alert,
      payload
    }).catch((err) => {
      console.error(`[alert-outcome] failed to compute for ${alert.id}:`, err);
      return null;
    });
    if (!outcome) {
      skipped += 1;
      continue;
    }
    payload.outcome = outcome;
    await db.alert.update({
      where: { id: alert.id },
      data: { payloadJson: payload as any }
    }).catch((err: unknown) => {
      console.error(`[alert-outcome] write failed for ${alert.id}:`, err);
    });
    measured += 1;
  }

  return { measured, skipped };
}

// Reader for renderers. Returns resolved alerts (most-recent first) with
// their measured outcomes. Skips alerts that haven't been measured yet.
export async function getRecentlyResolvedWithOutcomes(input: {
  storeId: string;
  lookbackDays?: number;
  limit?: number;
}): Promise<ResolvedAlertWithOutcome[]> {
  const db = getDb();
  const lookback = input.lookbackDays ?? DEFAULT_OUTCOME_LOOKBACK_DAYS;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - lookback);

  const rows = (await db.alert.findMany({
    where: {
      storeId: input.storeId,
      status: "resolved",
      resolvedAt: { gte: since }
    },
    orderBy: { resolvedAt: "desc" },
    take: (input.limit ?? 10) * 3 // overshoot — many won't have outcomes yet
  })) as any[];

  const withOutcomes: ResolvedAlertWithOutcome[] = [];
  for (const row of rows) {
    const payload = (row.payloadJson ?? {}) as Record<string, any>;
    if (!payload.outcome) continue;
    withOutcomes.push({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      recommendedAction: row.recommendedAction ?? row.suggestedAction ?? "",
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      outcome: payload.outcome as AlertOutcome
    });
    if (withOutcomes.length >= (input.limit ?? 10)) break;
  }
  return withOutcomes;
}

// ── Type-specific outcome measurers ────────────────────────────────────

async function computeOutcome(input: {
  storeId: string;
  alert: any;
  payload: Record<string, any>;
}): Promise<AlertOutcome | null> {
  const { alert } = input;
  switch (alert.type) {
    case "restock_hero":
      return measureRestockHeroOutcome(input);
    case "stockout_imminent":
      return measureStockoutImminentOutcome(input);
    case "roas_collapse":
      return measureRoasCollapseOutcome(input);
    default:
      return null;
  }
}

// Restock-hero outcome: revenue + units in the days following resolution.
// If revenue > 0 we treat it as a win — the action worked, the SKU is
// back in the catalog selling. If zero, "miss" (founder marked done but
// nothing's selling — either inventory still off or demand cooled).
async function measureRestockHeroOutcome(input: {
  storeId: string;
  alert: any;
}): Promise<AlertOutcome> {
  const db = getDb();
  const { alert } = input;
  const productId = alert.relatedEntityId as string | null;
  if (!productId) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "no_data",
      summary: { he: "אין מזהה מוצר לבדיקת תוצאה.", en: "No product id to measure." }
    };
  }
  const since = alert.resolvedAt as Date;
  // Pull refundedQuantity + refundedSubtotal alongside the raw totals so
  // the "win" verdict reflects NET sales (post-refund) — otherwise the
  // ledger claims success on orders that bounced.
  const agg = (await db.orderLineItem.aggregate({
    where: {
      storeId: input.storeId,
      productId,
      order: {
        storeId: input.storeId,
        createdAt: { gte: since },
        cancelledAt: null,
        test: false
      }
    },
    _sum: {
      quantity: true,
      lineSubtotal: true,
      refundedQuantity: true,
      refundedSubtotal: true
    }
  })) as any;
  const units = Math.max(
    Number(agg._sum.quantity ?? 0) - Number(agg._sum.refundedQuantity ?? 0),
    0
  );
  const revenue = Math.max(
    Number(agg._sum.lineSubtotal ?? 0) - Number(agg._sum.refundedSubtotal ?? 0),
    0
  );
  const title = alert.title as string;
  // Strip "חזר למלאי" etc. from the original title to get a clean product name
  const productName = (alert.payloadJson?.sku as string) || title;
  if (revenue > 0) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "win",
      summary: {
        he: `${title} → ${units} יחידות, ₪${Math.round(revenue).toLocaleString("en-US")} מאז שטיפלתם בזה.`,
        en: `${productName} → ${units} units, ₪${Math.round(revenue).toLocaleString("en-US")} since you closed this.`
      },
      detail: { units, revenue }
    };
  }
  return {
    measuredAt: new Date().toISOString(),
    verdict: "miss",
    summary: {
      he: `${title} → 0 מכירות מאז שטיפלתם בזה — בדקו שהמלאי באמת זמין ושיש קמפיין פעיל.`,
      en: `${productName} → 0 sales since you closed this — check inventory is actually live and a campaign is running.`
    },
    detail: { units: 0, revenue: 0 }
  };
}

// Stockout-imminent outcome: did inventory recover? Did it actually go OOS?
async function measureStockoutImminentOutcome(input: {
  storeId: string;
  alert: any;
}): Promise<AlertOutcome> {
  const db = getDb();
  const { alert } = input;
  const productId = alert.relatedEntityId as string | null;
  if (!productId) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "no_data",
      summary: { he: "אין מזהה מוצר.", en: "No product id." }
    };
  }
  const since = alert.resolvedAt as Date;
  // Current inventory (sum across variants)
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      title: true,
      variants: { select: { inventoryQuantity: true } }
    }
  });
  if (!product) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "no_data",
      summary: { he: "המוצר לא נמצא.", en: "Product not found." }
    };
  }
  let currentInventory = 0;
  for (const v of product.variants) {
    if (v.inventoryQuantity != null) currentInventory += v.inventoryQuantity;
  }
  // Did it sell since resolution?
  // Subtract refundedQuantity so the "reorder worked" verdict isn't
  // claimed against units that got returned.
  const agg = (await db.orderLineItem.aggregate({
    where: {
      storeId: input.storeId,
      productId,
      order: {
        storeId: input.storeId,
        createdAt: { gte: since },
        cancelledAt: null,
        test: false
      }
    },
    _sum: { quantity: true, refundedQuantity: true }
  })) as any;
  const unitsSold = Math.max(
    Number(agg._sum.quantity ?? 0) - Number(agg._sum.refundedQuantity ?? 0),
    0
  );
  // Threshold logic: if we've got stock AND we're selling, the reorder
  // worked. If inventory still zero and we missed sales → miss. Otherwise
  // neutral (couldn't tell).
  const inventoryAtAlert = Number(alert.payloadJson?.currentInventory ?? 0);
  if (currentInventory > inventoryAtAlert && unitsSold > 0) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "win",
      summary: {
        he: `${product.title} → מלאי הוגדל ל-${currentInventory} ונמכרו ${unitsSold} יחידות. ההזמנה הצליחה.`,
        en: `${product.title} → restocked to ${currentInventory}, sold ${unitsSold} units since. Reorder worked.`
      },
      detail: { currentInventory, unitsSold }
    };
  }
  if (currentInventory <= 0) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "miss",
      summary: {
        he: `${product.title} → המוצר אזל במלאי. ${unitsSold} יחידות נמכרו לפני הסיום. החמצנו הזדמנות.`,
        en: `${product.title} → product went OOS. ${unitsSold} units sold before stockout. Missed opportunity.`
      },
      detail: { currentInventory, unitsSold }
    };
  }
  return {
    measuredAt: new Date().toISOString(),
    verdict: "neutral",
    summary: {
      he: `${product.title} → מלאי נוכחי ${currentInventory}, ${unitsSold} יחידות נמכרו. לא ברור אם בוצעה הזמנה.`,
      en: `${product.title} → inventory ${currentInventory}, sold ${unitsSold} since. Reorder status unclear.`
    },
    detail: { currentInventory, unitsSold }
  };
}

// ROAS-collapse outcome: did the campaign recover, or was budget cut?
async function measureRoasCollapseOutcome(input: {
  storeId: string;
  alert: any;
}): Promise<AlertOutcome> {
  const db = getDb();
  const { alert } = input;
  const campaignId = alert.relatedEntityId as string | null;
  if (!campaignId) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "no_data",
      summary: { he: "אין מזהה קמפיין.", en: "No campaign id." }
    };
  }
  const since = alert.resolvedAt as Date;
  // Aggregate the campaign's Insights rows since resolution.
  const agg = (await db.metaAdsCampaignInsight.aggregate({
    where: {
      storeId: input.storeId,
      campaignId,
      level: "campaign",
      dateStart: { gte: since }
    },
    _sum: { spend: true, purchases: true }
  })) as any;
  const spend = Number(agg._sum.spend ?? 0);
  const purchases = Number(agg._sum.purchases ?? 0);
  // Average ROAS would be more accurate but we don't store per-row revenue;
  // approximate: did spend drop materially (founder reduced budget) OR
  // did purchases per day rise (creative swap worked)?
  const spendAtAlert = Number(alert.payloadJson?.spend ?? 0);
  const campaignName = (alert.payloadJson?.campaignName as string) ?? alert.title;
  // If the campaign basically stopped spending → founder pulled the plug.
  // We treat this as a "win" (the recommendation was to cut/halve).
  if (spend < spendAtAlert * 0.3) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "win",
      summary: {
        he: `${campaignName} → תקציב נחתך (${Math.round(spend).toLocaleString("en-US")} מאז במקום ${Math.round(spendAtAlert).toLocaleString("en-US")} בעבר). מנעת דימום נוסף.`,
        en: `${campaignName} → spend cut (₪${Math.round(spend).toLocaleString("en-US")} since vs ₪${Math.round(spendAtAlert).toLocaleString("en-US")} prior). Bleeding stopped.`
      },
      detail: { spend, purchases, spendAtAlert }
    };
  }
  // Still spending — did purchases per ₪1k spend recover?
  const purchasesPerK = spend > 0 ? (purchases / spend) * 1000 : 0;
  if (purchases > 0 && purchasesPerK > 1) {
    return {
      measuredAt: new Date().toISOString(),
      verdict: "win",
      summary: {
        he: `${campaignName} → ${purchases} רכישות מאז (${purchasesPerK.toFixed(1)} לאלף ₪). יעילות חזרה.`,
        en: `${campaignName} → ${purchases} purchases since (${purchasesPerK.toFixed(1)} per ₪1k). Efficiency recovered.`
      },
      detail: { spend, purchases, purchasesPerK }
    };
  }
  return {
    measuredAt: new Date().toISOString(),
    verdict: "miss",
    summary: {
      he: `${campaignName} → המשך הוצאה (${Math.round(spend).toLocaleString("en-US")}) עם ${purchases} רכישות. כדאי לעצור באמת.`,
      en: `${campaignName} → spend continued (₪${Math.round(spend).toLocaleString("en-US")}) with only ${purchases} purchases. Time to actually pause.`
    },
    detail: { spend, purchases, spendAtAlert }
  };
}
