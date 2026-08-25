// Per-platform spend vs income (F-077).
//
// The owner's core question, stated verbatim in QA: "for each platform we
// spent money on I want to see how much we spent and how much we made —
// according to the dates we chose." This rolls up every store in the
// selection to one row per platform.
//
// Connected today: Meta Ads (insights) and Influencers/affiliates
// (commissions + attributed sales). Google Ads and Flashy (SMS/email)
// appear as explicit NOT-CONNECTED rows — an absent platform must read as
// "not measured", never as "spent nothing" (F-077a). Their connectors are
// separate integrations pending API credentials.

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";

export type PlatformKey = "meta" | "influencers" | "google_ads" | "flashy";

export interface PlatformSpendRow {
  platform: PlatformKey;
  label: { he: string; en: string };
  connected: boolean;
  spend: number;
  // Revenue the platform itself attributes to the spend. Basis differs per
  // platform and is stated in `attributionNote` on screen — never let the
  // reader guess what a number means.
  attributedRevenue: number;
  net: number;
  roas: number | null;
  attributionNote: { he: string; en: string };
}

export interface PlatformSpendReport {
  rows: PlatformSpendRow[];
  totalSpend: number;
  totalAttributedRevenue: number;
}

export async function buildPlatformSpendReport(input: {
  storeIds: string[];
  start: Date;
  end: Date;
}): Promise<PlatformSpendReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const { storeIds, start, end } = input;

  const [metaRows, affiliateAgg] = await Promise.all([
    db.metaAdsCampaignInsight.findMany({
      where: {
        storeId: { in: storeIds },
        level: "campaign",
        dateStart: { gte: start, lte: end }
      },
      select: { spend: true, purchaseRoas: true }
    }) as Promise<Array<{ spend: unknown; purchaseRoas: unknown }>>,
    db.affiliateAttribution.aggregate({
      where: { storeId: { in: storeIds }, occurredAt: { gte: start, lte: end } },
      _sum: { commissionAmount: true, salesAmount: true }
    }) as Promise<{ _sum: { commissionAmount: unknown; salesAmount: unknown } }>
  ]);

  let metaSpend = 0;
  let metaRevenue = 0;
  for (const row of metaRows) {
    const spend = toNumber(row.spend);
    metaSpend += spend;
    const roas = row.purchaseRoas == null ? null : toNumber(row.purchaseRoas);
    if (roas != null && Number.isFinite(roas)) metaRevenue += roas * spend;
  }

  const affiliateSpend = toNumber(affiliateAgg._sum.commissionAmount);
  const affiliateRevenue = toNumber(affiliateAgg._sum.salesAmount);

  const round = (n: number) => Math.round(n * 100) / 100;
  const rows: PlatformSpendRow[] = [
    {
      platform: "meta",
      label: { he: "Meta Ads (פייסבוק/אינסטגרם)", en: "Meta Ads (Facebook/Instagram)" },
      connected: true,
      spend: round(metaSpend),
      attributedRevenue: round(metaRevenue),
      net: round(metaRevenue - metaSpend),
      roas: metaSpend > 0 ? metaRevenue / metaSpend : null,
      attributionNote: {
        he: "הכנסה לפי ייחוס Meta (ROAS × הוצאה) — נדיב יותר מייחוס לפי הזמנות בפועל",
        en: "Revenue per Meta's own attribution (ROAS × spend) — more generous than order-level attribution"
      }
    },
    {
      platform: "influencers",
      label: { he: "משפיעניות ושותפים", en: "Influencers & affiliates" },
      connected: true,
      spend: round(affiliateSpend),
      attributedRevenue: round(affiliateRevenue),
      net: round(affiliateRevenue - affiliateSpend),
      roas: affiliateSpend > 0 ? affiliateRevenue / affiliateSpend : null,
      attributionNote: {
        he: "הוצאה = עמלות שנצברו · הכנסה = מכירות משויכות לקודים/קישורים של שותפים",
        en: "Spend = commissions accrued · revenue = sales attributed to affiliate codes/links"
      }
    },
    {
      platform: "google_ads",
      label: { he: "Google Ads", en: "Google Ads" },
      connected: false,
      spend: 0,
      attributedRevenue: 0,
      net: 0,
      roas: null,
      attributionNote: {
        he: "לא מחובר — נדרש חיבור Google Ads API. חשוב: ממומן יופרד מאורגני כדי לא לייחס הוצאה להכנסה אורגנית",
        en: "Not connected — needs the Google Ads API. Important: paid will be kept separate from organic so spend never claims organic revenue"
      }
    },
    {
      platform: "flashy",
      label: { he: "Flashy (SMS ואימייל)", en: "Flashy (SMS & email)" },
      connected: false,
      spend: 0,
      attributedRevenue: 0,
      net: 0,
      roas: null,
      attributionNote: {
        he: "לא מחובר — נדרש חיבור Flashy API לעלויות שליחה ולהכנסה משויכת",
        en: "Not connected — needs the Flashy API for send costs and attributed revenue"
      }
    }
  ];

  return {
    rows,
    totalSpend: round(metaSpend + affiliateSpend),
    totalAttributedRevenue: round(metaRevenue + affiliateRevenue)
  };
}
