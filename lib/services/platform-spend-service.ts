// Per-platform spend vs income (F-077), broken down by brand.
//
// The owner's core question, stated verbatim in QA: "for each platform we
// spent money on I want to see how much we spent and how much we made —
// according to the dates we chose." Follow-up (23 Sep 2026): "divide it by
// brand so I can see how much each brand spent and how much income Meta
// created." So every platform row now carries one sub-row per brand in the
// selection, and the platform row is the sum of its connected brands.
//
// Connectivity is decided PER BRAND from the real integrations:
//   Meta Ads      — MetaAdsConnection row for the store
//   Google Ads    — PlatformConnection(googleAds) with a selected customer
//   Influencers   — an AffiliateProgram on the store
//   Flashy        — no connector yet
// A brand that is not connected renders as "not connected", never as zero:
// an absent platform must read as "not measured" (F-077a).

import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";
import { GOOGLE_ADS_PLATFORM } from "@/lib/services/google-ads-service";

export type PlatformKey = "meta" | "influencers" | "google_ads" | "flashy";

export interface PlatformBrandRow {
  storeId: string;
  storeName: string;
  connected: boolean;
  spend: number;
  attributedRevenue: number;
  net: number;
  roas: number | null;
}

export interface PlatformSpendRow {
  platform: PlatformKey;
  label: { he: string; en: string };
  // True when at least one brand in the selection is connected.
  connected: boolean;
  spend: number;
  // Revenue the platform itself attributes to the spend. Basis differs per
  // platform and is stated in `attributionNote` on screen — never let the
  // reader guess what a number means.
  attributedRevenue: number;
  net: number;
  roas: number | null;
  attributionNote: { he: string; en: string };
  // One entry per brand in the selection, in the order given.
  brands: PlatformBrandRow[];
}

export interface PlatformSpendReport {
  rows: PlatformSpendRow[];
  totalSpend: number;
  totalAttributedRevenue: number;
}

interface Totals {
  spend: number;
  revenue: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function brandRows(
  stores: Array<{ storeId: string; name: string }>,
  connected: Set<string>,
  totals: Map<string, Totals>
): PlatformBrandRow[] {
  return stores.map((store) => {
    const t = totals.get(store.storeId) ?? { spend: 0, revenue: 0 };
    const spend = round(t.spend);
    const revenue = round(t.revenue);
    return {
      storeId: store.storeId,
      storeName: store.name,
      connected: connected.has(store.storeId),
      spend,
      attributedRevenue: revenue,
      net: round(revenue - spend),
      roas: spend > 0 ? revenue / spend : null
    };
  });
}

function platformRow(
  platform: PlatformKey,
  label: PlatformSpendRow["label"],
  attributionNote: PlatformSpendRow["attributionNote"],
  brands: PlatformBrandRow[]
): PlatformSpendRow {
  const connectedBrands = brands.filter((b) => b.connected);
  const spend = round(connectedBrands.reduce((sum, b) => sum + b.spend, 0));
  const revenue = round(connectedBrands.reduce((sum, b) => sum + b.attributedRevenue, 0));
  return {
    platform,
    label,
    connected: connectedBrands.length > 0,
    spend,
    attributedRevenue: revenue,
    net: round(revenue - spend),
    roas: spend > 0 ? revenue / spend : null,
    attributionNote,
    brands
  };
}

export async function buildPlatformSpendReport(input: {
  stores: Array<{ storeId: string; name: string }>;
  start: Date;
  end: Date;
}): Promise<PlatformSpendReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getDb() as any;
  const { stores, start, end } = input;
  const storeIds = stores.map((s) => s.storeId);

