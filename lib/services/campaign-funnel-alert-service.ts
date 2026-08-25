// Campaign-funnel disconnect detection (F-013, example 2).
//
// "The ad worked, the funnel didn't": a campaign that keeps earning real
// clicks while producing ZERO purchases is not an ad problem — it's a
// landing page, price, stock, or checkout problem, and pausing the ad is
// the wrong fix. This engine flags the disconnect and, when the campaign
// is tagged with products (CampaignProductLink), checks their stock so the
// alert can name the likely culprit instead of assigning homework.
//
// Detection bar (trailing 7 days, campaign level):
//   spend  ≥ ₪300      — real money, not noise
//   clicks ≥ 80        — the ad demonstrably reached and moved people
//   purchases == 0     — and none of them bought
//
// One alert per campaign, stable fingerprint, stale sweep on every run.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import {
  upsertAlert,
  resolveStaleAlerts
} from "@/lib/services/alert-writer-service";

const WINDOW_DAYS = 7;
const MIN_SPEND = 300;
const MIN_CLICKS = 80;
const DETECTOR = "campaign-funnel-alert-service";
const TYPE = "campaign_no_conversion";

export interface CampaignFunnelAlertResult {
  fired: number;
  resolved: number;
}

export async function upsertCampaignFunnelAlerts(
  storeId: string
): Promise<CampaignFunnelAlertResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = (await db.metaAdsCampaignInsight.groupBy({
    by: ["campaignId", "campaignName"],
    where: { storeId, level: "campaign", dateStart: { gte: since } },
    _sum: { spend: true, clicks: true, linkClicks: true, addToCart: true, purchases: true }
  })) as Array<{
    campaignId: string;
    campaignName: string;
    _sum: {
      spend: unknown;
      clicks: number | null;
      linkClicks: number | null;
      addToCart: number | null;
      purchases: number | null;
    };
  }>;

  // Merge rename-duplicates by campaignId.
  const byId = new Map<
    string,
    { name: string; spend: number; clicks: number; addToCart: number; purchases: number }
  >();
  for (const r of rows) {
    const acc = byId.get(r.campaignId) ?? { name: r.campaignName, spend: 0, clicks: 0, addToCart: 0, purchases: 0 };
    acc.name = r.campaignName;
    acc.spend += toNumber(r._sum.spend);
    acc.clicks += Math.max(Number(r._sum.clicks ?? 0), Number(r._sum.linkClicks ?? 0));
    acc.addToCart += Number(r._sum.addToCart ?? 0);
    acc.purchases += Number(r._sum.purchases ?? 0);
    byId.set(r.campaignId, acc);
  }

  const offenders = [...byId.entries()].filter(
    ([, c]) => c.spend >= MIN_SPEND && c.clicks >= MIN_CLICKS && c.purchases === 0
  );

  // Product context: linked products + their stock, so the alert can point
  // at the likely break instead of "go check things".
  const linkedProducts = (await db.campaignProductLink.findMany({
    where: { storeId, campaignId: { in: offenders.map(([id]) => id) } },
    select: {
      campaignId: true,
      product: {
        select: {
          id: true,
          title: true,
          variants: { select: { inventoryQuantity: true } }
        }
      }
    }
  })) as Array<{
    campaignId: string;
    product: { id: string; title: string; variants: Array<{ inventoryQuantity: number | null }> };
  }>;
  const productsByCampaign = new Map<string, Array<{ title: string; stock: number | null }>>();
  for (const link of linkedProducts) {
    let stock: number | null = null;
    for (const v of link.product.variants) {
      if (v.inventoryQuantity != null) stock = (stock ?? 0) + v.inventoryQuantity;
    }
    const list = productsByCampaign.get(link.campaignId) ?? [];
    list.push({ title: link.product.title, stock });
    productsByCampaign.set(link.campaignId, list);
  }

  const keepFingerprints: string[] = [];
  for (const [campaignId, c] of offenders) {
    const fingerprint = `${TYPE}:${campaignId}`;
    keepFingerprints.push(fingerprint);
    const products = productsByCampaign.get(campaignId) ?? [];
    const oosProducts = products.filter((p) => p.stock != null && p.stock <= 0);

    const productNote =
      oosProducts.length > 0
        ? ` המוצרים המקושרים ${oosProducts.map((p) => `"${p.title}"`).join(", ")} אזלו מהמלאי — זה כנראה הגורם.`
        : products.length > 0
          ? ` מוצרים מקושרים: ${products.map((p) => `"${p.title}"`).join(", ")} (במלאי).`
          : " הקמפיין לא מקושר למוצרים — קשרו אותו בהגדרות כדי שנוכל לבדוק מלאי ועמוד מוצר אוטומטית.";

    const action =
      oosProducts.length > 0
        ? `השהו את הקמפיין "${c.name}" עד שהמלאי חוזר, או הסיטו אותו למוצר זמין — הקליקים משולמים ואין מה לקנות.`
        : `אל תכבו את המודעה — היא עובדת. בדקו את הצד שלכם: עמוד הנחיתה נטען? המחיר תואם למודעה? המלאי זמין? הצ'קאאוט תקין בנייד?`;

    await upsertAlert({
      storeId,
      type: TYPE,
      fingerprint,
      // Money burning with proven interest and zero return = act today.
      severity: c.spend >= 1000 ? "critical" : "high",
      source: "Calculated",
      detectedBy: DETECTOR,
      title: `"${c.name}" — הקליקים מגיעים אבל אף אחד לא קונה`,
      description:
        `בשבעת הימים האחרונים: ₪${Math.round(c.spend).toLocaleString("en-US")} הוצאה, ` +
        `${c.clicks.toLocaleString("en-US")} קליקים, ${c.addToCart} הוספות לסל — ו־0 רכישות. ` +
        `המודעה עשתה את שלה; משהו אחרי הקליק שובר את המכירה.${productNote}`,
      recommendedAction: action,
      metricName: "campaign_purchases_7d",
      currentValue: 0,
      relatedEntityType: "campaign",
      relatedEntityId: campaignId,
      payloadJson: {
        campaignName: c.name,
        spend: c.spend,
        clicks: c.clicks,
        addToCart: c.addToCart,
        linkedProducts: products,
        windowDays: WINDOW_DAYS
      },
      periodLabel: `${WINDOW_DAYS} ימים אחרונים`
    }).catch((err) => {
      console.error("[campaign-funnel] alert upsert failed:", err);
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
