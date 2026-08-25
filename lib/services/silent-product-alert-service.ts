// Products-gone-silent detection (F-004, detector 3).
//
// "Lost revenue from something that was already proven to sell": a product
// with a real, sustained sales history that suddenly went quiet. The most
// common causes are the boring ones — went out of stock, was unpublished,
// dropped off the campaign — and each is money the store already knew how
// to make.
//
// Math (as of now):
//   baseline window  = 90 days ending 14 days ago  → expected daily rate
//   recent window    = last 14 days                → actual
//   flag when baseline ≥ MIN_BASELINE_DAILY and actual ≤ 25% of expected
//
// The alert names the likely cause it can SEE (stock at zero, no live
// campaign link) instead of assigning the owner homework.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";
import { getActiveCampaignsByProduct } from "@/lib/services/campaign-product-link-service";

const RECENT_DAYS = 14;
const BASELINE_DAYS = 90;
// A product must have averaged at least this much per day over the baseline
// to qualify — filters out long-tail SKUs whose "silence" is just noise.
const MIN_BASELINE_DAILY = 25; // ₪/day ≈ ₪2,250 per 90d
const SILENCE_RATIO = 0.25; // recent must be ≤ 25% of expected to flag
const DETECTOR = "silent-product-alert-service";
const TYPE = "product_gone_silent";

export interface SilentProductAlertResult {
  fired: number;
  resolved: number;
}

export interface SilentProductOffender {
  productId: string;
  title: string;
  baselineDaily: number;
  expectedRecent: number;
  actualRecent: number;
  lostEstimate: number;
  stock: number | null;
  status: string | null;
  liveCampaignNames: string[];
}

/**
 * The detection itself, shared by the alert engine AND the Leak Scan leg —
 * one definition of "gone silent", two surfaces.
 */
export async function computeSilentProducts(storeId: string): Promise<SilentProductOffender[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const now = Date.now();
  const recentStart = new Date(now - RECENT_DAYS * 86_400_000);
  const baselineStart = new Date(now - (RECENT_DAYS + BASELINE_DAYS) * 86_400_000);

  const groupFor = (gte: Date, lt?: Date) =>
    db.orderLineItem.groupBy({
      by: ["productId"],
      where: {
        storeId,
        productId: { not: null },
        order: {
          createdAt: lt ? { gte, lt } : { gte },
          cancelledAt: null,
          test: false
        }
      },
      _sum: { quantity: true, lineSubtotal: true, lineDiscountAmount: true }
    }) as Promise<
      Array<{
        productId: string | null;
        _sum: { quantity: number | null; lineSubtotal: unknown; lineDiscountAmount: unknown };
      }>
    >;

  const [baselineRows, recentRows] = await Promise.all([
    groupFor(baselineStart, recentStart),
    groupFor(recentStart)
  ]);

  const net = (r: { _sum: { lineSubtotal: unknown; lineDiscountAmount: unknown } }) =>
    Math.max(0, toNumber(r._sum.lineSubtotal) - toNumber(r._sum.lineDiscountAmount));

  const recentByProduct = new Map<string, number>();
  for (const r of recentRows) {
    if (r.productId) recentByProduct.set(r.productId, net(r));
  }

  interface Offender {
    productId: string;
    baselineDaily: number;
    expectedRecent: number;
    actualRecent: number;
    lostEstimate: number;
  }
  const offenders: Offender[] = [];
  for (const r of baselineRows) {
    if (!r.productId) continue;
    const baselineDaily = net(r) / BASELINE_DAYS;
    if (baselineDaily < MIN_BASELINE_DAILY) continue;
    const expectedRecent = baselineDaily * RECENT_DAYS;
    const actualRecent = recentByProduct.get(r.productId) ?? 0;
    if (actualRecent > expectedRecent * SILENCE_RATIO) continue;
    offenders.push({
      productId: r.productId,
      baselineDaily,
      expectedRecent,
      actualRecent,
      lostEstimate: Math.max(0, expectedRecent - actualRecent)
    });
  }
  offenders.sort((a, b) => b.lostEstimate - a.lostEstimate);

  // Context: title, status, stock, live campaign links — so the caller can
  // state the visible cause.
  const products = (await db.product.findMany({
    where: { id: { in: offenders.map((o) => o.productId) } },
    select: {
      id: true,
      title: true,
      status: true,
      variants: { select: { inventoryQuantity: true } }
    }
  })) as Array<{
    id: string;
    title: string;
    status: string | null;
    variants: Array<{ inventoryQuantity: number | null }>;
  }>;
  const productById = new Map(products.map((p) => [p.id, p]));
  const campaignsByProduct = await getActiveCampaignsByProduct(storeId).catch(
    () => new Map<string, never[]>()
  );

  const enriched: SilentProductOffender[] = [];
  for (const o of offenders) {
    const product = productById.get(o.productId);
    if (!product) continue;
    let stock: number | null = null;
    for (const v of product.variants) {
      if (v.inventoryQuantity != null) stock = (stock ?? 0) + v.inventoryQuantity;
    }
    enriched.push({
      productId: o.productId,
      title: product.title,
      baselineDaily: o.baselineDaily,
      expectedRecent: o.expectedRecent,
      actualRecent: o.actualRecent,
      lostEstimate: o.lostEstimate,
      stock,
      status: product.status,
      liveCampaignNames: (campaignsByProduct.get(o.productId) ?? []).map(
        (c: { campaignName: string }) => c.campaignName
      )
    });
  }
  return enriched;
}