  const [metaRows, metaConnections, googleRows, googleConnections, affiliateRows, affiliatePrograms] = await Promise.all([
    db.metaAdsCampaignInsight.findMany({
      where: { storeId: { in: storeIds }, level: "campaign", dateStart: { gte: start, lte: end } },
      select: { storeId: true, spend: true, purchaseRoas: true }
    }) as Promise<Array<{ storeId: string; spend: unknown; purchaseRoas: unknown }>>,
    db.metaAdsConnection.findMany({
      where: { storeId: { in: storeIds } },
      select: { storeId: true }
    }) as Promise<Array<{ storeId: string }>>,
    db.googleAdsCampaignInsight.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds }, date: { gte: start, lte: end } },
      _sum: { spend: true, conversionsValue: true }
    }) as Promise<Array<{ storeId: string; _sum: { spend: unknown; conversionsValue: unknown } }>>,
    db.platformConnection.findMany({
      where: { storeId: { in: storeIds }, platform: GOOGLE_ADS_PLATFORM, status: "connected" },
      select: { storeId: true, config: true }
    }) as Promise<Array<{ storeId: string; config: { customerId?: string } | null }>>,
    db.affiliateAttribution.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds }, occurredAt: { gte: start, lte: end } },
      _sum: { commissionAmount: true, salesAmount: true }
    }) as Promise<Array<{ storeId: string; _sum: { commissionAmount: unknown; salesAmount: unknown } }>>,
    db.affiliateProgram.findMany({
      where: { storeId: { in: storeIds } },
      select: { storeId: true }
    }) as Promise<Array<{ storeId: string }>>
  ]);

  // Meta: revenue = Σ(roas × spend) over daily campaign rows — roas varies
  // per day, so the raw rows are needed, not a groupBy.
  const metaTotals = new Map<string, Totals>();
  for (const row of metaRows) {
    const t = metaTotals.get(row.storeId) ?? { spend: 0, revenue: 0 };
    const spend = toNumber(row.spend);
    t.spend += spend;
    const roas = row.purchaseRoas == null ? null : toNumber(row.purchaseRoas);
    if (roas != null && Number.isFinite(roas)) t.revenue += roas * spend;
    metaTotals.set(row.storeId, t);
  }
  const metaConnected = new Set(metaConnections.map((c) => c.storeId));

  const googleTotals = new Map<string, Totals>();
  for (const row of googleRows) {
    googleTotals.set(row.storeId, { spend: toNumber(row._sum.spend), revenue: toNumber(row._sum.conversionsValue) });
  }
  // Connected only once a customer (ad account) has been picked — an OAuth
  // login without a selected customer syncs nothing.
  const googleConnected = new Set(googleConnections.filter((c) => Boolean(c.config?.customerId)).map((c) => c.storeId));

  const affiliateTotals = new Map<string, Totals>();
  for (const row of affiliateRows) {
    affiliateTotals.set(row.storeId, {
      spend: toNumber(row._sum.commissionAmount),
      revenue: toNumber(row._sum.salesAmount)
    });
  }
  const affiliateConnected = new Set(affiliatePrograms.map((p) => p.storeId));

  const rows: PlatformSpendRow[] = [
    platformRow(
      "meta",
      { he: "Meta Ads (פייסבוק/אינסטגרם)", en: "Meta Ads (Facebook/Instagram)" },
      {
        he: "הכנסה לפי ייחוס Meta (ROAS × הוצאה) — נדיב יותר מייחוס לפי הזמנות בפועל",
        en: "Revenue per Meta's own attribution (ROAS × spend) — more generous than order-level attribution"
      },
      brandRows(stores, metaConnected, metaTotals)
    ),
    platformRow(
      "google_ads",
      { he: "Google Ads", en: "Google Ads" },
      {
        he: "הכנסה לפי ערך ההמרות ש־Google מייחס לקמפיינים הממומנים — מופרד מאורגני, הוצאה לא מיוחסת להכנסה אורגנית",
        en: "Revenue per Google's conversion value on paid campaigns — kept separate from organic so spend never claims organic revenue"
      },
      brandRows(stores, googleConnected, googleTotals)
    ),
    platformRow(
      "influencers",
      { he: "משפיעניות ושותפים", en: "Influencers & affiliates" },
      {
        he: "הוצאה = עמלות שנצברו · הכנסה = מכירות משויכות לקודים/קישורים של שותפים",
        en: "Spend = commissions accrued · revenue = sales attributed to affiliate codes/links"
      },
      brandRows(stores, affiliateConnected, affiliateTotals)
    ),
    platformRow(
      "flashy",
      { he: "Flashy (SMS ואימייל)", en: "Flashy (SMS & email)" },
      {
        he: "לא מחובר — נדרש חיבור Flashy API לעלויות שליחה ולהכנסה משויכת",
        en: "Not connected — needs the Flashy API for send costs and attributed revenue"
      },
      brandRows(stores, new Set(), new Map())
    )
  ];

  const connectedRows = rows.filter((r) => r.connected);
  return {
    rows,
    totalSpend: round(connectedRows.reduce((sum, r) => sum + r.spend, 0)),
    totalAttributedRevenue: round(connectedRows.reduce((sum, r) => sum + r.attributedRevenue, 0))
  };
}