export async function upsertSilentProductAlerts(
  storeId: string
): Promise<SilentProductAlertResult> {
  const offenders = await computeSilentProducts(storeId);

  const keepFingerprints: string[] = [];
  for (const o of offenders) {
    const fingerprint = `${TYPE}:${o.productId}`;
    keepFingerprints.push(fingerprint);

    const unpublished = o.status != null && o.status.toUpperCase() !== "ACTIVE";
    const cause =
      o.stock != null && o.stock <= 0
        ? "המוצר אזל מהמלאי — זה הגורם."
        : unpublished
          ? `המוצר במצב "${o.status}" בShopify — הוא לא זמין לקנייה.`
          : o.liveCampaignNames.length === 0
            ? "המלאי קיים אבל אין קמפיין פעיל שמקושר למוצר — ייתכן שפשוט הפסיק לקבל תנועה."
            : `המלאי קיים וקמפיין ${o.liveCampaignNames.map((c) => `"${c}"`).join(", ")} עדיין רץ — שווה לבדוק את עמוד המוצר והמחיר.`;

    const action =
      o.stock != null && o.stock <= 0
        ? `להזמין מלאי ל"${o.title}" — לפי הקצב ההיסטורי הוא מייצר כ־₪${Math.round(o.baselineDaily).toLocaleString("en-US")} ביום.`
        : unpublished
          ? `להחזיר את "${o.title}" לזמינות בShopify.`
          : `להחזיר תנועה ל"${o.title}": קמפיין ממוקד או הבלטה בדף הבית — המוצר כבר הוכיח שהוא מוכר.`;

    await upsertAlert({
      storeId,
      type: TYPE,
      fingerprint,
      severity: o.lostEstimate >= 3000 ? "high" : "medium",
      source: "Calculated",
      detectedBy: DETECTOR,
      title: `"${o.title}" — מוצר שמכר טוב והשתתק`,
      description:
        `ב־${BASELINE_DAYS} הימים שקדמו הוא מכר בממוצע ₪${Math.round(o.baselineDaily).toLocaleString("en-US")} ביום; ` +
        `ב־${RECENT_DAYS} הימים האחרונים נמכרו רק ₪${Math.round(o.actualRecent).toLocaleString("en-US")} ` +
        `(צפוי לפי הקצב: ₪${Math.round(o.expectedRecent).toLocaleString("en-US")}). ` +
        `הכנסה שהוחמצה בינתיים: כ־₪${Math.round(o.lostEstimate).toLocaleString("en-US")}. ${cause}`,
      recommendedAction: action,
      metricName: "silent_product_lost_revenue",
      currentValue: o.lostEstimate,
      relatedEntityType: "product",
      relatedEntityId: o.productId,
      payloadJson: {
        baselineDaily: o.baselineDaily,
        expectedRecent: o.expectedRecent,
        actualRecent: o.actualRecent,
        lostEstimate: o.lostEstimate,
        stock: o.stock,
        status: o.status,
        liveCampaigns: o.liveCampaignNames
      },
      periodLabel: `${RECENT_DAYS} ימים מול ${BASELINE_DAYS} ימי בסיס`
    }).catch((err) => {
      console.error("[silent-product] alert upsert failed:", err);
    });
  }

  const swept = await resolveStaleAlerts({
    storeId,
    detectedBy: DETECTOR,
    type: TYPE,
    keepFingerprints
  }).catch(() => ({ resolved: 0 }));

  return { fired: keepFingerprints.length, resolved: swept.resolved };
}
